import type { Pool, QueryResult } from "pg";
import { expect, it } from "vitest";
import { PostgresCouncil, type PostgresCouncilRequest } from "../src/council.js";
import { type PostgresCouncilMember, PostgresDirectory } from "../src/directory.js";
import { PostgresResources } from "../src/resources.js";
import { createTestPool, postgresDescribe, useFreshHallDatabase } from "./support/database.js";
import { prepareMeetingNotice } from "./support/meeting.js";

async function expectBackendBlockedBy(pool: Pool, blockedPid: number, blockerPid: number): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ is_blocked: boolean }>(
      "SELECT $1::integer = ANY(pg_blocking_pids($2::integer)) AS is_blocked",
      [blockerPid, blockedPid],
    );
    if (result.rows[0]?.is_blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`PostgreSQL backend ${blockedPid} was not blocked by ${blockerPid}`);
}

postgresDescribe("PostgreSQL council client", () => {
  const pool = createTestPool();
  const council = new PostgresCouncil(pool);
  const directory = new PostgresDirectory(pool);
  const resources = new PostgresResources(pool);
  useFreshHallDatabase(pool);

  const request: PostgresCouncilRequest = {
    role: "hall_api_authenticated",
    context: {
      requestId: "meeting-request-1",
      actorId: "actor-1",
      contactId: null,
      roles: ["administrator"],
    },
  };

  it("creates, lists and opens a scoped council-business workspace", async () => {
    const created = await council.createBusiness(request, {
      path: "school",
      name: "Canteen",
      reportName: "Main report",
      reportContent: "Initial report",
    });

    expect(created).toEqual({
      id: expect.any(String),
      folderResourceId: expect.any(String),
      reportResourceId: expect.any(String),
    });
    await expect(council.listBusinesses(request)).resolves.toEqual([created]);
    await expect(council.openBusiness(request, created.id)).resolves.toEqual(created);
    await expect(council.openBusiness(request, "10000000-0000-4000-8000-000000000099")).resolves.toBeNull();
    await expect(council.openMeeting(request, "10000000-0000-4000-8000-000000000099")).resolves.toBeNull();

    const audit = await pool.query<{ action: string; target_id: string }>(
      "SELECT action, target_id FROM hall.audit_event WHERE action = 'council-business.create'",
    );
    expect(audit.rows).toEqual([{ action: "council-business.create", target_id: created.id }]);
  });

  it("provisions the initial next meeting exactly once through the PostgreSQL boundary", async () => {
    const provisioned = await council.provisionInitialMeeting(request, {});

    expect(provisioned).toEqual({
      id: expect.any(String),
      number: 1,
      slug: null,
      previousCouncilMeetingId: null,
      reconvocationId: null,
      minutesId: null,
      chairMemberId: null,
      secretaryMemberId: null,
      scheduledAt: null,
      location: null,
      quorum: null,
      startedAt: null,
      closedAt: null,
      agendaFrozenAt: null,
      currentNoticeId: null,
      noticeDeadline: { status: "indeterminate", reason: "scheduleUnknown" },
      stale: false,
      openingBlockers: [
        { code: "meetingNotScheduled" },
        { code: "meetingLocationMissing" },
        { code: "agendaNotFrozen" },
        { code: "currentNoticeMissing" },
      ],
      entryBlockers: [
        { code: "meetingNotScheduled" },
        { code: "meetingLocationMissing" },
        { code: "agendaNotFrozen" },
        { code: "currentNoticeMissing" },
      ],
      closureBlockers: [{ code: "meetingNotStarted" }],
    });
    await expect(council.listMeetings(request)).resolves.toEqual([provisioned]);
    await expect(council.provisionInitialMeeting(request, {})).rejects.toMatchObject({ sqlState: "HV123" });

    const audit = await pool.query<{ action: string; target_id: string }>(
      "SELECT action, target_id FROM hall.audit_event WHERE action = 'meeting.provision-initial'",
    );
    expect(audit.rows).toEqual([{ action: "meeting.provision-initial", target_id: provisioned.id }]);
  });

  it("serializes competing initial meeting provisioning attempts", async () => {
    const attempts = await Promise.allSettled([
      council.provisionInitialMeeting(
        { ...request, context: { ...request.context, requestId: "meeting-provision-a" } },
        {},
      ),
      council.provisionInitialMeeting(
        { ...request, context: { ...request.context, requestId: "meeting-provision-b" } },
        {},
      ),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((attempt) => attempt.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: { sqlState: "HV123" } });
    await expect(council.listMeetings(request)).resolves.toHaveLength(1);
  });

  it("schedules, deprograms and reprograms agenda items through named actions", async () => {
    const meetingId = "10000000-0000-4000-8000-000000000010";
    const business = await council.createBusiness(request, {
      path: "school",
      name: "Library",
      reportName: "Main report",
      reportContent: "Initial report",
    });
    await pool.query("INSERT INTO hall.council_meetings (id) VALUES ($1)", [meetingId]);
    const scheduled = await council.scheduleMeeting(request, {
      id: meetingId,
      scheduledAt: "2026-08-12T09:00:00.000Z",
      location: "Council chamber",
    });
    expect(scheduled).toMatchObject({
      id: meetingId,
      slug: "2026-08-12-001",
      scheduledAt: "2026-08-12T09:00:00+00:00",
      location: "Council chamber",
    });
    await expect(council.listMeetings(request)).resolves.toEqual([scheduled]);
    await expect(council.openMeetingBySlug(request, "2026-08-12-001")).resolves.toEqual(scheduled);

    const decision = await council.scheduleDecisionProposal(request, {
      councilBusinessId: business.id,
      councilMeetingId: meetingId,
      position: 2,
    });
    const question = await council.scheduleOpenQuestion(request, {
      councilBusinessId: business.id,
      councilMeetingId: meetingId,
      position: 3,
    });

    expect(decision).toMatchObject({
      councilBusinessId: business.id,
      councilMeetingId: meetingId,
      position: 2,
      subject: { kind: "councilDecisionProposal", id: expect.any(String) },
    });
    expect(question).toMatchObject({
      councilBusinessId: business.id,
      councilMeetingId: meetingId,
      position: 3,
      subject: { kind: "openQuestion", id: expect.any(String) },
    });

    await expect(
      council.reorderAgenda(request, {
        councilMeetingId: meetingId,
        agendaItemIds: [question.id, decision.id],
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: question.id, position: 2 }),
      expect.objectContaining({ id: decision.id, position: 3 }),
    ]);

    await expect(council.deprogramAgendaItem(request, decision.id)).resolves.toMatchObject({ position: -3 });
    await expect(
      council.reprogramAgendaItem(request, {
        agendaItemId: decision.id,
        councilMeetingId: meetingId,
        position: 4,
      }),
    ).resolves.toMatchObject({ position: 4 });
    await expect(council.listAgenda(request, meetingId)).resolves.toEqual([
      expect.objectContaining({ id: question.id, position: 2 }),
      expect.objectContaining({ id: decision.id, position: 4 }),
    ]);

    const reorderAudit = await pool.query<{ action: string; target_id: string; details: { agendaItemCount: number } }>(
      "SELECT action, target_id, details FROM hall.audit_event WHERE action = 'meeting.agenda.reorder'",
    );
    expect(reorderAudit.rows).toEqual([
      {
        action: "meeting.agenda.reorder",
        target_id: meetingId,
        details: { agendaItemCount: 2 },
      },
    ]);

    const audit = await pool.query<{ action: string; target_id: string }>(
      `SELECT action, target_id
       FROM hall.audit_event
       WHERE target_type = 'agenda-item'
       ORDER BY occurred_at, id`,
    );
    expect(audit.rows).toEqual([
      { action: "agenda-item.schedule-decision-proposal", target_id: decision.id },
      { action: "agenda-item.schedule-open-question", target_id: question.id },
      { action: "agenda-item.deprogram", target_id: decision.id },
      { action: "agenda-item.reprogram", target_id: decision.id },
    ]);
  });

  it("serializes a concurrent agenda reorder with a new placement", async () => {
    const meetingId = "10000000-0000-4000-8000-000000000015";
    const business = await council.createBusiness(request, {
      path: "concurrency",
      name: "Agenda",
      reportName: "Main report",
      reportContent: "Concurrent preparation",
    });
    await pool.query("INSERT INTO hall.council_meetings (id) VALUES ($1)", [meetingId]);
    const first = await council.scheduleOpenQuestion(request, {
      councilBusinessId: business.id,
      councilMeetingId: meetingId,
      position: 2,
    });
    const second = await council.scheduleOpenQuestion(request, {
      councilBusinessId: business.id,
      councilMeetingId: meetingId,
      position: 3,
    });

    const reorderConnection = await pool.connect();
    const placementConnection = await pool.connect();
    let placementPromise: Promise<QueryResult<{ agenda_item_id: string }>> | undefined;
    try {
      await reorderConnection.query("BEGIN");
      await reorderConnection.query("SET LOCAL search_path = hall, public, pg_catalog");
      const reorderPid = (await reorderConnection.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!
        .pid;
      await reorderConnection.query("SELECT reorder_council_agenda($1::uuid, $2::uuid[])", [
        meetingId,
        [second.id, first.id],
      ]);

      await placementConnection.query("BEGIN");
      await placementConnection.query("SET LOCAL search_path = hall, public, pg_catalog");
      const placementPid = (await placementConnection.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!
        .pid;
      placementPromise = placementConnection.query(
        "SELECT schedule_open_question($1::uuid, $2::uuid, $3::integer) AS agenda_item_id",
        [business.id, meetingId, 4],
      );

      await expectBackendBlockedBy(pool, placementPid, reorderPid);
      await reorderConnection.query("COMMIT");
      const placement = await placementPromise;
      expect(placement.rows).toHaveLength(1);
      await placementConnection.query("COMMIT");
    } finally {
      await reorderConnection.query("ROLLBACK").catch(() => undefined);
      await placementPromise?.catch(() => undefined);
      await placementConnection.query("ROLLBACK").catch(() => undefined);
      reorderConnection.release();
      placementConnection.release();
    }

    const agenda = await council.listAgenda(request, meetingId);
    expect(agenda).toHaveLength(3);
    expect(agenda.map((item) => item.position).sort((left, right) => left - right)).toEqual([2, 3, 4]);
    expect(new Set(agenda.map((item) => item.id)).size).toBe(3);
    expect(agenda.map((item) => item.id).slice(0, 2)).toEqual([second.id, first.id]);
  });

  it("starts a meeting whose attendance reaches quorum through a named action", async () => {
    const meetingId = "10000000-0000-4000-8000-000000000020";
    const business = await council.createBusiness(request, {
      path: "questions",
      name: "Public lighting",
      reportName: "Main report",
      reportContent: "Information",
    });
    await directory.configureActiveCouncilTerm(request, 1);
    const contact = await directory.createContact(request, {
      firstName: "Ariane",
      lastName: "Bernard",
      organizationName: null,
      jobTitle: null,
      email: null,
      phone: null,
      notes: "",
    });
    const member = await directory.createCouncilMember(request, {
      contactId: contact.id,
      role: "councillor",
      termStartedOn: "2026-01-01",
    });
    await pool.query("INSERT INTO hall.council_meetings (id) VALUES ($1)", [meetingId]);
    await council.setMeetingOfficers(request, {
      id: meetingId,
      chairMemberId: member.id,
      secretaryMemberId: member.id,
    });
    const agendaItem = await council.scheduleOpenQuestion(request, {
      councilBusinessId: business.id,
      councilMeetingId: meetingId,
      position: 2,
    });

    await council.scheduleMeeting(request, {
      id: meetingId,
      scheduledAt: "2026-08-12T09:00:00.000Z",
      location: "Council chamber",
    });
    await prepareMeetingNotice(council, request, meetingId);
    const opening = await council.recordMeetingOpening(request, {
      id: meetingId,
      observedAt: "2026-08-12T09:05:00.000Z",
      chairMemberId: member.id,
      secretaryMemberId: member.id,
      attendance: [{ councilMemberId: member.id, status: "present" }],
    });
    expect(opening.meeting).toMatchObject({
      id: meetingId,
      scheduledAt: "2026-08-12T09:00:00+00:00",
      location: "Council chamber",
      startedAt: "2026-08-12T09:05:00+00:00",
      closedAt: null,
    });
    const startedAgendaItem = await council.startAgendaItem(request, {
      agendaItemId: agendaItem.id,
      startedAt: "2026-08-12T09:10:00.000Z",
    });
    expect(startedAgendaItem).toMatchObject({ id: agendaItem.id, startedAt: "2026-08-12T09:10:00+00:00" });
    const completedAgendaItem = await council.completeAgendaItem(request, {
      agendaItemId: agendaItem.id,
      completedAt: "2026-08-12T09:20:00.000Z",
    });
    expect(completedAgendaItem).toMatchObject({
      id: agendaItem.id,
      startedAt: "2026-08-12T09:10:00+00:00",
      completedAt: "2026-08-12T09:20:00+00:00",
    });
    await expect(council.openAgendaItem(request, agendaItem.id)).resolves.toEqual(completedAgendaItem);
  });

  it("records an immutable attendance batch and resolves a written proxy by CouncilMember", async () => {
    const meetingId = "10000000-0000-4000-8000-000000000030";
    await directory.configureActiveCouncilTerm(request, 5);
    const members: PostgresCouncilMember[] = [];
    for (const [firstName, lastName] of [
      ["Ariane", "Bernard"],
      ["Bastien", "Collet"],
      ["Claire", "Dubois"],
      ["Dan", "Martin"],
      ["Eva", "Martin"],
    ]) {
      const contact = await directory.createContact(request, {
        firstName,
        lastName,
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
          termStartedOn: "2026-01-01",
        }),
      );
    }
    const proxyDocument = (
      await resources.createDocument(request, {
        path: "proofs",
        name: "proxy.pdf",
        mediaType: "application/pdf",
        content: Buffer.from("written proxy"),
      })
    ).data;
    await pool.query("INSERT INTO hall.council_meetings (id) VALUES ($1)", [meetingId]);

    const declarations = [
      {
        councilMemberId: members[1]!.id,
        status: "represented",
        proxyHolderCouncilMemberId: members[0]!.id,
        proxyDocumentId: proxyDocument.id,
      },
      { councilMemberId: members[0]!.id, status: "present" },
      { councilMemberId: members[2]!.id, status: "excused" },
      { councilMemberId: members[3]!.id, status: "present" },
      { councilMemberId: members[4]!.id, status: "present" },
    ] as const;
    await council.setMeetingOfficers(request, {
      id: meetingId,
      chairMemberId: members[0]!.id,
      secretaryMemberId: members[0]!.id,
    });

    await council.scheduleMeeting(request, {
      id: meetingId,
      scheduledAt: "2026-08-12T09:00:00.000Z",
      location: "Council chamber",
    });
    const business = await council.createBusiness(request, {
      path: "seed",
      name: "Roll call",
      reportName: "Report",
      reportContent: "",
    });
    await council.scheduleOpenQuestion(request, {
      councilBusinessId: business.id,
      councilMeetingId: meetingId,
      position: 1,
    });
    await prepareMeetingNotice(council, request, meetingId);
    await council.recordMeetingOpening(request, {
      id: meetingId,
      observedAt: "2026-08-12T09:05:00.000Z",
      chairMemberId: members[0]!.id,
      secretaryMemberId: members[0]!.id,
      attendance: [...declarations],
    });
    const attendance = await council.listAttendance(request, meetingId);

    expect(attendance).toHaveLength(5);
    expect(attendance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ councilMemberId: members[0]!.id, status: "present" }),
        expect.objectContaining({
          councilMemberId: members[1]!.id,
          status: "represented",
          proxyHolderCouncilMemberId: members[0]!.id,
          proxyDocumentId: proxyDocument.id,
        }),
        expect.objectContaining({ councilMemberId: members[2]!.id, status: "excused" }),
      ]),
    );
    expect(attendance[0]).not.toHaveProperty("proxyHolderAttendanceId");

    await expect(
      council.recordAttendance(
        request,
        meetingId,
        declarations.map((declaration) =>
          declaration.councilMemberId === members[2]!.id
            ? { councilMemberId: declaration.councilMemberId, status: "absent" as const }
            : declaration,
        ),
      ),
    ).rejects.toMatchObject({ sqlState: "HV102" });

    const audit = await pool.query<{ action: string; target_id: string; details: Record<string, never> }>(
      "SELECT action, target_id, details FROM hall.audit_event WHERE action = 'meeting.record-opening'",
    );
    expect(audit.rows).toEqual([
      {
        action: "meeting.record-opening",
        target_id: meetingId,
        details: {},
      },
    ]);
  });

  it("records and completes a public ballot through independently hydrated projections", async () => {
    const meetingId = "10000000-0000-4000-8000-000000000040";
    await directory.configureActiveCouncilTerm(request, 3);
    const members: PostgresCouncilMember[] = [];
    for (const memberNumber of [1, 2, 3]) {
      const contact = await directory.createContact(request, {
        firstName: `Public ${memberNumber}`,
        lastName: "Voter",
        organizationName: null,
        jobTitle: null,
        email: null,
        phone: null,
        notes: "",
      });
      members.push(
        await directory.createCouncilMember(request, {
          contactId: contact.id,
          role: memberNumber === 1 ? "mayor" : "councillor",
          termStartedOn: "2026-01-01",
        }),
      );
    }
    const business = await council.createBusiness(request, {
      path: "ballots",
      name: "Public ballot",
      reportName: "Main report",
      reportContent: "Proposal",
    });
    await pool.query("INSERT INTO hall.council_meetings (id) VALUES ($1)", [meetingId]);
    await council.setMeetingOfficers(request, {
      id: meetingId,
      chairMemberId: members[0]!.id,
      secretaryMemberId: members[0]!.id,
    });
    const agendaItem = await council.scheduleDecisionProposal(request, {
      councilBusinessId: business.id,
      councilMeetingId: meetingId,
      position: 2,
    });
    await council.scheduleMeeting(request, {
      id: meetingId,
      scheduledAt: "2026-08-12T09:00:00.000Z",
      location: "Council chamber",
    });
    await prepareMeetingNotice(council, request, meetingId);
    await council.recordMeetingOpening(request, {
      id: meetingId,
      observedAt: "2026-08-12T09:05:00.000Z",
      chairMemberId: members[0]!.id,
      secretaryMemberId: members[0]!.id,
      attendance: members.map((member) => ({ councilMemberId: member.id, status: "present" as const })),
    });
    const attendance = await council.listAttendance(request, meetingId);
    await council.startAgendaItem(request, {
      agendaItemId: agendaItem.id,
      startedAt: "2026-08-12T09:10:00.000Z",
    });
    const chairmanAttendance = attendance.find((item) => item.councilMemberId === members[0]!.id)!;
    const preview = await council.createBallotResultPreview(request, {
      agendaItemId: agendaItem.id,
      candidate: {
        procedure: "ordinaryMajority",
        mode: "public",
        participantAttendanceIds: attendance.map((a) => a.id),
        votes: attendance.map((a, index) => ({
          meetingAttendanceId: a.id,
          choice: index === 0 ? "reject" : "approve",
        })),
        nonParticipations: [],
      },
    });
    expect(await council.listBallots(request, meetingId)).toEqual([]);
    const ballot = await council.confirmBallotResultPreview(request, preview.id);

    await expect(council.listBallots(request, meetingId)).resolves.toEqual([ballot]);
    await expect(council.openBallot(request, ballot.id)).resolves.toEqual(ballot);
    const participations = await council.listBallotParticipations(request, ballot.id);
    expect(participations).toHaveLength(3);
    expect(participations).toEqual(
      expect.arrayContaining(
        attendance.map((item) =>
          expect.objectContaining({
            ballotId: ballot.id,
            meetingAttendanceId: item.id,
            councilMemberId: item.councilMemberId,
          }),
        ),
      ),
    );
    expect(participations.find((participation) => participation.id === ballot.chairmanParticipationId)).toMatchObject({
      meetingAttendanceId: chairmanAttendance.id,
    });

    const votes = await council.listBallotVotes(request, ballot.id);
    expect(votes).toHaveLength(3);
    expect(votes.every((vote) => vote.mode === "public" && vote.count === 1)).toBe(true);
    await expect(council.listBallotVotes(request, ballot.id)).resolves.toEqual(votes);

    const completed = ballot;
    expect(completed).toMatchObject({
      result: "approve",
      completedAt: expect.any(String),
      resultPreviewId: preview.id,
    });
    await expect(council.openAgendaItem(request, agendaItem.id)).resolves.toMatchObject({
      completedAt: completed.completedAt,
    });
  });

  it("records a secret ballot only as anonymous aggregate choices", async () => {
    const meetingId = "10000000-0000-4000-8000-000000000050";
    await directory.configureActiveCouncilTerm(request, 3);
    const members: PostgresCouncilMember[] = [];
    for (const memberNumber of [1, 2, 3]) {
      const contact = await directory.createContact(request, {
        firstName: `Secret ${memberNumber}`,
        lastName: "Voter",
        organizationName: null,
        jobTitle: null,
        email: null,
        phone: null,
        notes: "",
      });
      members.push(
        await directory.createCouncilMember(request, {
          contactId: contact.id,
          role: memberNumber === 1 ? "mayor" : "councillor",
          termStartedOn: "2026-01-01",
        }),
      );
    }
    const business = await council.createBusiness(request, {
      path: "ballots",
      name: "Secret ballot",
      reportName: "Main report",
      reportContent: "Proposal",
    });
    await pool.query("INSERT INTO hall.council_meetings (id) VALUES ($1)", [meetingId]);
    await council.setMeetingOfficers(request, {
      id: meetingId,
      chairMemberId: members[0]!.id,
      secretaryMemberId: members[0]!.id,
    });
    const agendaItem = await council.scheduleDecisionProposal(request, {
      councilBusinessId: business.id,
      councilMeetingId: meetingId,
      position: 2,
    });
    await council.scheduleMeeting(request, {
      id: meetingId,
      scheduledAt: "2026-08-13T09:00:00.000Z",
      location: "Council chamber",
    });
    await prepareMeetingNotice(council, request, meetingId);
    await council.recordMeetingOpening(request, {
      id: meetingId,
      observedAt: "2026-08-13T09:05:00.000Z",
      chairMemberId: members[0]!.id,
      secretaryMemberId: members[0]!.id,
      attendance: members.map((member) => ({ councilMemberId: member.id, status: "present" as const })),
    });
    const attendance = await council.listAttendance(request, meetingId);
    await council.startAgendaItem(request, {
      agendaItemId: agendaItem.id,
      startedAt: "2026-08-13T09:10:00.000Z",
    });
    const preview = await council.createBallotResultPreview(request, {
      agendaItemId: agendaItem.id,
      candidate: {
        procedure: "ordinaryMajority",
        mode: "secret",
        participantAttendanceIds: attendance.map((a) => a.id),
        totals: { approve: 2, reject: 1, abstain: 0, blank: 0, invalid: 0, nonParticipation: 0 },
      },
    });
    const ballot = await council.confirmBallotResultPreview(request, preview.id);
    const votes = await council.listBallotVotes(request, ballot.id);
    expect(votes).toEqual(
      expect.arrayContaining([
        { mode: "secret", ballotId: ballot.id, choice: "approve", ballotParticipationId: null, count: 2 },
        { mode: "secret", ballotId: ballot.id, choice: "reject", ballotParticipationId: null, count: 1 },
      ]),
    );
    expect(votes).toHaveLength(2);
    const completed = ballot;
    expect(completed).toMatchObject({
      result: "approve",
      completedAt: expect.any(String),
      resultPreviewId: preview.id,
    });
    await expect(council.openAgendaItem(request, agendaItem.id)).resolves.toMatchObject({
      completedAt: completed.completedAt,
    });
  });

  it("validates the scoped closure projection and records the named action", async () => {
    const meetingId = "10000000-0000-4000-8000-000000000001";
    await directory.configureActiveCouncilTerm(request, 1);
    const contact = await directory.createContact(request, {
      firstName: "Camille",
      lastName: "Martin",
      organizationName: null,
      jobTitle: null,
      email: null,
      phone: null,
      notes: "",
    });
    const member = await directory.createCouncilMember(request, {
      contactId: contact.id,
      role: "councillor",
      termStartedOn: "2026-01-01",
    });
    await pool.query(
      "INSERT INTO hall.council_meetings(id,scheduled_at,location) VALUES($1,'2026-09-03 08:30Z','Chamber')",
      [meetingId],
    );
    const business = await council.createBusiness(request, {
      path: "seed",
      name: "Closure",
      reportName: "Report",
      reportContent: "",
    });
    const openingItem = await council.scheduleOpenQuestion(request, {
      councilBusinessId: business.id,
      councilMeetingId: meetingId,
      position: 1,
    });
    await prepareMeetingNotice(council, request, meetingId);
    await council.recordMeetingOpening(request, {
      id: meetingId,
      observedAt: "2026-09-03T09:00:00Z",
      chairMemberId: member.id,
      secretaryMemberId: member.id,
      attendance: [{ councilMemberId: member.id, status: "present" }],
    });

    await council.startAgendaItem(request, { agendaItemId: openingItem.id, startedAt: "2026-09-03T09:05:00Z" });
    await council.completeAgendaItem(request, { agendaItemId: openingItem.id, completedAt: "2026-09-03T09:10:00Z" });
    const closure = await council.close(request, {
      id: meetingId,
      closedAt: "2026-09-03T10:00:00.000Z",
    });

    expect(closure.closedMeeting).toMatchObject({ id: meetingId, closedAt: "2026-09-03T10:00:00+00:00" });
    expect(closure.nextMeeting).toMatchObject({
      number: expect.any(Number),
      previousCouncilMeetingId: meetingId,
      scheduledAt: null,
      location: null,
      quorum: null,
      startedAt: null,
      closedAt: null,
    });
    expect(closure.minutes).toMatchObject({
      id: expect.any(String),
      councilMeetingId: meetingId,
      documentId: null,
    });

    await expect(council.openMeeting(request, closure.nextMeeting.id)).resolves.toEqual(closure.nextMeeting);
    await expect(council.listAgenda(request, closure.nextMeeting.id)).resolves.toEqual([
      expect.objectContaining({
        councilBusinessId: null,
        councilMeetingId: closure.nextMeeting.id,
        position: 1,
        subject: expect.objectContaining({ kind: "minutesApproval" }),
      }),
    ]);

    const audit = await pool.query<{ action: string; target_id: string; details: Record<string, string> }>(
      "SELECT action, target_id, details FROM hall.audit_event WHERE action = 'meeting.close'",
    );
    expect(audit.rows).toEqual([
      {
        action: "meeting.close",
        target_id: meetingId,
        details: {
          nextCouncilMeetingId: closure.nextMeeting.id,
          minutesId: closure.minutes.id,
        },
      },
    ]);
  });

  it("keeps the council surface unavailable to the anonymous database role", async () => {
    await expect(
      council.openMeeting({ ...request, role: "hall_api_anonymous" }, "10000000-0000-4000-8000-000000000099"),
    ).rejects.toMatchObject({ sqlState: "42501" });
  });
});
