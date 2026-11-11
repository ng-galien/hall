// @verifies-requirement HALL-FR-USR-070
import { expect, it } from "vitest";
import { createTestServer } from "../src/__tests__/testServer.js";

const temporary = "Temporary-passphrase-2026!";
const personal = "Personal-password-2026!";
const identity = { email: "temporary@example.test", displayName: "Temporary account", contactId: null };

async function fixture(passwordChangeRequired = true) {
  const server = await createTestServer({ devAutoLogin: false });
  await server.rawAgent
    .post("/api/auth/bootstrap")
    .send({
      email: "admin@example.test",
      displayName: "Administrator",
      password: "Admin-password-2026!",
    })
    .expect(201);
  const created = await server.rawAgent
    .post("/api/users")
    .send({
      ...identity,
      roles: ["contributor"],
      password: temporary,
      passwordChangeRequired,
    })
    .expect(201);
  const id: string = created.body.properties.id;
  const login = async (password = temporary) => {
    const result = await server.statelessAgent
      .post("/api/auth/login")
      .send({ email: identity.email, password })
      .expect(200);
    return result.headers["set-cookie"][0].split(";", 1)[0] as string;
  };
  return { ...server, id, login };
}

it("restricts a temporary session to personal replacement and logout, then invalidates its old secret and sessions", async () => {
  const { rawAgent, statelessAgent, id, login } = await fixture();
  const cookie = await login();
  const second = await login();
  const session = await statelessAgent.get("/api/auth/session").set("Cookie", cookie).expect(200);
  expect(session.body.properties.passwordChangeRequired).toBe(true);
  expect(session.body.actions.map((action: { name: string }) => action.name)).toEqual([
    "session.logout",
    "session.change-password",
  ]);
  for (const path of ["/api", "/api/users", `/api/users/${id}`, "/api/contacts", "/api/resources", "/api/settings"]) {
    const rejected = await statelessAgent.get(path).set("Cookie", cookie).expect(403);
    expect(rejected.body.code).toBe("password_change_required");
  }
  await statelessAgent
    .post("/mcp")
    .set("Cookie", cookie)
    .send({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    .expect(403);
  await statelessAgent
    .put(`/api/users/${id}`)
    .set("Cookie", cookie)
    .send({ ...identity, passwordChangeRequired: false })
    .expect(403);
  const change = (newPassword: string) =>
    statelessAgent.post("/api/auth/change-password").set("Cookie", cookie).send({ newPassword });
  expect((await change(temporary).expect(400)).body.code).toBe("password_must_differ");
  await change("short").expect(400);
  expect((await rawAgent.get(`/api/users/${id}`).expect(200)).body.properties.passwordChangeRequired).toBe(true);
  await change(personal).expect(204);
  for (const oldCookie of [cookie, second])
    await statelessAgent.get("/api/auth/session").set("Cookie", oldCookie).expect(401);
  expect((await rawAgent.get(`/api/users/${id}`).expect(200)).body.properties.passwordChangeRequired).toBe(false);
  await statelessAgent.post("/api/auth/login").send({ email: identity.email, password: temporary }).expect(401);
  const fresh = await login(personal);
  await statelessAgent.get("/api/contacts").set("Cookie", fresh).expect(200);
  const audit = await rawAgent.get("/api/audit-events").expect(200);
  expect(JSON.stringify(audit.body)).not.toContain(temporary);
  expect(JSON.stringify(audit.body)).not.toContain(personal);
});

it("marks an existing password explicitly, preserves it across identity changes and supports administrator reset and clearing", async () => {
  const { rawAgent, statelessAgent, id, login } = await fixture(false);
  const cookie = await login();
  await statelessAgent.get("/api/contacts").set("Cookie", cookie).expect(200);
  await statelessAgent
    .post("/api/auth/change-password")
    .set("Cookie", cookie)
    .send({ newPassword: personal })
    .expect(400);
  await rawAgent
    .put(`/api/users/${id}`)
    .send({ ...identity, passwordChangeRequired: true })
    .expect(200);
  await rawAgent.put(`/api/users/${id}`).send(identity).expect(200);
  expect((await rawAgent.get(`/api/users/${id}`)).body.properties.passwordChangeRequired).toBe(true);
  await statelessAgent.get("/api/auth/session").set("Cookie", cookie).expect(401);
  const limited = await login();
  await statelessAgent.get("/api/contacts").set("Cookie", limited).expect(403);
  await rawAgent
    .put(`/api/users/${id}`)
    .send({ ...identity, passwordChangeRequired: false })
    .expect(200);
  await statelessAgent.get("/api/contacts").set("Cookie", limited).expect(200);
  await statelessAgent.post("/api/auth/logout").set("Cookie", limited).expect(204);
  await rawAgent
    .post(`/api/users/${id}/reset-password`)
    .send({ newPassword: personal, passwordChangeRequired: true })
    .expect(204);
  const reset = await login(personal);
  await statelessAgent.get("/api/contacts").set("Cookie", reset).expect(403);
  await statelessAgent
    .post("/api/auth/change-password")
    .set("Cookie", reset)
    .send({ newPassword: temporary })
    .expect(204);
  await statelessAgent
    .get("/api/contacts")
    .set("Cookie", await login())
    .expect(200);
});
