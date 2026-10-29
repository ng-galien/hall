import { PostgresCouncil, PostgresDirectory } from "@hall/postgres";
import { createPostgresHttpTestServer, createTestCouncilMember, domainBody } from "../../src/__tests__/testServer.js";

/** A real HTTP/SQL closure with an unfinished question carried to its successor. */
export async function createClosedMeetingWithMinutes() {
  const { agent, pool } = await createPostgresHttpTestServer();
  const context = {
    role: "hall_api_authenticated" as const,
    context: { requestId: "minutes-lifecycle", actorId: "test-clerk", roles: ["administrator"], contactId: null },
  };
  await new PostgresDirectory(pool).configureActiveCouncilTerm(context, 1);
  const member = await createTestCouncilMember(agent, { firstName: "Alice", role: "mayor" });
  const meeting = domainBody<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));
  await agent
    .put(`/api/council-meetings/${meeting.id}/prepare`)
    .send({
      scheduledAt: "2026-09-10T18:30:00+02:00",
      location: "Salle du conseil",
      chairMemberId: member.id,
      secretaryMemberId: member.id,
    })
    .expect(200);
  const business = domainBody<{ id: string }>(
    await agent
      .post("/api/council-business")
      .send({
        path: "conseil",
        name: "Travaux de voirie",
        reportName: "Rapport",
        reportContent: "Programme des travaux",
      })
      .expect(201),
  );
  const subject = domainBody<{ id: string }>(
    await agent
      .post(`/api/council-business/${business.id}/prepared-subjects`)
      .send({ kind: "openQuestion", name: "Travaux de voirie", content: "Discussion à tenir" })
      .expect(201),
  );
  const agendaItem = domainBody<{ id: string }>(
    await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
      .send({ kind: "openQuestion", subjectId: subject.id, position: 1 })
      .expect(201),
  );
  const council = new PostgresCouncil(pool);
  await council.freezeAgenda(context, meeting.id);
  const noticeFacts = await council.noticeFacts(context, meeting.id);
  if (!noticeFacts) throw new Error("Frozen notice facts are required");
  await council.generateNotice(
    context,
    meeting.id,
    { meeting: noticeFacts, issuedOn: null, hall: { name: "Test commune", timeZone: "Europe/Paris" } },
    Buffer.from("%PDF-fixture"),
  );
  await agent
    .post(`/api/council-meetings/${meeting.id}/record-opening`)
    .send({
      observedAt: "2026-09-10T16:30:00Z",
      chairMemberId: member.id,
      secretaryMemberId: member.id,
      attendance: [{ councilMemberId: member.id, status: "present" }],
    })
    .expect(200);
  await agent
    .patch(`/api/council-meetings/${meeting.id}/agenda-items/${agendaItem.id}/notes`)
    .send({ discussionSummary: "Notes prises en séance." })
    .expect(200);
  const closure = domainBody<{
    closedMeeting: { id: string };
    nextMeeting: { id: string };
    minutes: { id: string; generatedAt: string | null };
  }>(
    await agent
      .post(`/api/council-meetings/${meeting.id}/close`)
      .send({ closedAt: "2026-09-10T18:00:00Z" })
      .expect(200),
  );
  return { agent, pool, meeting, business, subject, agendaItem, closure };
}
