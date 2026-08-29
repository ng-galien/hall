import { randomUUID } from "node:crypto";
import { PROBLEM_MEDIA_TYPE, SIREN_MEDIA_TYPE } from "@hall/api-contract";
import { describe, expect, it } from "vitest";
import { createTestServer } from "./testServer.js";

const admin = {
  email: "admin@hall.test",
  displayName: "Administration",
  password: "Mot-de-passe-administration-2026!",
};

function properties<T>(response: { body: { properties?: unknown } }): T {
  return response.body.properties as T;
}

function actionNames(response: { body: { actions?: Array<{ name: string }> } }): string[] {
  return (response.body.actions ?? []).map((action) => action.name);
}

async function expectSelfToResolve(
  rawAgent: Awaited<ReturnType<typeof createTestServer>>["rawAgent"],
  response: { body: { links?: Array<{ rel: string[]; href: string }> } },
): Promise<void> {
  const self = response.body.links?.find((link) => link.rel.includes("self"));
  expect(self?.href).toBeTruthy();
  await rawAgent.get(self!.href).expect(200);
}

describe("hardened HTTP and hypermedia contract", () => {
  it("accepts mutations from the configured local Vite proxy", async () => {
    const { rawAgent } = await createTestServer();

    const business = await rawAgent
      .post("/api/council-business")
      .set("Origin", "http://localhost:5174")
      .set("Sec-Fetch-Site", "same-site")
      .send({ kind: "openQuestion", title: "Question locale", report: "", folderPath: "", resourceIds: [] })
      .expect(201);

    expect(properties<{ title: string }>(business).title).toBe("Question locale");
  });

  it("does not advertise scheduling before the council has an active roster", async () => {
    const { rawAgent } = await createTestServer();
    const meeting = await rawAgent
      .post("/api/council-meetings")
      .send({ title: "Conseil sans composition", startsAt: "2026-09-10T18:30:00+02:00", location: "Hall" })
      .expect(201);
    const meetingId = properties<{ id: string }>(meeting).id;
    const details = await rawAgent.get(`/api/council-meetings/${meetingId}`).expect(200);
    expect(actionNames(details)).not.toContain("meeting.schedule");
    await rawAgent
      .put(`/api/council-meetings/${meetingId}/status`)
      .send({ status: "scheduled" })
      .expect(409)
      .expect((response) => expect(response.body.code).toBe("meeting_roster_locked"));
  });

  it("returns RFC 9457 problems for malformed JSON, unknown API routes and cross-origin mutations", async () => {
    const { rawAgent } = await createTestServer();

    const malformed = await rawAgent
      .post("/api/council-business")
      .set("Content-Type", "application/json")
      .send('{"kind":')
      .expect(400);
    expect(malformed.headers["content-type"]).toContain(PROBLEM_MEDIA_TYPE);
    expect(malformed.body).toMatchObject({ code: "invalid_request", status: 400 });
    expect(malformed.body.requestId).toBeTruthy();

    const oversized = await rawAgent
      .post("/api/council-business")
      .send({
        kind: "openQuestion",
        title: "Trop grand",
        report: "x".repeat(2 * 1024 * 1024),
        folderPath: "",
        resourceIds: [],
      })
      .expect(413);
    expect(oversized.body).toMatchObject({ code: "request_too_large", status: 413 });

    const malformedPath = await rawAgent.get("/api/council-business/%").expect(400);
    expect(malformedPath.body).toMatchObject({ code: "invalid_request", status: 400 });

    const missing = await rawAgent.get("/api/route-that-does-not-exist").expect(404);
    expect(missing.headers["content-type"]).toContain(PROBLEM_MEDIA_TYPE);
    expect(missing.body).toMatchObject({ code: "route_not_found", status: 404 });

    const crossOrigin = await rawAgent
      .post("/api/council-business")
      .set("Origin", "https://hostile.example")
      .send({ kind: "openQuestion", title: "Intrusion", report: "", folderPath: "", resourceIds: [] })
      .expect(403);
    expect(crossOrigin.headers["content-type"]).toContain(PROBLEM_MEDIA_TYPE);
    expect(crossOrigin.body.code).toBe("csrf_validation_failed");
    const audit = await rawAgent.get("/api/audit-events").expect(200);
    expect(
      audit.body.entities.map((entity: { properties: { action: string; outcome: string } }) => entity.properties),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "council-business.create", outcome: "denied" })]),
    );
    const auditSelf = audit.body.entities[0].links.find((link: { rel: string[] }) => link.rel.includes("self"));
    expect(auditSelf.href).toMatch(/^\/api\/audit-events\//);
    await rawAgent.get(auditSelf.href).expect(200);
  });

  it("advertises only meeting commands currently accepted by the domain", async () => {
    const { rawAgent } = await createTestServer();
    const members = [];
    for (const [firstName, role] of [
      ["Maire", "mayor"],
      ["Secrétaire", "councillor"],
    ] as const) {
      const response = await rawAgent
        .post("/api/council-members")
        .send({ firstName, lastName: "Test", email: null, role, termStartedOn: "2026-03-22" })
        .expect(201);
      members.push(properties<{ id: string }>(response));
      await expectSelfToResolve(rawAgent, response);
    }
    const decision = await rawAgent
      .post("/api/council-decisions")
      .send({ title: "Décision à figer", draftText: "Texte présenté", legalityReviewRequired: true })
      .expect(201);
    const decisionId = properties<{ id: string }>(decision).id;
    const resource = await rawAgent
      .post("/api/resources/texts")
      .send({ title: "Note présentée", folderPath: "conseil", tags: ["séance"], content: "Contenu présenté" })
      .expect(201);
    const resourceId = properties<{ id: string }>(resource).id;
    const business = await rawAgent
      .post("/api/council-business")
      .send({
        kind: "matter",
        councilDecisionId: decisionId,
        title: "Question",
        report: "Rapport présenté",
        folderPath: "conseil",
        resourceIds: [resourceId],
      })
      .expect(201);
    const businessId = properties<{ id: string }>(business).id;
    await expectSelfToResolve(rawAgent, business);
    const meeting = await rawAgent
      .post("/api/council-meetings")
      .send({
        title: "Conseil",
        startsAt: "2026-09-10T18:30:00+02:00",
        location: "Hall",
        chairMemberId: members[0].id,
        secretaryMemberId: members[1].id,
      })
      .expect(201);
    const meetingId = properties<{ id: string }>(meeting).id;
    await expectSelfToResolve(rawAgent, meeting);
    const agendaItem = await rawAgent
      .post(`/api/council-business/${businessId}/schedule`)
      .send({ meetingId, position: 1 })
      .expect(201);
    await expectSelfToResolve(rawAgent, agendaItem);
    await rawAgent.put(`/api/council-meetings/${meetingId}/status`).send({ status: "scheduled" }).expect(200);

    const incomplete = await rawAgent.get(`/api/council-meetings/${meetingId}`).expect(200);
    expect(incomplete.headers["content-type"]).toContain(SIREN_MEDIA_TYPE);
    expect(actionNames(incomplete)).toEqual(
      expect.arrayContaining([
        "meeting.update",
        "meeting.record-attendance",
        "meeting.set-officers",
        "meeting.reorder-agenda",
        "meeting.cancel",
      ]),
    );
    expect(actionNames(incomplete)).not.toContain("meeting.open");
    expect(actionNames(incomplete)).not.toContain("meeting.record-quorum-failure");

    for (const member of members) {
      const attendance = await rawAgent
        .put(`/api/council-meetings/${meetingId}/attendance`)
        .send({ memberId: member.id, status: "absent", proxyHolderMemberId: null, proxyDocumentId: null })
        .expect(200);
      await expectSelfToResolve(rawAgent, attendance);
    }
    const withoutQuorum = await rawAgent.get(`/api/council-meetings/${meetingId}`).expect(200);
    expect(actionNames(withoutQuorum)).toContain("meeting.record-quorum-failure");
    expect(actionNames(withoutQuorum)).not.toContain("meeting.open");
    await rawAgent.post(`/api/council-meetings/${meetingId}/quorum-failure`).expect(201);

    const failed = await rawAgent.get(`/api/council-meetings/${meetingId}`).expect(200);
    expect(actionNames(failed)).toEqual(["meeting.reconvene"]);
    const failedAgenda = failed.body.entities.find((entity: { class: string[] }) =>
      entity.class.includes("agenda-item"),
    );
    expect((failedAgenda.actions ?? []).map((candidate: { name: string }) => candidate.name)).not.toContain(
      "agenda-item.remove",
    );
    const frozenBusiness = await rawAgent.get(`/api/council-business/${businessId}`).expect(200);
    expect(actionNames(frozenBusiness)).toEqual(["council-business.reclassify", "council-business.update"]);
    const frozenBusinessInCollection = (await rawAgent.get("/api/council-business").expect(200)).body.entities.find(
      (entity: { properties: { id: string } }) => entity.properties.id === businessId,
    );
    expect((frozenBusinessInCollection.actions ?? []).map((candidate: { name: string }) => candidate.name)).toEqual([
      "council-business.reclassify",
      "council-business.update",
    ]);
    await rawAgent
      .put(`/api/council-business/${businessId}`)
      .send({
        title: "Question réécrite",
        report: "Rapport réécrit",
        folderPath: "conseil",
        resourceIds: [resourceId],
      })
      .expect(200);
    await rawAgent.delete(`/api/council-business/${businessId}/decision`).expect(409);
    const frozenDecision = await rawAgent.get(`/api/council-decisions/${decisionId}`).expect(200);
    expect(actionNames(frozenDecision)).not.toContain("decision.update");
    await rawAgent
      .put(`/api/council-decisions/${decisionId}`)
      .send({ title: "Décision réécrite", draftText: "Nouveau texte" })
      .expect(409);
    await rawAgent
      .put(`/api/resources/${resourceId}`)
      .send({ title: "Note réécrite", folderPath: "conseil", tags: ["séance"], content: "Nouveau contenu" })
      .expect(409);
    await rawAgent
      .put(`/api/council-business/${businessId}/classification`)
      .send({ folderPath: "archives/conseil" })
      .expect(200);
    const reconvene = failed.body.actions[0];
    expect(reconvene.href).toBe(
      `/api/council-meetings/${properties<{ meeting: { slug: string } }>(failed).meeting.slug}/reconvene`,
    );
    await rawAgent.put(`/api/council-meetings/${meetingId}/status`).send({ status: "cancelled" }).expect(409);
    const reconvened = await rawAgent
      .post(`/api/council-meetings/${meetingId}/reconvene`)
      .send({
        title: "Conseil reconvoqué",
        startsAt: "2026-09-14T18:30:00+02:00",
        meetingNoticeSentAt: "2026-09-10T18:31:00+02:00",
        location: "Hall",
      })
      .expect(201);
    const reconvenedRepresentation = await rawAgent
      .get(`/api/council-meetings/${properties<{ id: string }>(reconvened).id}`)
      .expect(200);
    expect(actionNames(reconvenedRepresentation)).not.toContain("meeting.reorder-agenda");
    expect(actionNames(await rawAgent.get(`/api/council-business/${businessId}`).expect(200))).toEqual(
      expect.arrayContaining(["council-business.reclassify", "council-business.update"]),
    );
  });

  it("keeps collection filters in Siren self links", async () => {
    const { rawAgent } = await createTestServer();
    const businesses = await rawAgent.get("/api/council-business?folderPath=travaux%2Feclairage").expect(200);
    expect(businesses.body.links).toContainEqual(
      expect.objectContaining({ rel: ["self"], href: "/api/council-business?folderPath=travaux%2Feclairage" }),
    );
  });

  it("enforces every role at the server boundary and permits an atomic late business to the conductor", async () => {
    const { rawAgent } = await createTestServer({ devAutoLogin: false });
    await rawAgent.post("/api/auth/bootstrap").send(admin).expect(201);
    const chair = properties<{ id: string }>(
      await rawAgent
        .post("/api/council-members")
        .send({ firstName: "Alice", lastName: "Maire", role: "mayor", termStartedOn: "2026-03-22" })
        .expect(201),
    );
    const secretary = properties<{ id: string }>(
      await rawAgent
        .post("/api/council-members")
        .send({ firstName: "Benoît", lastName: "Secrétaire", role: "councillor", termStartedOn: "2026-03-22" })
        .expect(201),
    );
    const meeting = properties<{ id: string }>(
      await rawAgent
        .post("/api/council-meetings")
        .send({
          title: "Conseil en cours",
          startsAt: "2026-09-10T18:30:00+02:00",
          location: "Hall",
          chairMemberId: chair.id,
          secretaryMemberId: secretary.id,
        })
        .expect(201),
    );
    const preparedBusiness = properties<{ id: string }>(
      await rawAgent
        .post("/api/council-business")
        .send({ kind: "matter", title: "Point convoqué", report: "", folderPath: "", resourceIds: [] })
        .expect(201),
    );
    const preparedAgendaItem = properties<{ id: string }>(
      await rawAgent
        .post(`/api/council-business/${preparedBusiness.id}/schedule`)
        .send({ meetingId: meeting.id, position: 1 })
        .expect(201),
    );
    const preparedOpenQuestion = properties<{ id: string }>(
      await rawAgent
        .post("/api/council-business")
        .send({ kind: "openQuestion", title: "Question ouverte", report: "", folderPath: "", resourceIds: [] })
        .expect(201),
    );
    const preparedOpenQuestionItem = properties<{ id: string }>(
      await rawAgent
        .post(`/api/council-business/${preparedOpenQuestion.id}/schedule`)
        .send({ meetingId: meeting.id, position: 2 })
        .expect(201),
    );
    await rawAgent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
    for (const member of [chair, secretary]) {
      await rawAgent
        .put(`/api/council-meetings/${meeting.id}/attendance`)
        .send({ memberId: member.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
        .expect(200);
    }
    const attendanceAudit = await rawAgent.get("/api/audit-events").expect(200);
    const attendanceEvents = attendanceAudit.body.entities.map(
      (entity: { properties: { action: string; details: Record<string, unknown> } }) => entity.properties,
    );
    expect(attendanceEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "meeting.record-attendance",
          details: expect.objectContaining({ memberId: chair.id, status: "present" }),
        }),
      ]),
    );
    await rawAgent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "inProgress" }).expect(200);

    const profiles = [
      ["clerk", "greffe@hall.test"],
      ["contributor", "contribution@hall.test"],
      ["meetingConductor", "conduite@hall.test"],
      ["reader", "lecture@hall.test"],
    ] as const;
    for (const [role, email] of profiles) {
      await rawAgent
        .post("/api/users")
        .send({ email, displayName: role, password: "Mot-de-passe-role-2026!", roles: [role], councilMemberId: null })
        .expect(201);
    }

    await rawAgent.post("/api/auth/logout").expect(204);
    await rawAgent
      .post("/api/auth/login")
      .send({ email: profiles[0][1], password: "Mot-de-passe-role-2026!" })
      .expect(200);
    const provisioned = properties<{ id: string }>(
      await rawAgent
        .post("/api/council-business")
        .send({ kind: "openQuestion", title: "Provision", report: "", folderPath: "", resourceIds: [] })
        .expect(201),
    );
    await rawAgent
      .post(`/api/council-business/${provisioned.id}/schedule`)
      .send({ meetingId: meeting.id, position: 3 })
      .expect(409);
    await rawAgent.post("/api/council-meetings").send({}).expect(400);
    await rawAgent.put(`/api/council-meetings/${meeting.id}/attendance`).send({}).expect(403);

    await rawAgent.post("/api/auth/logout").expect(204);
    await rawAgent
      .post("/api/auth/login")
      .send({ email: profiles[1][1], password: "Mot-de-passe-role-2026!" })
      .expect(200);
    await rawAgent
      .post("/api/council-business")
      .send({ kind: "openQuestion", title: "Contribution", report: "", folderPath: "", resourceIds: [] })
      .expect(201);
    await rawAgent.post("/api/council-meetings").send({}).expect(403);

    await rawAgent.post("/api/auth/logout").expect(204);
    await rawAgent
      .post("/api/auth/login")
      .send({ email: profiles[2][1], password: "Mot-de-passe-role-2026!" })
      .expect(200);
    await rawAgent.post("/api/council-business").send({}).expect(403);
    const idleMeeting = await rawAgent.get(`/api/council-meetings/${meeting.id}`).expect(200);
    expect(actionNames(idleMeeting)).not.toContain("ballot.record");
    const startedAgendaItem = await rawAgent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${preparedAgendaItem.id}/start`)
      .expect(200);
    expect(actionNames(startedAgendaItem)).toEqual(
      expect.arrayContaining(["agenda-item.save-notes", "agenda-item.complete"]),
    );
    const examiningMeeting = await rawAgent.get(`/api/council-meetings/${meeting.id}`).expect(200);
    expect(actionNames(examiningMeeting)).toContain("ballot.record");
    await rawAgent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({
        memberId: secretary.id,
        status: "absent",
        proxyHolderMemberId: null,
        proxyDocumentId: null,
        expectedVersion: 1,
      })
      .expect(200);
    const quorumLost = await rawAgent.get(`/api/council-meetings/${meeting.id}`).expect(200);
    expect(properties<{ quorum: { reached: boolean } }>(quorumLost).quorum.reached).toBe(false);
    expect(actionNames(quorumLost)).not.toContain("ballot.record");
    await rawAgent
      .post(`/api/council-meetings/${meeting.id}/ballots`)
      .send({
        method: "public",
        idempotencyKey: randomUUID(),
        agendaItemId: preparedAgendaItem.id,
        votes: [{ memberId: chair.id, castByMemberId: chair.id, choice: "for" }],
      })
      .expect(409)
      .expect((response) => expect(response.body.code).toBe("quorum_not_reached"));
    await rawAgent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({
        memberId: secretary.id,
        status: "present",
        proxyHolderMemberId: null,
        proxyDocumentId: null,
        expectedVersion: 2,
      })
      .expect(200);
    const ballot = await rawAgent
      .post(`/api/council-meetings/${meeting.id}/ballots`)
      .send({
        method: "public",
        idempotencyKey: randomUUID(),
        agendaItemId: preparedAgendaItem.id,
        votes: [chair, secretary].map((member) => ({
          memberId: member.id,
          castByMemberId: member.id,
          choice: "for",
        })),
      })
      .expect(201);
    await expectSelfToResolve(rawAgent, ballot);
    const votedMeeting = await rawAgent.get(`/api/council-meetings/${meeting.id}`).expect(200);
    expect(actionNames(votedMeeting)).not.toContain("ballot.record");
    const embeddedBallot = votedMeeting.body.entities.find((entity: { class: string[] }) =>
      entity.class.includes("ballot"),
    );
    expect((embeddedBallot.actions ?? []).map((candidate: { name: string }) => candidate.name)).toContain(
      "ballot.cancel",
    );
    await rawAgent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${preparedAgendaItem.id}/complete`)
      .send({ discussionSummary: "Point traité", status: "examined" })
      .expect(200);
    const completedMeeting = await rawAgent.get(`/api/council-meetings/${meeting.id}`).expect(200);
    const completedBallot = completedMeeting.body.entities.find((entity: { class: string[] }) =>
      entity.class.includes("ballot"),
    );
    expect((completedBallot.actions ?? []).map((candidate: { name: string }) => candidate.name)).not.toContain(
      "ballot.cancel",
    );

    await rawAgent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${preparedOpenQuestionItem.id}/start`)
      .expect(200);
    const openQuestionMeeting = await rawAgent.get(`/api/council-meetings/${meeting.id}`).expect(200);
    expect(actionNames(openQuestionMeeting)).not.toContain("ballot.record");
    await rawAgent
      .post(`/api/council-meetings/${meeting.id}/ballots`)
      .send({
        method: "public",
        idempotencyKey: randomUUID(),
        agendaItemId: preparedOpenQuestionItem.id,
        votes: [chair, secretary].map((member) => ({
          memberId: member.id,
          castByMemberId: member.id,
          choice: "for",
        })),
      })
      .expect(409)
      .expect((response) => expect(response.body.code).toBe("agenda_sequence_invalid"));
    await rawAgent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${preparedOpenQuestionItem.id}/complete`)
      .send({ discussionSummary: "Question traitée", status: "examined" })
      .expect(200);

    await rawAgent
      .post(`/api/council-meetings/${meeting.id}/late-business`)
      .send({
        kind: "matter",
        councilDecisionId: randomUUID(),
        title: "Délibération tardive",
        report: "",
        folderPath: "",
        resourceIds: [],
      })
      .expect(400);

    const lateBusiness = await rawAgent
      .post(`/api/council-meetings/${meeting.id}/late-business`)
      .send({ kind: "openQuestion", title: "Ajout en séance", report: "", folderPath: "", resourceIds: [] })
      .expect(201);
    const lateAgendaItem = properties<{
      id: string;
      position: number;
      addedDuringSession: boolean;
      business: { id: string };
    }>(lateBusiness);
    expect(lateAgendaItem).toMatchObject({ position: 3, addedDuringSession: true });
    const businessesCollection = await rawAgent.get("/api/council-business").expect(200);
    const lateEmbedded = businessesCollection.body.entities.find(
      (entity: { properties?: { id?: string } }) => entity.properties?.id === lateAgendaItem.business.id,
    );
    expect((lateEmbedded.actions ?? []).map((candidate: { name: string }) => candidate.name)).not.toContain(
      "council-business.attach-decision",
    );
    const lateDetails = await rawAgent.get(`/api/council-business/${lateAgendaItem.business.id}`).expect(200);
    expect(actionNames(lateDetails)).not.toContain("council-business.attach-decision");
    await rawAgent.post(`/api/council-meetings/${meeting.id}/agenda-items/${lateAgendaItem.id}/start`).expect(200);
    const lateMeeting = await rawAgent.get(`/api/council-meetings/${meeting.id}`).expect(200);
    expect(actionNames(lateMeeting)).not.toContain("ballot.record");
    await rawAgent
      .post(`/api/council-meetings/${meeting.id}/ballots`)
      .send({
        method: "public",
        idempotencyKey: randomUUID(),
        agendaItemId: lateAgendaItem.id,
        votes: [chair, secretary].map((member) => ({
          memberId: member.id,
          castByMemberId: member.id,
          choice: "for",
        })),
      })
      .expect(409)
      .expect((response) => expect(response.body.code).toBe("agenda_sequence_invalid"));

    await rawAgent.post("/api/auth/logout").expect(204);
    await rawAgent
      .post("/api/auth/login")
      .send({ email: profiles[3][1], password: "Mot-de-passe-role-2026!" })
      .expect(200);
    await rawAgent.get(`/api/council-meetings/${meeting.id}`).expect(200);
    await rawAgent.post("/api/council-business").send({}).expect(403);
  });

  it("throttles repeated failed logins without disclosing whether the account exists", async () => {
    const { rawAgent } = await createTestServer({ devAutoLogin: false });
    await rawAgent.post("/api/auth/bootstrap").send(admin).expect(201);
    await rawAgent.post("/api/auth/logout").expect(204);
    for (let attempt = 1; attempt < 5; attempt += 1) {
      await rawAgent
        .post("/api/auth/login")
        .send({ email: "absent@hall.test", password: "Mot-de-passe-erroné!" })
        .expect(401);
    }
    const blocked = await rawAgent
      .post("/api/auth/login")
      .send({ email: "absent@hall.test", password: "Mot-de-passe-erroné!" })
      .expect(429);
    expect(blocked.body.code).toBe("too_many_login_attempts");
  });

  it("does not let a concurrent valid login bypass the failed-login threshold", async () => {
    const { rawAgent, statelessAgent } = await createTestServer({ devAutoLogin: false });
    await rawAgent.post("/api/auth/bootstrap").send(admin).expect(201);
    await rawAgent.post("/api/auth/logout").expect(204);

    const failedAttempts = Array.from({ length: 8 }, () =>
      statelessAgent.post("/api/auth/login").send({ email: admin.email, password: "Mot-de-passe-erroné!" }),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    const validAttempt = statelessAgent.post("/api/auth/login").send({ email: admin.email, password: admin.password });
    const responses = await Promise.all([...failedAttempts, validAttempt]);

    expect(responses.at(-1)?.status).toBe(429);
    expect(responses.some((response) => response.status === 200)).toBe(false);
    expect(responses.every((response) => response.status === 401 || response.status === 429)).toBe(true);
  });

  it("does not let a valid account reset the failed-login budget of its IP address", async () => {
    const { rawAgent, statelessAgent } = await createTestServer({ devAutoLogin: false });
    await rawAgent.post("/api/auth/bootstrap").send(admin).expect(201);
    await rawAgent.post("/api/auth/logout").expect(204);

    for (let attempt = 1; attempt < 20; attempt += 1) {
      await statelessAgent
        .post("/api/auth/login")
        .send({ email: `absent-${attempt}@hall.test`, password: "Mot-de-passe-erroné!" })
        .expect(401);
    }
    await statelessAgent.post("/api/auth/login").send({ email: admin.email, password: admin.password }).expect(200);
    const blocked = await statelessAgent
      .post("/api/auth/login")
      .send({ email: "encore-absent@hall.test", password: "Mot-de-passe-erroné!" })
      .expect(429);

    expect(blocked.body.code).toBe("too_many_login_attempts");
  });
});
