import { PROBLEM_MEDIA_TYPE, SIREN_MEDIA_TYPE } from "@hall/api-contract";
import { describe, expect, it } from "vitest";
import { createTestServer } from "./testServer.js";

const administrator = {
  email: "admin@example.fr",
  displayName: "Administration",
  password: "Mot-de-passe-demo-2026!",
};

function properties<T>(response: { body: { properties?: unknown } }): T {
  return response.body.properties as T;
}

describe("users, permissions, audit and Siren affordances", () => {
  it("starts the loopback development server with every permission", async () => {
    const { rawAgent } = await createTestServer();
    const status = await rawAgent.get("/api/auth/status").expect(200);
    expect(status.headers["content-type"]).toContain(SIREN_MEDIA_TYPE);
    expect(properties(status)).toEqual({
      bootstrapRequired: false,
      bootstrapAllowed: true,
      bootstrapTokenRequired: false,
      developmentAccess: true,
    });
    expect(status.body.actions).toEqual([]);

    const session = await rawAgent.get("/api/auth/session").expect(200);
    expect(properties<{ permissions: string[] }>(session).permissions).toContain("users.manage");
    expect(session.body.actions ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "session.logout" })]),
    );
    await rawAgent.get("/api/users").expect(200);
  });

  it("treats a malformed session cookie as unauthenticated and audits the denied mutation", async () => {
    const { rawAgent, statelessAgent } = await createTestServer({ devAutoLogin: false });
    await rawAgent.post("/api/auth/bootstrap").send(administrator).expect(201);

    await statelessAgent
      .post("/api/council-business")
      .set("Cookie", "hall_session=%")
      .send({ kind: "openQuestion", title: "Mutation refusée", report: "", folderPath: "", resourceIds: [] })
      .expect(401);

    await rawAgent
      .post("/api/auth/login")
      .send({ email: administrator.email, password: administrator.password })
      .expect(200);
    const audit = await rawAgent.get("/api/audit-events").expect(200);
    expect(
      audit.body.entities.map(
        (entity: { properties: { action: string; outcome: string; actorUserId: string | null } }) => entity.properties,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "council-business.create", outcome: "denied", actorUserId: null }),
      ]),
    );
  });

  it("authenticates users, filters actions by role and records successful changes", async () => {
    const { rawAgent } = await createTestServer({ devAutoLogin: false });

    const bootstrap = await rawAgent.post("/api/auth/bootstrap").send(administrator).expect(201);
    const administratorId = properties<{ id: string }>(bootstrap).id;
    expect(bootstrap.body.class).toEqual(["session"]);
    expect(bootstrap.body.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "session.logout" })]),
    );
    await rawAgent.get(bootstrap.body.links[0].href).expect(200);
    const duplicateBootstrap = await rawAgent.post("/api/auth/bootstrap").send(administrator).expect(409);
    expect(duplicateBootstrap.headers["content-type"]).toContain(PROBLEM_MEDIA_TYPE);
    expect(duplicateBootstrap.body.code).toBe("bootstrap_unavailable");

    const login = await rawAgent
      .post("/api/auth/login")
      .send({ email: administrator.email, password: administrator.password })
      .expect(200);
    expect(login.headers["set-cookie"]?.[0]).toContain("hall_session=");

    const member = await rawAgent
      .post("/api/council-members")
      .send({
        firstName: "Camille",
        lastName: "Martin",
        email: "camille.martin@example.fr",
        role: "councillor",
        termStartedOn: "2026-03-15",
      })
      .expect(201);
    const councilMemberId = properties<{ id: string }>(member).id;
    const meeting = await rawAgent
      .post("/api/council-meetings")
      .send({ startsAt: "2026-09-10T18:30:00.000Z", location: "Hall" })
      .expect(201);
    expect(meeting.body.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "meeting.schedule",
          fields: [expect.objectContaining({ value: "scheduled" })],
        }),
        expect.objectContaining({ name: "meeting.cancel", fields: [expect.objectContaining({ value: "cancelled" })] }),
      ]),
    );
    const meetingDetails = await rawAgent.get(meeting.body.links[0].href).expect(200);
    expect(meetingDetails.body.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "meeting.schedule",
          fields: [expect.objectContaining({ value: "scheduled" })],
        }),
      ]),
    );

    const reader = await rawAgent
      .post("/api/users")
      .send({
        email: "lecture@example.fr",
        displayName: "Lecture seule",
        password: "Mot-de-passe-lecture-2026!",
        roles: ["reader"],
        councilMemberId,
      })
      .expect(201);
    const readerUser = properties<{ id: string; councilMemberId: string }>(reader);
    expect(readerUser.councilMemberId).toBe(councilMemberId);
    await rawAgent
      .put(`/api/users/${readerUser.id}/roles`)
      .send({ roles: ["reader"] })
      .expect(200);

    const lastAdministrator = await rawAgent
      .put(`/api/users/${administratorId}/roles`)
      .send({ roles: ["reader"] })
      .expect(409);
    expect(lastAdministrator.body.code).toBe("last_administrator_required");

    const audit = await rawAgent.get("/api/audit-events").expect(200);
    const auditEvents = audit.body.entities.map(
      (entity: { properties: { action: string; actorUserId: string } }) => entity.properties,
    );
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "member.create", actorUserId: administratorId }),
        expect.objectContaining({ action: "meeting.create", actorUserId: administratorId }),
        expect.objectContaining({ action: "user.create", actorUserId: administratorId }),
        expect.objectContaining({ action: "session.login", actorUserId: administratorId }),
        expect.objectContaining({
          action: "user.assign-role",
          actorUserId: administratorId,
          details: expect.objectContaining({ roles: ["reader"] }),
        }),
      ]),
    );
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "user.create",
          details: expect.objectContaining({ roles: ["reader"], councilMemberId }),
        }),
      ]),
    );
    for (const entity of audit.body.entities) {
      const self = entity.links.find((link: { rel: string[] }) => link.rel.includes("self"));
      expect(self.href).toMatch(/^\/api\/audit-events\//);
      await rawAgent.get(self.href).expect(200);
    }

    await rawAgent.post("/api/auth/logout").expect(204);
    await rawAgent
      .post("/api/auth/login")
      .send({ email: "lecture@example.fr", password: "Mot-de-passe-lecture-2026!" })
      .expect(200);

    const businesses = await rawAgent.get("/api/council-business").expect(200);
    expect(businesses.body.actions ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "council-business.create" })]),
    );
    const forbidden = await rawAgent
      .post("/api/council-business")
      .send({ kind: "openQuestion", title: "Question", report: "", folderPath: "", resourceIds: [] })
      .expect(403);
    expect(forbidden.headers["content-type"]).toContain(PROBLEM_MEDIA_TYPE);
    expect(forbidden.body.code).toBe("permission_denied");
    await rawAgent.get("/api/users").expect(403);

    const root = await rawAgent.get("/api").expect(200);
    expect(root.body.links).not.toEqual(expect.arrayContaining([expect.objectContaining({ rel: ["users"] })]));

    await rawAgent.post("/api/auth/logout").expect(204);
    await rawAgent
      .post("/api/auth/login")
      .send({ email: administrator.email, password: administrator.password })
      .expect(200);
    const auditAfterDenial = await rawAgent.get("/api/audit-events").expect(200);
    expect(
      auditAfterDenial.body.entities.map(
        (entity: { properties: { action: string; actorUserId: string; outcome: string } }) => entity.properties,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "council-business.create", actorUserId: readerUser.id, outcome: "denied" }),
      ]),
    );
  });
});
