import { expect, it } from "vitest";
import { PostgresCouncil, type PostgresCouncilRequest } from "../src/council.js";
import { createTestPool, postgresDescribe, useFreshHallDatabase } from "./support/database.js";

postgresDescribe("prepared subjects and atomic insertion", () => {
  const pool = createTestPool();
  const council = new PostgresCouncil(pool);
  useFreshHallDatabase(pool);
  const request: PostgresCouncilRequest = {
    role: "hall_api_authenticated",
    context: { requestId: "prepared-test", actorId: "clerk", councilMemberId: null, roles: ["administrator"] },
  };
  it("quick creation shifts a deprogrammed occurrence instead of colliding with its absolute position", async () => {
    const meeting = await council.provisionInitialMeeting(request, {});
    const first = await council.createAndScheduleOpenQuestion(request, {
      councilMeetingId: meeting.id,
      path: "seed",
      name: "First discussion",
      reportName: "Report",
      reportContent: "",
      position: 1,
    });
    await pool.query("UPDATE hall.council_agenda_item SET position=-1 WHERE id=$1", [first.agendaItem.id]);
    const second = await council.createAndScheduleOpenQuestion(request, {
      councilMeetingId: meeting.id,
      path: "seed",
      name: "Second discussion",
      reportName: "Report",
      reportContent: "",
      position: 1,
    });
    expect(second.agendaItem).toMatchObject({ position: 1, subject: { kind: "openQuestion" } });
    expect(
      (await pool.query("SELECT position FROM hall.council_agenda_item WHERE id=$1", [first.agendaItem.id])).rows[0]
        .position,
    ).toBe(-2);
  });
  it("prepares both natures independently, inserts each subject, shifts and filters only the actual occurrence", async () => {
    const meeting = await council.provisionInitialMeeting(request, {});
    const business = await council.createBusiness(request, {
      path: "seed",
      name: "Road project",
      reportName: "Report",
      reportContent: "Shared evidence",
    });
    const proposal = await council.createPreparedSubject(request, business.id, {
      kind: "councilDecisionProposal",
      name: "Approve road budget",
      content: "Proposed budget",
    });
    const discussion = await council.createPreparedSubject(request, business.id, {
      kind: "openQuestion",
      name: "Discuss access",
      content: "Questions for discussion",
    });
    expect(await council.listAgenda(request, meeting.id)).toEqual([]);
    expect(await council.listPreparedSubjects(request, meeting.id)).toHaveLength(3);
    const later = await council.schedulePreparedSubject(request, meeting.id, {
      subjectId: discussion.id,
      kind: discussion.kind,
      position: 1,
    });
    const first = await council.schedulePreparedSubject(request, meeting.id, {
      subjectId: proposal.id,
      kind: proposal.kind,
      position: 1,
    });
    expect(
      (await council.listAgenda(request, meeting.id)).map((i) => ({
        id: i.id,
        position: i.position,
        title: i.title,
        kind: i.subject.kind,
      })),
    ).toEqual([
      { id: first.id, position: 1, title: "Approve road budget", kind: "councilDecisionProposal" },
      { id: later.id, position: 2, title: "Discuss access", kind: "openQuestion" },
    ]);
    const consultation = await council.schedulePreparedSubject(request, meeting.id, {
      councilBusinessId: business.id,
      kind: "businessConsultation",
      position: 99,
    });
    expect(consultation.position).toBe(2);
    expect(consultation.subject).toEqual({
      kind: "businessConsultation",
      councilBusinessId: business.id,
      reportResourceId: business.reportResourceId,
      content: "Shared evidence",
    });
    expect(first.subject.id).toBe(proposal.id);
    expect(later.subject.id).toBe(discussion.id);
    expect(await council.listPreparedSubjects(request, meeting.id)).toEqual([]);
    expect(await council.listPreparedSubjects(request)).toHaveLength(3);
    await expect(
      council.schedulePreparedSubject(request, meeting.id, {
        subjectId: proposal.id,
        kind: proposal.kind,
        position: 1,
      }),
    ).rejects.toMatchObject({ sqlState: "HV810" });
    await council.scheduleMeeting(request, {
      id: meeting.id,
      scheduledAt: "2026-09-10T10:00:00Z",
      location: "Council chamber",
    });
    await council.freezeAgenda(request, meeting.id);
    expect((await council.openAgendaFreeze(request, meeting.id))?.agenda.map((i) => i.title)).toEqual([
      "Approve road budget",
      "Road project",
      "Discuss access",
    ]);
    expect(await council.listPreparedSubjects(request, meeting.id)).toEqual([]);
    await council.reopenAgenda(request, meeting.id);
    expect((await council.openMeeting(request, meeting.id))?.agendaFrozenAt).toBeNull();
    expect((await pool.query("SELECT count(*)::int n FROM hall.council_agenda_freeze")).rows[0].n).toBe(1);
  });
});
