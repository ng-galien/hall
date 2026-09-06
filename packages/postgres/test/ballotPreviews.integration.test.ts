import { expect, it } from "vitest";
import { PostgresCouncil, type PostgresCouncilRequest } from "../src/council.js";
import { PostgresDirectory } from "../src/directory.js";
import { PostgresMinutes } from "../src/minutes.js";
import { createTestPool, postgresDescribe, useFreshHallDatabase } from "./support/database.js";

postgresDescribe("reviewed ballot confirmation", () => {
  const pool = createTestPool();
  const council = new PostgresCouncil(pool);
  const directory = new PostgresDirectory(pool);
  useFreshHallDatabase(pool);
  const request: PostgresCouncilRequest = {
    role: "hall_api_authenticated",
    context: { requestId: "preview-test", actorId: "clerk", councilMemberId: null, roles: ["administrator"] },
  };
  async function fixture() {
    await directory.configureActiveCouncilTerm(request, 3);
    const members = [];
    for (const firstName of ["Chair", "Second", "Third"]) {
      const contact = await directory.createContact(request, {
        firstName,
        lastName: "Member",
        organizationName: null,
        jobTitle: null,
        email: null,
        phone: null,
        notes: "",
      });
      members.push(
        await directory.createCouncilMember(request, {
          contactId: contact.id,
          role: "councillor",
          termStartedOn: "2020-01-01",
        }),
      );
    }
    const meeting = await council.provisionInitialMeeting(request, {});
    await council.prepareMeeting(request, {
      id: meeting.id,
      scheduledAt: "2026-01-01T09:00:00Z",
      location: "Chamber",
      chairMemberId: members[0].id,
      secretaryMemberId: members[0].id,
    });
    await council.recordAttendance(
      request,
      meeting.id,
      members.map((member) => ({ councilMemberId: member.id, status: "present" as const })),
    );
    await council.recordMeetingMembership(request, meeting.id, {
      observedAt: "2026-01-01T09:00:00Z",
      sourceReference: "Confirmed nominal mandates",
      memberIds: members.map((m) => m.id),
    });
    const business = await council.createBusiness(request, {
      path: "seed",
      name: "Reviewed decision",
      reportName: "Report",
      reportContent: "",
    });
    const item = await council.scheduleDecisionProposal(request, {
      councilMeetingId: meeting.id,
      councilBusinessId: business.id,
      position: 1,
    });
    await council.startMeeting(request, { id: meeting.id, startedAt: "2026-01-01T09:00:00Z" });
    await council.startAgendaItem(request, { agendaItemId: item.id, startedAt: "2026-01-01T09:01:00Z" });
    const attendance = await council.listAttendance(request, meeting.id);
    const candidate = {
      procedure: "ordinaryMajority" as const,
      mode: "public" as const,
      participantAttendanceIds: attendance.map((a) => a.id),
      chairmanAttendanceId: attendance.find((a) => a.councilMemberId === members[0].id)!.id,
      votes: attendance.map((a) => ({ meetingAttendanceId: a.id, choice: "approve" as const })),
      nonParticipations: [],
    };
    return { meeting, item, members, candidate };
  }
  it("decodes authoritative preview, audits confirmation and retains reviewed votes and conduct in minutes", async () => {
    const { meeting, item, candidate } = await fixture();
    const preview = await council.createBallotResultPreview(request, { agendaItemId: item.id, candidate });
    expect(preview).toMatchObject({
      revision: 1,
      canConfirm: true,
      calculation: { result: "approve", expressedCount: 3, participantCount: 3 },
    });
    expect(await council.listBallots(request, meeting.id)).toEqual([]);
    expect(await council.openBallotResultPreview(request, preview.id)).toEqual(preview);
    const ballot = await council.confirmBallotResultPreview(request, preview.id);
    expect(ballot).toMatchObject({ result: "approve", agendaItemId: item.id });
    expect(ballot.completedAt).not.toBeNull();
    expect((await council.openBallotResultPreview(request, preview.id))?.canConfirm).toBe(false);
    const closure = await council.close(request, { id: meeting.id, closedAt: new Date().toISOString() });
    const minutes = await new PostgresMinutes(pool).open(request, closure.minutes.id);
    expect(minutes?.facts.conduct.quorumObservations).toHaveLength(2);
    expect(minutes?.facts.ballots[0].votes).toHaveLength(3);
    expect(minutes?.facts.ballots[0].nonParticipations).toEqual([]);
    expect(
      (
        await pool.query(
          "SELECT action FROM hall.audit_event WHERE action IN ('ballot.preview','ballot.confirm') ORDER BY occurred_at",
        )
      ).rows.map((r) => r.action),
    ).toEqual(["ballot.preview", "ballot.confirm"]);
  });
  it("serializes two actual confirmations and produces exactly one finalized ballot", async () => {
    const { meeting, item, candidate } = await fixture();
    const preview = await council.createBallotResultPreview(request, { agendaItemId: item.id, candidate });
    const first = await pool.connect(),
      second = await pool.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await first.query("BEGIN");
      await first.query("SET LOCAL hall.actor_id='first-clerk'");
      await first.query("SELECT hall_api.confirm_ballot_result_preview($1)", [preview.id]);
      const firstPid = (await first.query("SELECT pg_backend_pid() pid")).rows[0].pid;
      const secondPid = (await second.query("SELECT pg_backend_pid() pid")).rows[0].pid;
      await second.query("SET hall.actor_id='second-clerk'");
      pending = second.query("SELECT hall_api.confirm_ballot_result_preview($1)", [preview.id]).then(
        () => null,
        (error) => error,
      );
      let blocked = false;
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        blocked = (await pool.query("SELECT $1::int=ANY(pg_blocking_pids($2::int)) blocked", [firstPid, secondPid]))
          .rows[0].blocked;
        if (blocked) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      await first.query("COMMIT");
      expect(await pending).toMatchObject({ code: "HV418" });
      expect(await council.listBallots(request, meeting.id)).toHaveLength(1);
      expect((await pool.query("SELECT count(*)::int n FROM hall.votes")).rows[0].n).toBe(3);
    } finally {
      await first.query("ROLLBACK");
      await pending;
      first.release();
      second.release();
    }
  });
});
