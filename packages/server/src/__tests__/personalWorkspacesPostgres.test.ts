import { PostgresCouncil, PostgresDirectory } from "@hall/postgres";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createPostgresHttpTestServer, domainBody, type TestAgent } from "./testServer.js";

const postgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const password = "Personal-workspace-2026!";
const actionNames = (body: { actions?: Array<{ name: string }> }) => (body.actions ?? []).map(({ name }) => name);

async function personalWorkspaceScenario() {
  const { agent: admin, url, pool } = await createPostgresHttpTestServer({ devAutoLogin: false });
  await admin
    .post("/api/auth/bootstrap")
    .send({ email: "admin@example.fr", displayName: "Admin", password })
    .expect(201);
  await new PostgresDirectory(pool).configureActiveCouncilTerm(
    {
      role: "hall_api_authenticated",
      context: { requestId: "personal-fixture", actorId: "fixture", roles: ["administrator"], contactId: null },
    },
    5,
  );
  const member = async (firstName: string, lastName: string, role: "mayor" | "councillor") => {
    const contact = domainBody<{ id: string }>(
      await admin.post("/api/contacts").send({ firstName, lastName }).expect(201),
    );
    const created = domainBody<{ id: string }>(
      await admin
        .post("/api/council-members")
        .send({ contactId: contact.id, role, termStartedOn: "2026-03-22" })
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
  const mayor = await member("Marie", "Maire", "mayor");
  const alice = await member("Alice", "Martin", "councillor");
  const bruno = await member("Bruno", "Durand", "councillor");
  await admin.post("/api/resources").send({ kind: "folder", path: "", name: "Commun" }).expect(201);
  const commonText = domainBody<{ id: string; version: number }>(
    await admin
      .post("/api/resources")
      .send({ kind: "text", path: "Commun", name: "Note commune", content: "" })
      .expect(201),
  );
  return {
    admin,
    url,
    pool,
    mayor,
    alice,
    bruno,
    commonText,
    aliceAgent: await account("alice@example.fr", ["councillor"], alice.contactId),
    brunoAgent: await account("bruno@example.fr", ["councillor"], bruno.contactId),
    clerk: await account("clerk@example.fr", ["clerk"], null),
    contributor: await account("contributor@example.fr", ["contributor"], null),
  };
}

const createText = (agent: TestAgent, path: string, name: string) =>
  agent.post("/api/resources").send({ kind: "text", path, name, content: "" });

postgres("council member personal workspaces", () => {
  // @verifies-requirement HALL-FR-DIR-150
  // @verifies-requirement HALL-FR-WSP-380
  // @verifies-requirement HALL-FR-WSP-390
  // @verifies-requirement HALL-FR-WSP-400
  // @verifies-requirement HALL-FR-WSP-410
  // @verifies-requirement HALL-FR-DOC-550
  it("limits each role to its writable locations through the real HTTP surface", async () => {
    const { admin, aliceAgent, brunoAgent, clerk, contributor, commonText } = await personalWorkspaceScenario();
    const aliceFolder = "Espaces personnels/Alice Martin";

    const workspace = await aliceAgent.get("/api/resources/personal-workspace").expect(200);
    expect(workspace.body.properties.fullPath).toBe(aliceFolder);
    expect(actionNames(workspace.body)).not.toContain("resource.relocate");
    expect(actionNames(workspace.body)).not.toContain("resource.delete");
    await clerk.get("/api/resources/personal-workspace").expect(404);

    const root = await aliceAgent.get("/api/resources?path=").expect(200);
    expect(actionNames(root.body)).not.toContain("resource.create");
    const own = await aliceAgent.get(`/api/resources?path=${encodeURIComponent(aliceFolder)}`).expect(200);
    expect(actionNames(own.body)).toEqual(
      expect.arrayContaining(["resource.create", "resource.create-document", "resource.import-spreadsheet"]),
    );

    const draft = domainBody<{ id: string; version: number }>(
      await createText(aliceAgent, aliceFolder, "Brouillon").expect(201),
    );
    await aliceAgent
      .put(`/api/resources/${draft.id}/content`)
      .send({ kind: "text", expectedVersion: draft.version, content: "Proposition" })
      .expect(200);
    await aliceAgent.post("/api/resources").send({ kind: "folder", path: aliceFolder, name: "Projets" }).expect(201);
    await aliceAgent
      .patch(`/api/resources/${draft.id}/location`)
      .send({ path: `${aliceFolder}/Projets`, name: "Brouillon" })
      .expect(200);

    const common = await aliceAgent.get(`/api/resources/${commonText.id}`).expect(200);
    expect(actionNames(common.body)).toEqual([]);
    const workspaceState = async () =>
      JSON.stringify(
        await Promise.all(
          ["Commun", aliceFolder, `${aliceFolder}/Projets`].map(async (path) =>
            domainBody(await admin.get(`/api/resources?path=${encodeURIComponent(path)}`).expect(200)),
          ),
        ),
      ) + JSON.stringify(domainBody(await admin.get(`/api/resources/${commonText.id}`).expect(200)));
    const beforeRefusals = await workspaceState();
    await createText(aliceAgent, "Commun", "Intrusion").expect(403);
    await aliceAgent
      .put(`/api/resources/${commonText.id}/content`)
      .send({ kind: "text", expectedVersion: commonText.version, content: "Modifié" })
      .expect(403);
    await aliceAgent
      .patch(`/api/resources/${draft.id}/location`)
      .send({ path: "Commun", name: "Brouillon" })
      .expect(403);
    await createText(brunoAgent, aliceFolder, "Chez Alice").expect(403);
    await createText(contributor, aliceFolder, "Contribution").expect(403);
    await contributor
      .patch(`/api/resources/${draft.id}/location`)
      .send({ path: "Commun", name: "Brouillon" })
      .expect(403);
    expect(await workspaceState()).toBe(beforeRefusals);
    const listedForColleague = await brunoAgent.get(`/api/resources/${draft.id}`).expect(200);
    expect(actionNames(listedForColleague.body)).toEqual([]);

    const contribution = domainBody<{ id: string }>(
      await createText(contributor, "Commun", "Contribution").expect(201),
    );
    const contributed = await contributor.get(`/api/resources/${contribution.id}`).expect(200);
    expect(actionNames(contributed.body)).toEqual(
      expect.arrayContaining(["resource.relocate", "resource.update-content", "resource.delete"]),
    );
    await contributor.delete(`/api/resources/${contribution.id}`).expect(204);

    await createText(clerk, aliceFolder, "Ajout du secrétariat").expect(201);
    const beforeTakeover = await admin.get(`/api/resources/${draft.id}`).expect(200);
    const changesBefore = domainBody<{ changes: unknown[] }>(
      await admin.get(`/api/resources/${draft.id}/changes`).expect(200),
    ).changes.length;
    await clerk.patch(`/api/resources/${draft.id}/location`).send({ path: "Commun", name: "Brouillon" }).expect(200);
    const takenOver = await aliceAgent.get(`/api/resources/${draft.id}`).expect(200);
    expect(takenOver.body.properties.fullPath).toBe("Commun/Brouillon");
    expect(actionNames(takenOver.body)).toEqual([]);
    // The public address, the links and the content are those of the document before its takeover.
    expect(takenOver.body.properties.slug).toBe(beforeTakeover.body.properties.slug);
    expect(takenOver.body.links).toEqual(beforeTakeover.body.links);
    expect(takenOver.body.properties.content).toBe("Proposition");
    expect(takenOver.body.class).toEqual(["resource"]);
    expect(beforeTakeover.body.class).toEqual(["resource", "personal-workspace"]);
    await aliceAgent.get(`/api/resources/${beforeTakeover.body.properties.slug}`).expect(200);
    const changes = domainBody<{ changes: Array<{ actor: { displayName: string } | null }> }>(
      await admin.get(`/api/resources/${draft.id}/changes`).expect(200),
    );
    expect(changes.changes.map((change) => change.actor?.displayName)).toEqual(
      expect.arrayContaining(["alice@example.fr", "clerk@example.fr"]),
    );
    expect(changes.changes).toHaveLength(changesBefore + 1);
  });

  // @verifies-requirement HALL-FR-DIR-150
  it("grants the council member role only to an account linked to an elected member in office", async () => {
    const { admin } = await personalWorkspaceScenario();
    const contact = domainBody<{ id: string }>(
      await admin.post("/api/contacts").send({ firstName: "Sans", lastName: "Mandat" }).expect(201),
    );
    const refused = await admin
      .post("/api/users")
      .send({ email: "sans@example.fr", displayName: "Sans", password, roles: ["councillor"], contactId: contact.id })
      .expect(422);
    expect(refused.body.code ?? refused.body.type).toMatch(/councillor_requires_active_member/);
    await admin
      .post("/api/users")
      .send({ email: "anonyme@example.fr", displayName: "Anonyme", password, roles: ["councillor"], contactId: null })
      .expect(422);
  });

  // @verifies-requirement HALL-FR-WSP-420
  it("keeps the pieces of an affair in the common folders", async () => {
    const { admin, clerk } = await personalWorkspaceScenario();
    const business = domainBody<{ id: string }>(
      await admin
        .post("/api/council-business")
        .send({ path: "Commun", name: "Affaire", reportName: "Rapport", reportContent: "" })
        .expect(201),
    );
    const personal = domainBody<{ id: string }>(
      await createText(clerk, "Espaces personnels/Alice Martin", "Proposition").expect(201),
    );
    const refused = await admin
      .post(`/api/council-business/${business.id}/resources`)
      .send({ resourceId: personal.id })
      .expect(409);
    expect(JSON.stringify(refused.body)).toContain("personal_workspace_resource_not_associable");
    await clerk
      .patch(`/api/resources/${personal.id}/location`)
      .send({ path: "Commun", name: "Proposition" })
      .expect(200);
    await admin.post(`/api/council-business/${business.id}/resources`).send({ resourceId: personal.id }).expect(201);
    await admin
      .patch(`/api/resources/${personal.id}/location`)
      .send({ path: "Espaces personnels/Alice Martin", name: "Proposition" })
      .expect(409);
  });

  // @verifies-requirement HALL-FR-DIR-160
  it("disables the account of a council member whose mandate ends", async () => {
    const { admin, aliceAgent, alice, clerk, url } = await personalWorkspaceScenario();
    await admin
      .put(`/api/council-members/${alice.memberId}`)
      .send({ role: "councillor", rank: null, termStartedOn: "2026-03-22", termEndedOn: "2026-10-25" })
      .expect(200);
    await aliceAgent.get("/api/resources?path=").expect(401);
    await request(url).post("/api/auth/login").send({ email: "alice@example.fr", password }).expect(401);
    const users = domainBody<Array<{ email: string; status: string }>>(await admin.get("/api/users").expect(200));
    expect(users.find((user) => user.email === "alice@example.fr")?.status).toBe("disabled");
    await createText(clerk, "Espaces personnels/Alice Martin", "Suite").expect(201);
  });

  // @verifies-requirement HALL-FR-DIR-150
  // @verifies-requirement HALL-FR-DIR-160
  it("fails on the safe side across the two transactions and converges on retry", async () => {
    const { admin, alice, aliceAgent, mayor, url } = await personalWorkspaceScenario();
    const contact = domainBody<{ id: string }>(
      await admin.post("/api/contacts").send({ firstName: "Chloé", lastName: "Petit" }).expect(201),
    );
    await admin
      .post("/api/council-members")
      .send({ contactId: contact.id, role: "councillor", termStartedOn: "2026-03-22" })
      .expect(201);
    const personalFolders = async () =>
      domainBody<Array<{ name: string; id: string }>>(
        await admin.get(`/api/resources?path=${encodeURIComponent("Espaces personnels")}`).expect(200),
      ).filter((folder) => folder.name.startsWith("Chloé Petit"));

    // The folder is provisioned first; the account creation then fails on its duplicate email.
    await admin
      .post("/api/users")
      .send({ email: "alice@example.fr", displayName: "Chloé", password, roles: ["councillor"], contactId: contact.id })
      .expect(409);
    const afterFailure = await personalFolders();
    expect(afterFailure).toHaveLength(1);
    const users = domainBody<Array<{ contactId: string | null }>>(await admin.get("/api/users").expect(200));
    expect(users.some((user) => user.contactId === contact.id)).toBe(false);
    await admin
      .post("/api/users")
      .send({ email: "chloe@example.fr", displayName: "Chloé", password, roles: ["councillor"], contactId: contact.id })
      .expect(201);
    expect(await personalFolders()).toEqual(afterFailure);

    // The account is disabled first; recording the end of the mandate then fails in
    // PostgreSQL, here on a rank already held by another member of the term.
    await admin
      .put(`/api/council-members/${mayor.memberId}`)
      .send({ role: "mayor", rank: 1, termStartedOn: "2026-03-22", termEndedOn: null })
      .expect(200);
    const failed = await admin
      .put(`/api/council-members/${alice.memberId}`)
      .send({ role: "councillor", rank: 1, termStartedOn: "2026-03-22", termEndedOn: "2026-10-25" });
    expect(failed.status).toBe(409);
    await aliceAgent.get("/api/resources?path=").expect(401);
    await request(url).post("/api/auth/login").send({ email: "alice@example.fr", password }).expect(401);
    const stillActive = domainBody<{ active: boolean; termEndedOn: string | null }>(
      await admin.get(`/api/council-members/${alice.memberId}`).expect(200),
    );
    expect(stillActive).toMatchObject({ active: true, termEndedOn: null });
    await admin
      .put(`/api/council-members/${alice.memberId}`)
      .send({ role: "councillor", rank: null, termStartedOn: "2026-03-22", termEndedOn: "2026-10-25" })
      .expect(200);
    const ended = domainBody<{ termEndedOn: string | null }>(
      await admin.get(`/api/council-members/${alice.memberId}`).expect(200),
    );
    expect(ended.termEndedOn).toBe("2026-10-25");
    const accounts = domainBody<Array<{ email: string; status: string }>>(await admin.get("/api/users").expect(200));
    expect(accounts.find((account) => account.email === "alice@example.fr")?.status).toBe("disabled");
  });

  // @verifies-requirement HALL-FR-WSP-400
  it("lets a council member follow a meeting in progress without conduct actions", async () => {
    const { admin, aliceAgent, pool, mayor, alice, bruno } = await personalWorkspaceScenario();
    const meeting = domainBody<{ id: string }>(await admin.post("/api/council-meetings").send({}).expect(201));
    await admin
      .put(`/api/council-meetings/${meeting.id}/prepare`)
      .send({
        scheduledAt: "2026-09-05T18:00:00.000Z",
        location: "Salle du conseil",
        chairMemberId: mayor.memberId,
        secretaryMemberId: mayor.memberId,
      })
      .expect(200);
    const business = domainBody<{ id: string }>(
      await admin
        .post("/api/council-business")
        .send({ path: "", name: "Sujet suivi", reportName: "Rapport", reportContent: "" })
        .expect(201),
    );
    const subject = domainBody<{ id: string }>(
      await admin
        .post(`/api/council-business/${business.id}/prepared-subjects`)
        .send({ kind: "openQuestion", name: "Question suivie", content: "" })
        .expect(201),
    );
    await admin
      .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
      .send({ kind: "openQuestion", subjectId: subject.id, position: 1 })
      .expect(201);
    const databaseRequest = {
      role: "hall_api_authenticated" as const,
      context: { requestId: "personal-meeting", actorId: "fixture", roles: ["administrator"], contactId: null },
    };
    const council = new PostgresCouncil(pool);
    await council.freezeAgenda(databaseRequest, meeting.id);
    const noticeFacts = await council.noticeFacts(databaseRequest, meeting.id);
    if (!noticeFacts) throw new Error("Frozen meeting notice facts are required");
    await council.generateNotice(
      databaseRequest,
      meeting.id,
      { meeting: noticeFacts, issuedOn: null, hall: { name: "Commune test", timeZone: "Europe/Paris" } },
      Buffer.from("%PDF-fixture"),
    );
    await admin
      .post(`/api/council-meetings/${meeting.id}/record-opening`)
      .send({
        observedAt: "2026-09-05T18:05:00.000Z",
        chairMemberId: mayor.memberId,
        secretaryMemberId: mayor.memberId,
        attendance: [
          { councilMemberId: mayor.memberId, status: "present" },
          { councilMemberId: alice.memberId, status: "present" },
          { councilMemberId: bruno.memberId, status: "present" },
        ],
      })
      .expect(200);
    const followed = await aliceAgent.get(`/api/council-meetings/${meeting.id}`).expect(200);
    expect(followed.body.properties.id).toBe(meeting.id);
    const agenda = await aliceAgent.get(`/api/council-meetings/${meeting.id}/agenda-items`).expect(200);
    expect(JSON.stringify(agenda.body)).toContain(subject.id);
    const attendance = await aliceAgent.get(`/api/council-meetings/${meeting.id}/attendance`).expect(200);
    expect(JSON.stringify(attendance.body)).toContain(alice.memberId);
    const conduct = await aliceAgent.get(`/api/council-meetings/${meeting.id}/conduct`).expect(200);
    const offered = JSON.stringify([followed.body, agenda.body, attendance.body, conduct.body]);
    expect(offered).not.toMatch(/"name":"(meeting|agenda-item|ballot|minutes)\.[a-z-]+"/);
    const conductedByAdministrator = await admin.get(`/api/council-meetings/${meeting.id}/conduct`).expect(200);
    expect(JSON.stringify(conductedByAdministrator.body)).toMatch(/"name":"(meeting|agenda-item|ballot)\.[a-z-]+"/);
  });
});
