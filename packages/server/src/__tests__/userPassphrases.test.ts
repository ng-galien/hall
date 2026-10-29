import { expect, it } from "vitest";
import { passphraseWords } from "../security/passphrase.js";
import { createTestServer } from "./testServer.js";

const admin = { email: "admin@example.fr", displayName: "Admin", password: "Admin-password-2026!" };

// @verifies-requirement HALL-FR-USR-010
// @verifies-requirement HALL-FR-USR-020
it("generates a hyphenated passphrase, revokes the access by disabling the account and reactivates it with a new one", async () => {
  const { rawAgent, statelessAgent } = await createTestServer({ devAutoLogin: false });
  await rawAgent.post("/api/auth/bootstrap").send(admin).expect(201);
  const collection = await rawAgent.get("/api/users").expect(200);
  expect(collection.body.actions.map((action: { name: string }) => action.name)).toContain("user.generate-passphrase");

  const generate = async () => {
    const response = await rawAgent.post("/api/users/passphrases").send({}).expect(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    return response.body.properties.passphrase as string;
  };
  const passphrase = await generate();
  const words = passphrase.split("-");
  expect(words).toHaveLength(5);
  expect(words.every((word) => passphraseWords().includes(word))).toBe(true);
  expect(passphrase.length).toBeGreaterThan(12);
  expect(passphraseWords().length).toBeGreaterThanOrEqual(1024);
  expect(await generate()).not.toBe(passphrase);

  const created = await rawAgent
    .post("/api/users")
    .send({ email: "elu@example.fr", displayName: "Élu", password: passphrase, roles: ["reader"], contactId: null })
    .expect(201);
  const userId: string = created.body.properties.id;
  const login = (password: string) =>
    statelessAgent.post("/api/auth/login").send({ email: "elu@example.fr", password });
  const session = (await login(passphrase).expect(200)).headers["set-cookie"][0].split(";", 1)[0] as string;
  await statelessAgent.get("/api/auth/session").set("Cookie", session).expect(200);

  const active = await rawAgent.get(`/api/users/${userId}`).expect(200);
  const activeActions = active.body.actions.map((action: { name: string }) => action.name);
  expect(activeActions).toContain("user.revoke-access");
  expect(activeActions).not.toContain("user.reactivate");

  const revoked = await rawAgent.post(`/api/users/${userId}/revoke-access`).send({}).expect(200);
  expect(revoked.body.properties.status).toBe("disabled");
  await statelessAgent.get("/api/auth/session").set("Cookie", session).expect(401);
  await login(passphrase).expect(401);
  const disabledActions = revoked.body.actions.map((action: { name: string }) => action.name);
  expect(disabledActions).toContain("user.reactivate");
  expect(disabledActions).not.toContain("user.revoke-access");

  const reactivated = await rawAgent.post(`/api/users/${userId}/reactivate`).send({}).expect(200);
  expect(reactivated.headers["cache-control"]).toBe("no-store");
  const renewed: string = reactivated.body.properties.passphrase;
  expect(reactivated.body.properties.status).toBe("active");
  expect(renewed.split("-")).toHaveLength(5);
  expect(renewed).not.toBe(passphrase);
  await login(passphrase).expect(401);
  await login(renewed).expect(200);
  const reread = await rawAgent.get(`/api/users/${userId}`).expect(200);
  expect(reread.body.properties).not.toHaveProperty("passphrase");
  await rawAgent.post(`/api/users/${userId}/reactivate`).send({}).expect(409);

  const audit = await rawAgent.get("/api/audit-events?limit=200").expect(200);
  const events = audit.body.entities.map(
    (entry: { properties: { action: string; targetId: string | null; outcome: string } }) => entry.properties,
  );
  expect(events).toContainEqual(
    expect.objectContaining({ action: "user.revoke-access", targetId: userId, outcome: "succeeded" }),
  );
  expect(events).toContainEqual(
    expect.objectContaining({ action: "user.reactivate", targetId: userId, outcome: "succeeded" }),
  );
  const serialized = JSON.stringify(audit.body);
  for (const secret of [passphrase, renewed]) expect(serialized).not.toContain(secret);
});
