import { PostgresCouncil, PostgresDirectory } from "@hall/postgres";
import { describe, expect, it } from "vitest";
import { createPostgresHttpTestServer, createTestCouncilMember, domainBody } from "../../src/__tests__/testServer.js";

async function createNoticedCouncilMeeting() {
  const { agent, pool } = await createPostgresHttpTestServer();
  const context = {
    role: "hall_api_authenticated" as const,
    context: { requestId: "preparation-fixture", actorId: "test-clerk", roles: ["administrator"], contactId: null },
  };
  await new PostgresDirectory(pool).configureActiveCouncilTerm(context, 1);
  const member = await createTestCouncilMember(agent, { firstName: "Alice", role: "mayor" });
  const meeting = domainBody<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));
  await agent.put(`/api/council-meetings/${meeting.id}/prepare`).send({
    scheduledAt: "2026-09-10T18:30:00+02:00", location: "Council chamber",
    chairMemberId: member.id, secretaryMemberId: member.id,
  }).expect(200);
  const business = domainBody<{ id: string }>(await agent.post("/api/council-business").send({
    path: "conseil", name: "Questions diverses", reportName: "Rapport", reportContent: "",
  }).expect(201));
  const subject = domainBody<{ id: string }>(await agent
    .post(`/api/council-business/${business.id}/prepared-subjects`)
    .send({ kind: "openQuestion", name: "Questions diverses", content: "" }).expect(201));
  const item = domainBody<{ id: string }>(await agent
    .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
    .send({ kind: "openQuestion", subjectId: subject.id, position: 1 }).expect(201));
  const council = new PostgresCouncil(pool);
  await council.freezeAgenda(context, meeting.id);
  const facts = await council.noticeFacts(context, meeting.id);
  if (!facts) throw new Error("Frozen notice facts are required");
  await council.generateNotice(context, meeting.id,
    { meeting: facts, issuedOn: null, hall: { name: "Test commune", timeZone: "Europe/Paris" } },
    Buffer.from("%PDF-fixture"));
  return { agent, pool, context, council, member, meeting, item };
}

describe("meeting preparation integration", () => {
  it("does not insert a late decision proposal after questions diverses have started", async () => {
    const { agent, member, meeting, item } = await createNoticedCouncilMeeting();
    await agent.post(`/api/council-meetings/${meeting.id}/record-opening`).send({
      observedAt: "2026-09-10T16:30:00Z", chairMemberId: member.id,
      secretaryMemberId: member.id, attendance: [{ councilMemberId: member.id, status: "present" }],
    }).expect(200);
    await agent.post(`/api/council-meetings/${meeting.id}/agenda-items/${item.id}/start`)
      .send({ startedAt: "2026-09-10T16:31:00Z" }).expect(200);
    const before = domainBody<Array<{ id: string }>>(
      await agent.get(`/api/council-meetings/${meeting.id}/agenda-items`).expect(200),
    );
    const latePath = `/api/council-meetings/${meeting.id}/open-questions`;
    const forbidden = await agent.post(latePath).send({
      kind: "councilDecisionProposal", path: "conseil", name: "Délibération tardive", content: "Texte",
    }).expect(400);
    expect(forbidden.body.code).toBe("invalid_request");
    const after = domainBody<Array<{ id: string }>>(
      await agent.get(`/api/council-meetings/${meeting.id}/agenda-items`).expect(200),
    );
    expect(after.map((entry) => entry.id)).toEqual(before.map((entry) => entry.id));
    const lateQuestion = domainBody<{ subject: { kind: string } }>(await agent.post(latePath).send({
      path: "conseil", name: "Question ajoutée en séance", content: "À discuter",
    }).expect(201));
    expect(lateQuestion.subject.kind).toBe("openQuestion");
  });

  it("reorders, deprograms and reprograms agenda items through the SQL HTTP contract", async () => {
    const { agent, pool } = await createPostgresHttpTestServer();
    const meeting = domainBody<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));
    await agent.put(`/api/council-meetings/${meeting.id}/schedule`).send({
      scheduledAt: "2026-11-12T18:30:00+01:00", location: "Salle du conseil",
    }).expect(200);
    const createItem = async (name: string, position: number) => {
      const business = domainBody<{ id: string }>(await agent.post("/api/council-business").send({
        path: "conseil", name, reportName: "Rapport", reportContent: "",
      }).expect(201));
      const subject = domainBody<{ id: string }>(await agent
        .post(`/api/council-business/${business.id}/prepared-subjects`)
        .send({ kind: "openQuestion", name, content: "" }).expect(201));
      return domainBody<{ id: string; position: number }>(await agent
        .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
        .send({ kind: "openQuestion", subjectId: subject.id, position }).expect(201));
    };
    const first = await createItem("Premier point", 1);
    const second = await createItem("Second point", 2);
    const orderPath = `/api/council-meetings/${meeting.id}/agenda-order`;
    await agent.put(orderPath).send({ agendaItemIds: [first.id, first.id] }).expect(400);
    await agent.put(orderPath).send({ agendaItemIds: [second.id, first.id] }).expect(200);
    const reordered = domainBody<Array<{ id: string; position: number }>>(
      await agent.get(`/api/council-meetings/${meeting.id}/agenda-items`).expect(200),
    );
    expect(reordered.filter((item) => item.position > 0).map((item) => item.id)).toEqual([second.id, first.id]);
    const deprogrammed = domainBody<{ position: number }>(
      await agent.delete(`/api/council-meetings/${meeting.id}/agenda-items/${second.id}`).expect(200),
    );
    expect(deprogrammed.position).toBeLessThan(0);
    const restoration = await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${second.id}/reprogram`)
      .send({ councilMeetingId: meeting.id, position: 1 });
    expect(restoration.status, JSON.stringify(restoration.body)).toBe(200);
    const restored = domainBody<{ id: string; position: number }>(restoration);
    expect(restored).toMatchObject({ id: second.id, position: 1 });
    const council = new PostgresCouncil(pool);
    const context = {
      role: "hall_api_authenticated" as const,
      context: { requestId: "reorder-fixture", actorId: "test-clerk", roles: ["administrator"], contactId: null },
    };
    await council.freezeAgenda(context, meeting.id);
    await agent.put(orderPath).send({ agendaItemIds: [second.id, first.id] }).expect(409);
  });

  it("deprograms a prepared subject without deleting its history and can reprogram it", async () => {
    const { agent } = await createPostgresHttpTestServer();
    const meeting = domainBody<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));
    await agent.put(`/api/council-meetings/${meeting.id}/schedule`).send({
      scheduledAt: "2026-09-10T18:30:00+02:00", location: "Salle du conseil",
    }).expect(200);
    const business = domainBody<{ id: string }>(await agent.post("/api/council-business").send({
      path: "conseil", name: "Décision reportée", reportName: "Rapport", reportContent: "",
    }).expect(201));
    const proposal = domainBody<{ id: string }>(await agent
      .post(`/api/council-business/${business.id}/prepared-subjects`)
      .send({ kind: "councilDecisionProposal", name: "Décision reportée", content: "Texte" }).expect(201));
    const item = domainBody<{ id: string; position: number }>(await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
      .send({ kind: "councilDecisionProposal", subjectId: proposal.id, position: 1 }).expect(201));
    const removed = domainBody<{ id: string; position: number }>(await agent
      .delete(`/api/council-meetings/${meeting.id}/agenda-items/${item.id}`).expect(200));
    expect(removed).toMatchObject({ id: item.id });
    expect(removed.position).toBeLessThan(0);
    const history = domainBody<Array<{ id: string; position: number }>>(
      await agent.get(`/api/council-meetings/${meeting.id}/agenda-items`).expect(200),
    );
    expect(history).toContainEqual(expect.objectContaining({ id: item.id, position: removed.position }));
    const restored = domainBody<{ id: string; position: number }>(await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${item.id}/reprogram`)
      .send({ councilMeetingId: meeting.id, position: 1 }).expect(200));
    expect(restored).toMatchObject({ id: item.id, position: 1 });
  });

  it("records notes and requires a confirmed ballot before completing a decision proposal", async () => {
    const { agent, pool } = await createPostgresHttpTestServer();
    const context = {
      role: "hall_api_authenticated" as const,
      context: { requestId: "conduct-fixture", actorId: "test-clerk", roles: ["administrator"], contactId: null },
    };
    await new PostgresDirectory(pool).configureActiveCouncilTerm(context, 1);
    const member = await createTestCouncilMember(agent, { firstName: "Alice", role: "mayor" });
    const meeting = domainBody<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));
    await agent.put(`/api/council-meetings/${meeting.id}/prepare`).send({
      scheduledAt: "2026-09-10T18:30:00+02:00", location: "Council chamber",
      chairMemberId: member.id, secretaryMemberId: member.id,
    }).expect(200);
    const createItem = async (kind: "councilDecisionProposal" | "openQuestion", name: string, position: number) => {
      const business = domainBody<{ id: string }>(await agent.post("/api/council-business").send({
        path: "conseil", name, reportName: "Rapport", reportContent: "",
      }).expect(201));
      const subject = domainBody<{ id: string }>(await agent
        .post(`/api/council-business/${business.id}/prepared-subjects`)
        .send({ kind, name, content: "Texte soumis au conseil" }).expect(201));
      return domainBody<{ id: string }>(await agent
        .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
        .send({ kind, subjectId: subject.id, position }).expect(201));
    };
    const proposal = await createItem("councilDecisionProposal", "Décision rejetée", 1);
    const question = await createItem("openQuestion", "Question suivante", 2);
    const council = new PostgresCouncil(pool);
    await council.freezeAgenda(context, meeting.id);
    const facts = await council.noticeFacts(context, meeting.id);
    if (!facts) throw new Error("Frozen notice facts are required");
    await council.generateNotice(context, meeting.id,
      { meeting: facts, issuedOn: null, hall: { name: "Test commune", timeZone: "Europe/Paris" } },
      Buffer.from("%PDF-fixture"));
    await agent.post(`/api/council-meetings/${meeting.id}/record-opening`).send({
      observedAt: "2026-09-10T16:30:00Z", chairMemberId: member.id,
      secretaryMemberId: member.id, attendance: [{ councilMemberId: member.id, status: "present" }],
    }).expect(200);
    const itemPath = `/api/council-meetings/${meeting.id}/agenda-items/${proposal.id}`;
    await agent.post(`${itemPath}/start`).send({ startedAt: "2026-09-10T16:31:00Z" }).expect(200);
    const notes = domainBody<{ discussionSummary: string }>(
      await agent.patch(`${itemPath}/notes`).send({ discussionSummary: "Présentation consignée" }).expect(200),
    );
    expect(notes.discussionSummary).toBe("Présentation consignée");
    const prematureCompletion = await agent.post(`${itemPath}/complete`)
      .send({ completedAt: "2026-09-10T16:32:00Z" });
    expect(prematureCompletion.status, JSON.stringify(prematureCompletion.body)).toBe(409);
    const attendance = await council.listAttendance(context, meeting.id);
    const candidate = { procedure: "ordinaryMajority", mode: "public",
      participantAttendanceIds: [attendance[0].id], chairmanAttendanceId: attendance[0].id,
      votes: [{ meetingAttendanceId: attendance[0].id, choice: "reject" }], nonParticipations: [] };
    const preview = domainBody<{ id: string; calculation: { result: string } }>(
      await agent.post("/api/ballot-previews").send({ agendaItemId: proposal.id, candidate }).expect(201),
    );
    expect(preview.calculation.result).toBe("reject");
    await agent.post(`/api/ballot-previews/${preview.id}/confirm`).send({}).expect(200);
    await agent.post(`${itemPath}/complete`)
      .send({ completedAt: new Date(Date.now() + 1_000).toISOString() }).expect(409);
    const questionPath = `/api/council-meetings/${meeting.id}/agenda-items/${question.id}`;
    const questionStart = await agent.post(`${questionPath}/start`)
      .send({ startedAt: new Date().toISOString() });
    expect(questionStart.status, JSON.stringify(questionStart.body)).toBe(200);
    await agent.patch(`${questionPath}/notes`)
      .send({ discussionSummary: "Question examinée" }).expect(200);
    await agent.post(`${questionPath}/complete`)
      .send({ completedAt: new Date().toISOString() }).expect(200);
    await agent.post(`/api/council-meetings/${meeting.id}/close`)
      .send({ closedAt: new Date().toISOString() }).expect(200);
    const decisions = await agent.get("/api/council-decisions").expect(200);
    expect(decisions.body.entities).toHaveLength(1);
    expect(decisions.body.entities[0].properties.ballotId).toBeTruthy();
  });
});
