import { PROBLEM_MEDIA_TYPE } from "@hall/api-contract";
import { PostgresCouncil, PostgresDirectory } from "@hall/postgres";
import { describe, expect, it, vi } from "vitest";
import { API_JSON_BODY_LIMIT_BYTES } from "../api/application.js";
import { createPostgresHttpTestServer, createTestCouncilMember, createTestServer } from "./testServer.js";

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

describe("hardened HTTP and hypermedia contract", () => {
  it("accepts mutations from the configured local Vite proxy", async () => {
    const { rawAgent } = await createTestServer();

    const business = await rawAgent
      .post("/api/council-business")
      .set("Origin", "http://localhost:5174")
      .set("Sec-Fetch-Site", "same-site")
      .send({ path: "", name: "Question locale", reportName: "Rapport", reportContent: "" })
      .expect(201);

    const businessId = properties<{ id: string }>(business).id;
    const workspace = await rawAgent.get("/api/council-business/workspace-items").expect(200);
    expect(workspace.body.entities.map((entity: { properties: unknown }) => entity.properties)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: businessId, title: "Question locale" })]),
    );
  });

  it("advertises scheduling before the roster is captured at opening", async () => {
    const { agent: rawAgent } = await createPostgresHttpTestServer();
    const meeting = await rawAgent.post("/api/council-meetings").send({}).expect(201);
    const meetingId = properties<{ id: string }>(meeting).id;
    const details = await rawAgent.get(`/api/council-meetings/${meetingId}`).expect(200);
    expect(actionNames(details)).toContain("meeting.schedule");
    const scheduled = await rawAgent
      .put(`/api/council-meetings/${meetingId}/schedule`)
      .send({ scheduledAt: "2026-09-10T18:30:00+02:00", location: "Hall" })
      .expect(200);
    expect(properties<{ location: string; scheduledAt: string }>(scheduled)).toMatchObject({
      location: "Hall",
      scheduledAt: expect.any(String),
    });
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
        report: "x".repeat(API_JSON_BODY_LIMIT_BYTES + 1),
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
    const audit = await vi.waitFor(async () => {
      const result = await rawAgent.get("/api/audit-events").expect(200);
      expect(
        result.body.entities.map((entity: { properties: { action: string; outcome: string } }) => entity.properties),
      ).toEqual(
        expect.arrayContaining([expect.objectContaining({ action: "council-business.create", outcome: "denied" })]),
      );
      return result;
    });
    const auditSelf = audit.body.entities[0].links.find((link: { rel: string[] }) => link.rel.includes("self"));
    expect(auditSelf.href).toMatch(/^\/api\/audit-events\//);
    await rawAgent.get(auditSelf.href).expect(200);
  });

  it("advertises only meeting commands currently accepted by the SQL domain", async () => {
    const { agent: rawAgent, pool } = await createPostgresHttpTestServer();
    const context = {
      role: "hall_api_authenticated" as const,
      context: { requestId: "actions-fixture", actorId: "test-clerk", roles: ["administrator"], contactId: null },
    };
    await new PostgresDirectory(pool).configureActiveCouncilTerm(context, 1);
    const member = await createTestCouncilMember(rawAgent, { firstName: "Alice", role: "mayor" });
    const meeting = properties<{ id: string }>(await rawAgent.post("/api/council-meetings").send({}).expect(201));
    const path = `/api/council-meetings/${meeting.id}`;
    const draft = await rawAgent.get(path).expect(200);
    expect(actionNames(draft)).toContain("meeting.schedule");
    expect(actionNames(draft)).not.toContain("meeting.record-opening");
    expect(actionNames(draft)).not.toContain("meeting.close");

    await rawAgent
      .put(`${path}/prepare`)
      .send({
        scheduledAt: "2026-09-10T18:30:00+02:00",
        location: "Council chamber",
        chairMemberId: member.id,
        secretaryMemberId: member.id,
      })
      .expect(200);
    const business = properties<{ id: string }>(
      await rawAgent
        .post("/api/council-business")
        .send({
          path: "conseil",
          name: "Question à traiter",
          reportName: "Rapport",
          reportContent: "",
        })
        .expect(201),
    );
    const subject = properties<{ id: string }>(
      await rawAgent
        .post(`/api/council-business/${business.id}/prepared-subjects`)
        .send({ kind: "openQuestion", name: "Question à traiter", content: "" })
        .expect(201),
    );
    await rawAgent
      .post(`${path}/agenda-items/from-prepared`)
      .send({ kind: "openQuestion", subjectId: subject.id, position: 1 })
      .expect(201);
    const preparation = await rawAgent.get(path).expect(200);
    expect(actionNames(preparation)).toContain("meeting.freeze-agenda");
    expect(actionNames(preparation)).not.toContain("meeting.record-opening");

    const council = new PostgresCouncil(pool);
    await council.freezeAgenda(context, meeting.id);
    const facts = await council.noticeFacts(context, meeting.id);
    if (!facts) throw new Error("Frozen notice facts are required");
    const frozen = await rawAgent.get(path).expect(200);
    expect(actionNames(frozen)).toContain("meeting.generate-notice");
    expect(actionNames(frozen)).not.toContain("meeting.record-opening");
    await council.generateNotice(
      context,
      meeting.id,
      { meeting: facts, issuedOn: null, hall: { name: "Test commune", timeZone: "Europe/Paris" } },
      Buffer.from("%PDF-fixture"),
    );
    const noticed = await rawAgent.get(path).expect(200);
    expect(actionNames(noticed)).toContain("meeting.record-opening");

    await rawAgent
      .post(`${path}/record-opening`)
      .send({
        observedAt: "2026-09-10T16:30:00Z",
        chairMemberId: member.id,
        secretaryMemberId: member.id,
        attendance: [{ councilMemberId: member.id, status: "present" }],
      })
      .expect(200);
    const opened = await rawAgent.get(path).expect(200);
    expect(actionNames(opened)).toContain("meeting.close");
    expect(actionNames(opened)).not.toContain("meeting.schedule");
    expect(actionNames(opened)).not.toContain("meeting.record-opening");
  });

  it("keeps collection filters in Siren self links", async () => {
    const { rawAgent } = await createTestServer();
    const businesses = await rawAgent.get("/api/council-business?folderPath=travaux%2Feclairage").expect(200);
    expect(businesses.body.links).toContainEqual(
      expect.objectContaining({ rel: ["self"], href: "/api/council-business?folderPath=travaux%2Feclairage" }),
    );
  });

  it("enforces every role at the real server boundary and permits a late open question to the meeting chair", async () => {
    const { agent: rawAgent, pool } = await createPostgresHttpTestServer({ devAutoLogin: false });
    await rawAgent.post("/api/auth/bootstrap").send(admin).expect(201);
    const context = {
      role: "hall_api_authenticated" as const,
      context: { requestId: "role-fixture", actorId: "test-clerk", roles: ["administrator"], contactId: null },
    };
    await new PostgresDirectory(pool).configureActiveCouncilTerm(context, 2);
    const chair = await createTestCouncilMember(rawAgent, { firstName: "Alice", lastName: "Maire", role: "mayor" });
    const secretary = await createTestCouncilMember(rawAgent, { firstName: "Benoît", lastName: "Secrétaire" });
    const meeting = properties<{ id: string }>(await rawAgent.post("/api/council-meetings").send({}).expect(201));
    const meetingPath = `/api/council-meetings/${meeting.id}`;
    await rawAgent
      .put(`${meetingPath}/prepare`)
      .send({
        scheduledAt: "2026-09-10T18:30:00+02:00",
        location: "Hall",
        chairMemberId: chair.id,
        secretaryMemberId: secretary.id,
      })
      .expect(200);
    const business = properties<{ id: string }>(
      await rawAgent
        .post("/api/council-business")
        .send({
          path: "conseil",
          name: "Point convoqué",
          reportName: "Rapport",
          reportContent: "",
        })
        .expect(201),
    );
    const subject = properties<{ id: string }>(
      await rawAgent
        .post(`/api/council-business/${business.id}/prepared-subjects`)
        .send({ kind: "openQuestion", name: "Point convoqué", content: "" })
        .expect(201),
    );
    await rawAgent
      .post(`${meetingPath}/agenda-items/from-prepared`)
      .send({ kind: "openQuestion", subjectId: subject.id, position: 1 })
      .expect(201);
    const council = new PostgresCouncil(pool);
    await council.freezeAgenda(context, meeting.id);
    const facts = await council.noticeFacts(context, meeting.id);
    if (!facts) throw new Error("Frozen notice facts are required");
    await council.generateNotice(
      context,
      meeting.id,
      { meeting: facts, issuedOn: null, hall: { name: "Test commune", timeZone: "Europe/Paris" } },
      Buffer.from("%PDF-fixture"),
    );
    await rawAgent
      .post(`${meetingPath}/record-opening`)
      .send({
        observedAt: "2026-09-10T16:30:00Z",
        chairMemberId: chair.id,
        secretaryMemberId: secretary.id,
        attendance: [chair, secretary].map((member) => ({ councilMemberId: member.id, status: "present" })),
      })
      .expect(200);
    const chairContactId = properties<{ contactId: string }>(
      await rawAgent.get(`/api/council-members/${chair.id}`).expect(200),
    ).contactId;
    // The conductor is the account of the meeting chair; the last account is a contributor outside the officers.
    const profiles = [
      ["clerk", "greffe@hall.test", null],
      ["contributor", "contribution@hall.test", null],
      ["councillor", "conduite@hall.test", chairContactId],
      ["contributor", "lecture@hall.test", null],
    ] as const;
    for (const [role, email, contactId] of profiles) {
      await rawAgent
        .post("/api/users")
        .send({
          email,
          displayName: email,
          password: "Mot-de-passe-role-2026!",
          roles: [role],
          contactId,
        })
        .expect(201);
    }
    const loginAs = async (email: string) => {
      await rawAgent.post("/api/auth/logout").expect(204);
      await rawAgent.post("/api/auth/login").send({ email, password: "Mot-de-passe-role-2026!" }).expect(200);
    };
    const latePath = `${meetingPath}/open-questions`;
    const lateInput = { path: "conseil", name: "Ajout en séance", content: "Question nouvelle" };
    await loginAs(profiles[0][1]);
    await rawAgent
      .post("/api/council-business")
      .send({
        path: "conseil",
        name: "Provision du greffe",
        reportName: "Rapport",
        reportContent: "",
      })
      .expect(201);
    await rawAgent.post(latePath).send(lateInput).expect(403);

    await loginAs(profiles[1][1]);
    await rawAgent
      .post("/api/council-business")
      .send({
        path: "conseil",
        name: "Contribution",
        reportName: "Rapport",
        reportContent: "",
      })
      .expect(201);
    await rawAgent.post("/api/council-meetings").send({}).expect(403);

    await loginAs(profiles[2][1]);
    await rawAgent.post("/api/council-business").send(lateInput).expect(403);
    const conductorView = await rawAgent.get(`${meetingPath}/conduct`).expect(200);
    expect(actionNames(conductorView), JSON.stringify(conductorView.body.properties)).toContain(
      "meeting.add-open-question",
    );
    await rawAgent
      .post(latePath)
      .send({ ...lateInput, kind: "councilDecisionProposal" })
      .expect(400);
    const added = await rawAgent.post(latePath).send(lateInput).expect(201);
    expect(properties<{ subject: { kind: string } }>(added).subject.kind).toBe("openQuestion");

    await loginAs(profiles[3][1]);
    const readerView = await rawAgent.get(`${meetingPath}/conduct`).expect(200);
    expect(actionNames(readerView)).not.toContain("meeting.add-open-question");
    await rawAgent
      .post(latePath)
      .send({ ...lateInput, name: "Lecture seule" })
      .expect(403);
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
