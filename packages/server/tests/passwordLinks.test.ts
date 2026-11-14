// @verifies-requirement HALL-FR-USR-080
// @verifies-requirement HALL-FR-USR-090
import { expect, it, vi } from "vitest";
import { createTestServer, domainBody } from "../src/__tests__/testServer.js";
import type { EmailPayload, EmailTransport, EmailTransportResult } from "../src/services/emailTransport.js";

const adminPassword = "Admin-password-2026!";
const chosen = "Chosen-password-2026!";

/** Accepts every email unless a test queues another outcome. */
class SimulatedTransport implements EmailTransport {
  readonly calls: EmailPayload[] = [];
  readonly outcomes: Array<EmailTransportResult | Error> = [];
  async send(payload: EmailPayload): Promise<EmailTransportResult> {
    this.calls.push(structuredClone(payload));
    const outcome = this.outcomes.shift() ?? { status: "accepted", adapter: "simulated" };
    if (outcome instanceof Error) throw outcome;
    return outcome;
  }
}

async function setup(options: { publicOrigin?: string | null } = {}) {
  const transport = new SimulatedTransport();
  const clock = { current: new Date("2026-11-12T09:00:00.000Z"), now: () => new Date(clock.current) };
  const advance = (minutes: number) => {
    clock.current = new Date(clock.current.getTime() + minutes * 60_000);
  };
  const server = await createTestServer({
    emailTransport: transport,
    clock,
    devAutoLogin: false,
    config: {
      publicOrigin: options.publicOrigin === null ? undefined : (options.publicOrigin ?? "https://hall.example.org"),
    },
  });
  await server.agent
    .post("/api/auth/bootstrap")
    .send({ email: "admin@example.test", displayName: "Administrator", password: adminPassword })
    .expect(201);
  const settings = domainBody(await server.agent.get("/api/settings").expect(200));
  await server.agent
    .put("/api/settings")
    .send({ ...settings, name: "Alésia", outboundEmailSenderAddress: "mairie@example.org" })
    .expect(200);
  const tokenOf = (payload: EmailPayload | undefined) => {
    const match = payload?.text.match(/https:\/\/hall\.example\.org\/app\/password-link#([A-Za-z0-9_-]{43})/);
    if (!match?.[1]) throw new Error("The email carries no password link");
    return match[1];
  };
  const login = (email: string, password: string) =>
    server.statelessAgent.post("/api/auth/login").send({ email, password });
  const create = async (email: string, roles = ["contributor"]) =>
    domainBody<{ id: string; roles: string[]; accountMail: { kind: string; outcome: string } | null }>(
      await server.agent.post("/api/users").send({ email, displayName: "Camille Martin", roles }).expect(201),
    );
  const emailsTo = (address: string) =>
    transport.calls.filter((call) => call.recipients.some((recipient) => recipient.address === address));
  return { ...server, transport, clock, advance, tokenOf, login, create, emailsTo };
}

it("A1 invites a new account by email and lets its holder choose a password and sign in with the given roles", async () => {
  const server = await setup();
  const created = await server.create("camille@example.test", ["clerk"]);
  expect(created.accountMail).toMatchObject({ kind: "invitation", outcome: "sent" });
  const invitation = server.emailsTo("camille@example.test")[0];
  expect(invitation).toMatchObject({ subject: "Votre accès à Hall", senderAddress: "mairie@example.org" });
  expect(invitation?.html).toContain("Choisir mon mot de passe");
  expect(invitation?.text).toContain("sept jours");
  const token = server.tokenOf(invitation);
  const opened = await server.statelessAgent.post("/api/auth/password-links/open").send({ token }).expect(200);
  expect(domainBody(opened)).toEqual({ purpose: "invitation", email: "camille@example.test" });
  await server.statelessAgent
    .post("/api/auth/password-links/complete")
    .send({ token, newPassword: chosen })
    .expect(204);
  const signedIn = await server.login("camille@example.test", chosen).expect(200);
  expect(domainBody<{ roles: string[] }>(signedIn).roles).toEqual(["clerk"]);
  await vi.waitFor(() => expect(server.emailsTo("camille@example.test")).toHaveLength(2));
  expect(server.emailsTo("camille@example.test")[1]?.subject).toBe("Votre mot de passe Hall a été modifié");
});

it("A1 keeps the account created when the invitation fails and resends it from the user page", async () => {
  const server = await setup();
  server.transport.outcomes.push({ status: "failed", code: "outlook_account_unavailable" });
  const created = await server.create("echec@example.test");
  expect(created.accountMail).toMatchObject({
    kind: "invitation",
    outcome: "failed",
    failureCode: "outlook_account_unavailable",
  });
  const page = await server.agent.get(`/api/users/${created.id}`).expect(200);
  expect(page.body.actions.map((action: { name: string }) => action.name)).toContain("user.send-password-link");
  server.advance(2);
  const resent = await server.agent
    .post(`/api/users/${created.id}/password-links`)
    .send({ purpose: "invitation" })
    .expect(200);
  expect(domainBody<{ accountMail: unknown }>(resent).accountMail).toMatchObject({
    kind: "invitation",
    outcome: "sent",
    failureCode: null,
  });
  server.transport.outcomes.push(new Error("transport crashed"));
  server.advance(2);
  const uncertain = await server.agent
    .post(`/api/users/${created.id}/password-links`)
    .send({ purpose: "invitation" })
    .expect(200);
  expect(domainBody<{ accountMail: unknown }>(uncertain).accountMail).toMatchObject({
    outcome: "unknown",
    failureCode: "transport_submission_uncertain",
  });
});

it("A1 records a failure without calling the transport when the public origin is not configured", async () => {
  const server = await setup({ publicOrigin: null });
  const created = await server.create("sans-adresse@example.test");
  expect(created.accountMail).toMatchObject({
    kind: "invitation",
    outcome: "failed",
    failureCode: "public_origin_not_configured",
  });
  expect(server.transport.calls).toHaveLength(0);
});

it("A2 A3 answers the same for every address and lets an active holder choose a new password alone", async () => {
  const server = await setup();
  const created = await server.create("oubli@example.test");
  await server.statelessAgent
    .post("/api/auth/password-links/complete")
    .send({ token: server.tokenOf(server.emailsTo("oubli@example.test")[0]), newPassword: "First-password-2026!" })
    .expect(204);
  const disabled = await server.create("parti@example.test");
  await server.agent.post(`/api/users/${disabled.id}/disable`).expect(200);
  await vi.waitFor(() => expect(server.emailsTo("oubli@example.test")).toHaveLength(2));
  server.advance(5);
  const before = server.transport.calls.length;
  const answers = [];
  for (const email of ["oubli@example.test", "inconnu@example.test", "parti@example.test"]) {
    const answer = await server.statelessAgent.post("/api/auth/password-links").send({ email });
    answers.push({ status: answer.status, body: answer.text });
  }
  expect(new Set(answers.map((answer) => JSON.stringify(answer))).size).toBe(1);
  expect(answers[0]?.status).toBe(204);
  await vi.waitFor(() => expect(server.transport.calls.length).toBe(before + 1));
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(server.transport.calls.length).toBe(before + 1);
  const recovery = server.emailsTo("oubli@example.test").at(-1);
  expect(recovery?.subject).toBe("Réinitialiser votre mot de passe Hall");
  expect(recovery?.html).toContain("Choisir un nouveau mot de passe");
  expect(recovery?.text).toContain("une heure");
  expect(server.emailsTo("parti@example.test")).toHaveLength(1);
  await server.login("oubli@example.test", "First-password-2026!").expect(200);
  const unchanged = domainBody<{ updatedAt: string }>(await server.agent.get(`/api/users/${created.id}`).expect(200));
  await server.statelessAgent
    .post("/api/auth/password-links/complete")
    .send({ token: server.tokenOf(recovery), newPassword: chosen })
    .expect(204);
  await server.login("oubli@example.test", chosen).expect(200);
  expect(
    domainBody<{ updatedAt: string }>(await server.agent.get(`/api/users/${created.id}`).expect(200)).updatedAt,
  ).not.toBe(unchanged.updatedAt);
});

it("A3 a request alone changes no account", async () => {
  const server = await setup();
  const created = await server.create("intact@example.test");
  const before = await server.agent.get(`/api/users/${created.id}`).expect(200);
  server.advance(2);
  await server.statelessAgent.post("/api/auth/password-links").send({ email: "intact@example.test" }).expect(204);
  await vi.waitFor(() => expect(server.emailsTo("intact@example.test")).toHaveLength(2));
  const after = await server.agent.get(`/api/users/${created.id}`).expect(200);
  const { accountMail: _before, ...identityBefore } = domainBody<Record<string, unknown>>(before);
  const { accountMail: _after, ...identityAfter } = domainBody<Record<string, unknown>>(after);
  expect(identityAfter).toEqual(identityBefore);
});

it("A4 refuses expired, used, superseded and concurrent uses, and opening never uses a link", async () => {
  const server = await setup();
  await server.create("lien@example.test");
  const invitation = server.tokenOf(server.emailsTo("lien@example.test")[0]);
  for (let index = 0; index < 3; index += 1)
    await server.statelessAgent.post("/api/auth/password-links/open").send({ token: invitation }).expect(200);
  server.advance(7 * 24 * 60);
  const expired = await server.statelessAgent
    .post("/api/auth/password-links/complete")
    .send({ token: invitation, newPassword: chosen })
    .expect(410);
  expect(expired.body.code).toBe("password_link_unusable");
  await server.statelessAgent.post("/api/auth/password-links/open").send({ token: invitation }).expect(410);

  await server.statelessAgent.post("/api/auth/password-links").send({ email: "lien@example.test" }).expect(204);
  await vi.waitFor(() => expect(server.emailsTo("lien@example.test")).toHaveLength(2));
  const first = server.tokenOf(server.emailsTo("lien@example.test")[1]);
  server.advance(2);
  await server.statelessAgent.post("/api/auth/password-links").send({ email: "lien@example.test" }).expect(204);
  await vi.waitFor(() => expect(server.emailsTo("lien@example.test")).toHaveLength(3));
  const second = server.tokenOf(server.emailsTo("lien@example.test")[2]);
  await server.statelessAgent
    .post("/api/auth/password-links/complete")
    .send({ token: first, newPassword: chosen })
    .expect(410);

  const attempts = await Promise.all(
    ["Concurrent-one-2026!", "Concurrent-two-2026!"].map((newPassword) =>
      server.statelessAgent.post("/api/auth/password-links/complete").send({ token: second, newPassword }),
    ),
  );
  expect(attempts.map((attempt) => attempt.status).filter((status) => status === 204)).toHaveLength(1);
  const winner = attempts.findIndex((attempt) => attempt.status === 204);
  expect(attempts[1 - winner]?.status).toBeGreaterThanOrEqual(400);
  await server.login("lien@example.test", winner === 0 ? "Concurrent-one-2026!" : "Concurrent-two-2026!").expect(200);
  await server.login("lien@example.test", winner === 0 ? "Concurrent-two-2026!" : "Concurrent-one-2026!").expect(401);
  await server.statelessAgent
    .post("/api/auth/password-links/complete")
    .send({ token: second, newPassword: chosen })
    .expect(410);
});

it("A5 refuses the old password, the old sessions and the old links after a change, and confirms it to the holder", async () => {
  const server = await setup();
  const created = await server.create("change@example.test");
  await server.statelessAgent
    .post("/api/auth/password-links/complete")
    .send({ token: server.tokenOf(server.emailsTo("change@example.test")[0]), newPassword: "Old-password-2026!" })
    .expect(204);
  const session = (await server.login("change@example.test", "Old-password-2026!").expect(200)).headers[
    "set-cookie"
  ][0].split(";", 1)[0] as string;
  server.advance(2);
  await server.agent.post(`/api/users/${created.id}/password-links`).send({ purpose: "recovery" }).expect(200);
  const pending = server.tokenOf(server.emailsTo("change@example.test").at(-1));
  server.advance(1);
  await server.statelessAgent
    .post("/api/auth/change-password")
    .set("Cookie", session)
    .send({ currentPassword: "Old-password-2026!", newPassword: chosen })
    .expect(204);
  await server.statelessAgent.get("/api/auth/session").set("Cookie", session).expect(401);
  await server.login("change@example.test", "Old-password-2026!").expect(401);
  await server.statelessAgent.post("/api/auth/password-links/open").send({ token: pending }).expect(410);
  await vi.waitFor(() =>
    expect(server.emailsTo("change@example.test").filter((mail) => mail.subject.includes("modifié"))).toHaveLength(2),
  );
  const confirmation = server.emailsTo("change@example.test").at(-1);
  expect(confirmation?.subject).toBe("Votre mot de passe Hall a été modifié");
  expect(confirmation?.text).not.toMatch(/https?:\/\//);
  expect(confirmation?.text).not.toContain(chosen);
  await vi.waitFor(async () => {
    const record = domainBody<{ accountMail: unknown }>(await server.agent.get(`/api/users/${created.id}`).expect(200));
    expect(record.accountMail).toMatchObject({ kind: "password-changed", outcome: "sent" });
  });

  await server.agent
    .post(`/api/users/${created.id}/reset-password`)
    .send({ newPassword: "Hand-delivered-2026!", passwordChangeRequired: true })
    .expect(204);
  await vi.waitFor(() =>
    expect(server.emailsTo("change@example.test").filter((mail) => mail.subject.includes("modifié"))).toHaveLength(3),
  );
});

it("A6 sends nothing for a fourth request in an hour and keeps the account usable", async () => {
  const server = await setup();
  const created = await server.create("frequence@example.test");
  await server.statelessAgent
    .post("/api/auth/password-links/complete")
    .send({ token: server.tokenOf(server.emailsTo("frequence@example.test")[0]), newPassword: chosen })
    .expect(204);
  await vi.waitFor(() => expect(server.emailsTo("frequence@example.test")).toHaveLength(2));
  const tooSoon = await server.agent
    .post(`/api/users/${created.id}/password-links`)
    .send({ purpose: "recovery" })
    .expect(429);
  expect(tooSoon.body.code).toBe("password_link_too_frequent");
  for (const expected of [3, 4]) {
    server.advance(2);
    await server.statelessAgent.post("/api/auth/password-links").send({ email: "frequence@example.test" }).expect(204);
    await vi.waitFor(() => expect(server.emailsTo("frequence@example.test")).toHaveLength(expected));
  }
  server.advance(2);
  await server.statelessAgent.post("/api/auth/password-links").send({ email: "frequence@example.test" }).expect(204);
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(server.emailsTo("frequence@example.test")).toHaveLength(4);
  await server.login("frequence@example.test", chosen).expect(200);
  server.advance(60);
  await server.agent.post(`/api/users/${created.id}/password-links`).send({ purpose: "recovery" }).expect(200);
  expect(server.emailsTo("frequence@example.test")).toHaveLength(5);
});

it("A7 keeps links and passwords out of the journal, the lists and the user page, and refuses an account without permission", async () => {
  const server = await setup();
  const created = await server.create("secret@example.test");
  const token = server.tokenOf(server.emailsTo("secret@example.test")[0]);
  await server.statelessAgent
    .post("/api/auth/password-links/complete")
    .send({ token, newPassword: chosen })
    .expect(204);
  const reader = await server.agent
    .post("/api/users")
    .send({
      email: "lecteur@example.test",
      displayName: "Lecteur",
      roles: ["contributor"],
      password: "Reader-password-2026!",
    })
    .expect(201);
  const cookie = (await server.login("lecteur@example.test", "Reader-password-2026!").expect(200)).headers[
    "set-cookie"
  ][0].split(";", 1)[0] as string;
  const refused = await server.statelessAgent
    .post(`/api/users/${created.id}/password-links`)
    .set("Cookie", cookie)
    .send({ purpose: "recovery" });
  expect(refused.status).toBe(403);
  expect(domainBody<{ id: string }>(reader).id).toBeTruthy();
  const listing = JSON.stringify((await server.agent.get("/api/users").expect(200)).body);
  const page = JSON.stringify((await server.agent.get(`/api/users/${created.id}`).expect(200)).body);
  const journal = JSON.stringify((await server.agent.get("/api/audit-events").expect(200)).body);
  for (const text of [listing, page, journal]) {
    expect(text).not.toContain(token);
    expect(text).not.toContain(chosen);
    expect(text).not.toContain("password-link#");
    expect(text).not.toContain("password_hash");
  }
  expect(journal).toContain("session.complete-password-link");
  const rows = await server.container.cradle.postgresPool.query<{ token_hash: string }>(
    "SELECT token_hash FROM hall.account_password_link",
  );
  expect(rows.rows.map((row) => row.token_hash)).not.toContain(token);
});
