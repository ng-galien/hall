import { expect, it, vi } from "vitest";
import { createTestServer } from "./testServer.js";

const admin = { email: "admin@example.fr", displayName: "Admin", password: "Admin-password-2026!" };
const oldPassword = "User-password-2026!";
const newPassword = "New-password-2026!";
const resetPassword = "Reset-password-2026!";

async function setup() {
  const server = await createTestServer({ devAutoLogin: false });
  await server.rawAgent.post("/api/auth/bootstrap").send(admin).expect(201);
  const response = await server.rawAgent
    .post("/api/users")
    .send({ email: "user@example.fr", displayName: "User", password: oldPassword, roles: ["reader"], contactId: null })
    .expect(201);
  const userId: string = response.body.properties.id;
  const login = async (password = oldPassword) => {
    const response = await server.statelessAgent
      .post("/api/auth/login")
      .send({ email: "user@example.fr", password })
      .expect(200);
    return response.headers["set-cookie"][0].split(";", 1)[0] as string;
  };
  return { ...server, userId, login };
}

it("allows administrators to edit identity/contact without changing permissions and rejects invalid or duplicate links", async () => {
  const { rawAgent, statelessAgent, userId, login } = await setup();
  const contact = await rawAgent.post("/api/contacts").send({ firstName: "Contact", lastName: "Identité" }).expect(201);
  const contactId = contact.body.properties.id;
  const input = { email: "edited@example.fr", displayName: "Edited", contactId };
  const selfCookie = await login();
  await statelessAgent.put(`/api/users/${userId}`).set("Cookie", selfCookie).send(input).expect(403);
  const edited = await rawAgent.put(`/api/users/${userId}`).send(input).expect(200);
  expect(edited.body.properties).toMatchObject({ ...input, roles: ["reader"], status: "active" });
  expect(edited.body.actions.map((action: { name: string }) => action.name)).toContain("user.update");
  const second = await rawAgent
    .post("/api/users")
    .send({ email: "second@example.fr", displayName: "Second", password: oldPassword, roles: ["reader"] })
    .expect(201);
  const secondId = second.body.properties.id;
  await rawAgent
    .put(`/api/users/${secondId}`)
    .send({ ...input, email: "second@example.fr" })
    .expect(409);
  await rawAgent
    .put(`/api/users/${secondId}`)
    .send({ ...input, contactId: null })
    .expect(409);
  await rawAgent
    .put(`/api/users/${userId}`)
    .send({ ...input, contactId: "00000000-0000-4000-8000-000000000001" })
    .expect(404);
  await rawAgent
    .put(`/api/users/${userId}`)
    .send({ ...input, roles: ["administrator"] })
    .expect(400);
  const detached = await rawAgent
    .put(`/api/users/${userId}`)
    .send({ ...input, contactId: null })
    .expect(200);
  expect(detached.body.properties.contactId).toBeNull();
});

it("changes own password only with the current secret, expires all sessions and never audits secrets", async () => {
  const { rawAgent, statelessAgent, userId, login } = await setup();
  const first = await login();
  const second = await login();
  const change = (currentPassword: string, next = newPassword) =>
    statelessAgent.post("/api/auth/change-password").set("Cookie", first).send({ currentPassword, newPassword: next });
  await change("incorrect-password").expect(400);
  await change(oldPassword, "short").expect(400);
  await statelessAgent.get("/api/auth/session").set("Cookie", second).expect(200);
  const changed = await change(oldPassword).expect(204);
  expect(changed.headers["set-cookie"][0]).toContain("Max-Age=0");
  for (const cookie of [first, second]) await statelessAgent.get("/api/auth/session").set("Cookie", cookie).expect(401);
  await statelessAgent.post("/api/auth/login").send({ email: "user@example.fr", password: oldPassword }).expect(401);
  await login(newPassword);
  const audit = await rawAgent.get("/api/audit-events").expect(200);
  expect(audit.body.entities.map((entry: { properties: unknown }) => entry.properties)).toContainEqual(
    expect.objectContaining({ action: "session.change-password", targetId: userId, outcome: "succeeded" }),
  );
  for (const secret of [oldPassword, newPassword, "incorrect-password"])
    expect(JSON.stringify(audit.body)).not.toContain(secret);
});

it("resets another account only as administrator, invalidates sessions and retains its roles", async () => {
  const { rawAgent, statelessAgent, userId, login } = await setup();
  const cookie = await login();
  await statelessAgent
    .post(`/api/users/${userId}/reset-password`)
    .set("Cookie", cookie)
    .send({ newPassword: resetPassword })
    .expect(403);
  await rawAgent.post(`/api/users/${userId}/reset-password`).send({ newPassword: "short" }).expect(400);
  await rawAgent.post(`/api/users/${userId}/reset-password`).send({ newPassword: resetPassword }).expect(204);
  await statelessAgent.get("/api/auth/session").set("Cookie", cookie).expect(401);
  await statelessAgent.post("/api/auth/login").send({ email: "user@example.fr", password: oldPassword }).expect(401);
  await login(resetPassword);
  const user = await rawAgent.get(`/api/users/${userId}`).expect(200);
  expect(user.body.properties).toMatchObject({ roles: ["reader"], status: "active" });
  expect(user.body.properties).not.toHaveProperty("passwordHash");
  const audit = await rawAgent.get("/api/audit-events").expect(200);
  expect(audit.body.entities.map((entry: { properties: unknown }) => entry.properties)).toContainEqual(
    expect.objectContaining({ action: "user.reset-password", targetId: userId, outcome: "succeeded" }),
  );
  expect(JSON.stringify(audit.body)).not.toContain(resetPassword);
});

it("cannot overwrite a concurrent administrator reset using an earlier password check", async () => {
  const { container, userId, login } = await setup();
  const repository = container.cradle.securityRepository;
  const find = repository.findUserById.bind(repository);
  let read!: () => void;
  let resume!: () => void;
  const reading = new Promise<void>((resolve) => {
    read = resolve;
  });
  const resumed = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const spy = vi.spyOn(repository, "findUserById").mockImplementationOnce(async (id) => {
    const previous = await find(id);
    read();
    await resumed;
    return previous;
  });
  try {
    const pending = container.cradle.authService.changePassword(userId, oldPassword, newPassword);
    const rejected = expect(pending).rejects.toMatchObject({ code: "conflict" });
    await reading;
    await container.cradle.authService.resetPassword(userId, resetPassword);
    resume();
    await rejected;
    await login(resetPassword);
  } finally {
    resume();
    spy.mockRestore();
  }
});

it("does not establish an old-password login after a concurrent reset", async () => {
  const { container, userId, login } = await setup();
  const repository = container.cradle.securityRepository;
  const find = repository.findUserByEmail.bind(repository);
  let read!: () => void;
  let resume!: () => void;
  const reading = new Promise<void>((resolve) => {
    read = resolve;
  });
  const resumed = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const spy = vi.spyOn(repository, "findUserByEmail").mockImplementationOnce(async (email) => {
    const previous = await find(email);
    read();
    await resumed;
    return previous;
  });
  try {
    const pending = container.cradle.authService.login("user@example.fr", oldPassword);
    const rejected = expect(pending).rejects.toMatchObject({ code: "invalid_credentials" });
    await reading;
    await container.cradle.authService.resetPassword(userId, resetPassword);
    resume();
    await rejected;
    await login(resetPassword);
  } finally {
    resume();
    spy.mockRestore();
  }
});
