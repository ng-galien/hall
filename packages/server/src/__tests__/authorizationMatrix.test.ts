import { apiActionNames } from "@hall/api-contract";
import { PostgresCouncil, PostgresDirectory } from "@hall/postgres";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createPostgresHttpTestServer, domainBody, type TestAgent } from "./testServer.js";

const postgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const password = "Authorization-matrix-2026!";
const databaseRequest = {
  role: "hall_api_authenticated" as const,
  context: { requestId: "matrix-fixture", actorId: "fixture", roles: ["administrator"], contactId: null },
};

async function matrixScenario() {
  const { agent: admin, url, pool } = await createPostgresHttpTestServer({ devAutoLogin: false });
  await admin
    .post("/api/auth/bootstrap")
    .send({ email: "admin@example.fr", displayName: "Admin", password })
    .expect(201);
  await new PostgresDirectory(pool).configureActiveCouncilTerm(databaseRequest, 5);
  const member = async (firstName: string) => {
    const contact = domainBody<{ id: string }>(
      await admin.post("/api/contacts").send({ firstName, lastName: "Martin" }).expect(201),
    );
    const created = domainBody<{ id: string }>(
      await admin
        .post("/api/council-members")
        .send({ contactId: contact.id, role: "councillor", termStartedOn: "2026-03-22" })
        .expect(201),
    );
    return { contactId: contact.id, memberId: created.id };
  };
  const account = async (email: string, roles: string[], contactId: string | null) => {
    await admin.post("/api/users").send({ email, displayName: email, password, roles, contactId }).expect(201);
    const agent = request.agent(url);
    await agent.post("/api/auth/login").send({ email, password }).expect(200);
    return agent;
  };
  const alice = await member("Alice");
  const bruno = await member("Bruno");
  await admin.post("/api/resources").send({ kind: "folder", path: "", name: "Commun" }).expect(201);
  return {
    admin,
    pool,
    alice,
    bruno,
    roles: {
      administrator: admin,
      clerk: await account("clerk@example.fr", ["clerk"], null),
      contributor: await account("contributor@example.fr", ["contributor"], null),
      councillor: await account("alice@example.fr", ["councillor"], alice.contactId),
    },
    brunoAgent: await account("bruno@example.fr", ["councillor"], bruno.contactId),
  };
}

type Role = "administrator" | "clerk" | "contributor" | "councillor";
const allRoles: Role[] = ["administrator", "clerk", "contributor", "councillor"];

const createBusiness = (agent: TestAgent, name: string) =>
  agent.post("/api/council-business").send({ path: "Commun", name, reportName: "Rapport", reportContent: "" });
const createText = (agent: TestAgent, path: string, name: string) =>
  agent.post("/api/resources").send({ kind: "text", path, name, content: "" });
const template = (name: string) => ({ kind: "pdf", documentType: `test-${name}`, name, bodyMarkdown: "Texte" });

postgres("role matrix decided by PostgreSQL", () => {
  // @verifies-requirement HALL-FR-DOC-350
  // @verifies-requirement HALL-FR-USR-040
  // @verifies-requirement HALL-FR-USR-050
  // @verifies-requirement HALL-FR-WSP-390
  // @verifies-requirement HALL-FR-WSP-410
  it("grants each role its accesses and refuses the others through the HTTP surface", async () => {
    const { admin, roles } = await matrixScenario();
    const expectStatus = async (role: Role, call: (agent: TestAgent) => request.Test, allowed: number[]) => {
      const response = await call(roles[role]);
      expect({ role, status: response.status }).toEqual({
        role,
        status: allowed.includes(response.status) ? response.status : allowed[0],
      });
    };

    // Everyone reads and exports.
    for (const role of allRoles) {
      await expectStatus(role, (agent) => agent.get("/api/council-business"), [200]);
      await expectStatus(role, (agent) => agent.get("/api/contacts"), [200]);
      await expectStatus(role, (agent) => agent.get("/api/council-meetings"), [200]);
    }

    // Affairs: created and modified by the contributor, deleted by the secretariat and the administrator only.
    await expectStatus("councillor", (agent) => createBusiness(agent, "Refusée"), [403]);
    for (const role of ["contributor", "clerk", "administrator"] as const) {
      const created = domainBody<{ id: string }>(await createBusiness(roles[role], `Affaire ${role}`).expect(201));
      for (const refused of ["councillor", "contributor"] as const)
        await expectStatus(refused, (agent) => agent.delete(`/api/council-business/${created.id}`), [403]);
      await expectStatus(
        role === "contributor" ? "clerk" : role,
        (agent) => agent.delete(`/api/council-business/${created.id}`),
        [200, 204],
      );
    }

    // Common resources: written by the contributor, deleted by the secretariat and the administrator only.
    await expectStatus("councillor", (agent) => createText(agent, "Commun", "Intrusion"), [403]);
    const note = domainBody<{ id: string }>(await createText(roles.contributor, "Commun", "Note").expect(201));
    await expectStatus("contributor", (agent) => agent.delete(`/api/resources/${note.id}`), [403]);
    await expectStatus("councillor", (agent) => agent.delete(`/api/resources/${note.id}`), [403]);
    await expectStatus("clerk", (agent) => agent.delete(`/api/resources/${note.id}`), [200, 204]);

    // The councillor creates, edits and deletes their own work in their personal folder.
    const own = domainBody<{ id: string }>(
      await createText(roles.councillor, "Espaces personnels/Alice Martin", "Brouillon").expect(201),
    );
    await expectStatus("contributor", (agent) => agent.delete(`/api/resources/${own.id}`), [403]);
    await expectStatus("councillor", (agent) => agent.delete(`/api/resources/${own.id}`), [200, 204]);

    // Templates: created, modified and deleted by the secretariat and the administrator only.
    for (const role of ["councillor", "contributor"] as const)
      await expectStatus(role, (agent) => agent.post("/api/templates").send(template(role)), [403]);
    const created = domainBody<{ id: string }>(
      await roles.clerk.post("/api/templates").send(template("clerk")).expect(201),
    );
    await expectStatus("contributor", (agent) => agent.put(`/api/templates/${created.id}`).send(template("x")), [403]);
    await expectStatus("contributor", (agent) => agent.delete(`/api/templates/${created.id}`), [403]);
    await expectStatus("clerk", (agent) => agent.delete(`/api/templates/${created.id}`), [200, 204]);

    // Settings and term: the secretariat passes the guard (an empty body is then invalid), others are refused.
    for (const role of ["councillor", "contributor"] as const) {
      await expectStatus(role, (agent) => agent.put("/api/settings").send({}), [403]);
      await expectStatus(role, (agent) => agent.put("/api/council-terms").send({}), [403]);
    }
    await expectStatus("clerk", (agent) => agent.put("/api/settings").send({}), [400]);
    await expectStatus("clerk", (agent) => agent.put("/api/council-terms").send({}), [400]);

    // Accounts and audit: read by the secretariat and the administrator, accounts managed by the administrator only.
    for (const role of ["clerk", "administrator"] as const) {
      await expectStatus(role, (agent) => agent.get("/api/users"), [200]);
      await expectStatus(role, (agent) => agent.get("/api/audit-events"), [200]);
    }
    for (const role of ["councillor", "contributor"] as const) {
      await expectStatus(role, (agent) => agent.get("/api/users"), [403]);
      await expectStatus(role, (agent) => agent.get("/api/audit-events"), [403]);
    }
    await expectStatus("clerk", (agent) => agent.post("/api/users/passphrases").send({}), [403]);
    await expectStatus("administrator", (agent) => agent.post("/api/users/passphrases").send({}), [200]);
    const root = async (agent: TestAgent) =>
      (await agent.get("/api").expect(200)).body.links.map((link: { rel: string[] }) => link.rel[0]);
    expect(await root(roles.clerk)).toEqual(expect.arrayContaining(["users", "audit-events"]));
    expect(await root(roles.contributor)).not.toContain("users");
    expect(admin).toBe(roles.administrator);
  });

  it("rules every API action in the role matrix of the database", async () => {
    const { pool } = await matrixScenario();
    const mapped = (await pool.query<{ action: string }>("SELECT action FROM hall.action_access")).rows.map(
      (row) => row.action,
    );
    const anonymous = new Set(["session.login"]);
    expect(apiActionNames.filter((action) => !anonymous.has(action) && !mapped.includes(action))).toEqual([]);
  });

  // @verifies-requirement HALL-FR-USR-030
  it("lets the account of a meeting officer conduct that meeting and refuses any other account", async () => {
    const { admin, pool, alice, bruno, roles } = await matrixScenario();
    const meeting = domainBody<{ id: string }>(await admin.post("/api/council-meetings").send({}).expect(201));
    const business = domainBody<{ id: string }>(await createBusiness(admin, "Affaire de séance").expect(201));
    const subject = domainBody<{ id: string }>(
      await admin
        .post(`/api/council-business/${business.id}/prepared-subjects`)
        .send({ kind: "openQuestion", name: "Question", content: "" })
        .expect(201),
    );
    await admin
      .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
      .send({ kind: "openQuestion", subjectId: subject.id, position: 1 })
      .expect(201);
    const startsAt = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 60 * 60_000);
    await admin
      .put(`/api/council-meetings/${meeting.id}/prepare`)
      .send({
        scheduledAt: startsAt.toISOString(),
        location: "Salle du conseil",
        chairMemberId: alice.memberId,
        secretaryMemberId: bruno.memberId,
      })
      .expect(200);
    const council = new PostgresCouncil(pool);
    await council.freezeAgenda(databaseRequest, meeting.id);
    const noticeFacts = await council.noticeFacts(databaseRequest, meeting.id);
    if (!noticeFacts) throw new Error("Frozen meeting notice facts are required");
    await council.generateNotice(
      databaseRequest,
      meeting.id,
      { meeting: noticeFacts, issuedOn: null, hall: { name: "Commune", timeZone: "Europe/Paris" } },
      Buffer.from("%PDF-fixture"),
    );
    const opening = {
      chairMemberId: alice.memberId,
      secretaryMemberId: bruno.memberId,
      attendance: [
        { councilMemberId: alice.memberId, status: "present" },
        { councilMemberId: bruno.memberId, status: "present" },
      ],
    };
    const blockers = async (agent: TestAgent) =>
      (await agent.get(`/api/council-meetings/${meeting.id}`).expect(200)).body.properties.closureBlockers;
    expect(await blockers(roles.clerk)).toContainEqual({ code: "permissionDenied" });
    expect(await blockers(roles.councillor)).not.toContainEqual({ code: "permissionDenied" });
    for (const role of ["clerk", "contributor"] as const)
      await roles[role].post(`/api/council-meetings/${meeting.id}/record-opening`).send(opening).expect(403);
    await roles.councillor.post(`/api/council-meetings/${meeting.id}/record-opening`).send(opening).expect(200);
    await roles.clerk.post(`/api/council-meetings/${meeting.id}/close`).send({}).expect(403);
    expect(await blockers(admin)).not.toContainEqual({ code: "permissionDenied" });
  });
});
