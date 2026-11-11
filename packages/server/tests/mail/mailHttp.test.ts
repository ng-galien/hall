import { randomUUID } from "node:crypto";
import type { MailMessage, MailPreview } from "@hall/contracts";
import { expect, it } from "vitest";
import { createTestServer, domainBody } from "../../src/__tests__/testServer.js";
import { RecordingEmailTransport } from "../support/emailTransport.js";

async function setup() {
  const transport = new RecordingEmailTransport();
  const server = await createTestServer({ emailTransport: transport, devAutoLogin: false });
  await server.agent
    .post("/api/auth/bootstrap")
    .send({
      email: "mail-admin@example.test",
      displayName: "Mail administrator",
      password: "Mail-admin-password-2026!",
    })
    .expect(201);
  const settings = domainBody(await server.agent.get("/api/settings").expect(200));
  await server.agent
    .put("/api/settings")
    .send({ ...settings, name: "Test municipality", outboundEmailSenderAddress: "town@example.org" })
    .expect(200);
  return { ...server, transport };
}
async function draft(server: Awaited<ReturnType<typeof setup>>) {
  return domainBody<MailMessage>(
    await server.agent
      .post("/api/mail")
      .send({
        subject: "Council papers",
        bodyMarkdown: "A **shared** draft.",
        recipients: [{ kind: "to", name: "Member", address: "member@example.org", contactId: null }],
      })
      .expect(201),
  );
}

// @verifies-requirement HALL-FR-EML-010
// @verifies-requirement HALL-FR-EML-060
it("persists shared mail, submits once and returns the same result after a repeated command", async () => {
  const server = await setup();
  const message = await draft(server);
  const preview = domainBody<MailPreview>(await server.agent.get(`/api/mail/${message.id}/preview`).expect(200));
  expect(preview.issues).toEqual([]);
  expect(preview.html).toContain("<strong>shared</strong>");
  server.transport.outcomes.push({ status: "accepted", adapter: "outlook" });
  const input = { expectedRevision: message.revision, fingerprint: preview.fingerprint, requestKey: randomUUID() };
  const first = domainBody<MailMessage>(
    await server.agent.post(`/api/mail/${message.id}/send`).send(input).expect(200),
  );
  expect(first.submissions[0]?.status).toBe("accepted");
  const again = domainBody<MailMessage>(
    await server.agent.post(`/api/mail/${message.id}/send`).send(input).expect(200),
  );
  expect(again.submissions[0]?.id).toBe(first.submissions[0]?.id);
  expect(server.transport.calls).toHaveLength(1);
  await server.agent
    .put(`/api/mail/${message.id}`)
    .send({
      subject: "Changed",
      bodyMarkdown: message.bodyMarkdown,
      recipients: message.recipients,
      expectedRevision: message.revision,
    })
    .expect(409);
});

// @verifies-requirement HALL-FR-EML-060
it("requires recorded Outlook verification after an uncertain result before retry", async () => {
  const server = await setup();
  const message = await draft(server);
  const preview = domainBody<MailPreview>(await server.agent.get(`/api/mail/${message.id}/preview`).expect(200));
  server.transport.outcomes.push({ status: "unknown", code: "outlook_submission_uncertain" });
  const input = { expectedRevision: message.revision, fingerprint: preview.fingerprint, requestKey: randomUUID() };
  const result = domainBody<MailMessage>(
    await server.agent.post(`/api/mail/${message.id}/send`).send(input).expect(200),
  );
  const submission = result.submissions[0]!;
  await server.agent
    .post(`/api/mail/${message.id}/send`)
    .send({ ...input, requestKey: randomUUID() })
    .expect(409);
  expect(server.transport.calls).toHaveLength(1);
  await server.agent
    .post(`/api/mail/${message.id}/submissions/${submission.id}/verification`)
    .send({ outcome: "not-sent", notes: "Checked Outbox and Sent Items in Outlook." })
    .expect(200);
  server.transport.outcomes.push({ status: "accepted", adapter: "outlook" });
  await server.agent
    .post(`/api/mail/${message.id}/send`)
    .send({ ...input, requestKey: randomUUID() })
    .expect(200);
  expect(server.transport.calls).toHaveLength(2);
});

// @verifies-requirement HALL-FR-EML-060
it("rejects a stale review before making a transport call", async () => {
  const server = await setup();
  const message = await draft(server);
  const preview = domainBody<MailPreview>(await server.agent.get(`/api/mail/${message.id}/preview`).expect(200));
  await server.agent
    .put(`/api/mail/${message.id}`)
    .send({
      subject: "Updated",
      bodyMarkdown: message.bodyMarkdown,
      recipients: message.recipients,
      expectedRevision: message.revision,
    })
    .expect(200);
  await server.agent
    .post(`/api/mail/${message.id}/send`)
    .send({ expectedRevision: message.revision, fingerprint: preview.fingerprint, requestKey: randomUUID() })
    .expect(409);
  expect(server.transport.calls).toHaveLength(0);
});

// @verifies-requirement HALL-FR-EML-040
it("retains uploaded attachment bytes and the rendered message after settings change, including copied attachments", async () => {
  const server = await setup();
  let message = await draft(server);
  message = domainBody<MailMessage>(
    await server.agent
      .post(`/api/mail/${message.id}/attachments/upload`)
      .field("expectedRevision", String(message.revision))
      .attach("file", Buffer.from("PDF immutable fixture"), { filename: "dossier.pdf", contentType: "application/pdf" })
      .expect(200),
  );
  const preview = domainBody<MailPreview>(await server.agent.get(`/api/mail/${message.id}/preview`).expect(200));
  server.transport.outcomes.push({ status: "accepted", adapter: "outlook" });
  const sent = domainBody<MailMessage>(
    await server.agent
      .post(`/api/mail/${message.id}/send`)
      .send({ expectedRevision: message.revision, fingerprint: preview.fingerprint, requestKey: randomUUID() })
      .expect(200),
  );
  expect(Buffer.from(server.transport.calls[0]!.attachments[0]!.content).toString()).toBe("PDF immutable fixture");
  const settings = domainBody(await server.agent.get("/api/settings").expect(200));
  await server.agent
    .put("/api/settings")
    .send({ ...settings, outboundEmailSenderAddress: "changed@example.org" })
    .expect(200);
  const frozen = domainBody<MailPreview>(await server.agent.get(`/api/mail/${message.id}/preview`).expect(200));
  expect(frozen).toEqual(preview);
  const history = domainBody<MailPreview>(
    await server.agent.get(`/api/mail/${message.id}/submissions/${sent.submissions[0]!.id}/preview`).expect(200),
  );
  expect(history).toEqual(preview);
  const copy = domainBody<MailMessage>(
    await server.agent.post(`/api/mail/${message.id}/copy`).send({ expectedRevision: message.revision }).expect(201),
  );
  expect(copy.id).not.toBe(message.id);
  expect(copy.submissions).toEqual([]);
  expect(copy.attachments[0]?.binaryObjectId).toBe(message.attachments[0]?.binaryObjectId);
  const content = await server.agent
    .get(`/api/mail/${copy.id}/attachments/${copy.attachments[0]!.id}/content`)
    .expect(200);
  expect(content.body.toString()).toBe("PDF immutable fixture");
});

// @verifies-requirement HALL-FR-EML-050
it("allows a contributor to prepare shared mail but refuses sending, verification, deletion and group management", async () => {
  const server = await setup();
  const message = await draft(server);
  await server.agent
    .post("/api/users")
    .send({
      email: "contributor@example.test",
      displayName: "Contributor",
      contactId: null,
      roles: ["contributor"],
      password: "Contributor-password-2026!",
      passwordChangeRequired: false,
    })
    .expect(201);
  const login = await server.statelessAgent
    .post("/api/auth/login")
    .send({ email: "contributor@example.test", password: "Contributor-password-2026!" })
    .expect(200);
  const cookie = login.headers["set-cookie"][0].split(";", 1)[0];
  const opened = await server.statelessAgent.get(`/api/mail/${message.id}`).set("Cookie", cookie).expect(200);
  expect(opened.body.actions.map((a: { name: string }) => a.name)).toContain("mail.update");
  expect(opened.body.actions.map((a: { name: string }) => a.name)).not.toContain("mail.delete");
  const changed = domainBody<MailMessage>(
    await server.statelessAgent
      .put(`/api/mail/${message.id}`)
      .set("Cookie", cookie)
      .send({
        subject: "Prepared by contributor",
        bodyMarkdown: message.bodyMarkdown,
        recipients: message.recipients,
        expectedRevision: message.revision,
      })
      .expect(200),
  );
  const preview = await server.statelessAgent.get(`/api/mail/${message.id}/preview`).set("Cookie", cookie).expect(200);
  expect(preview.body.actions).toEqual([]);
  await server.statelessAgent
    .post(`/api/mail/${message.id}/send`)
    .set("Cookie", cookie)
    .send({
      expectedRevision: changed.revision,
      fingerprint: preview.body.properties.fingerprint,
      requestKey: randomUUID(),
    })
    .expect(403);
  await server.statelessAgent
    .post(`/api/mail/${message.id}/delete`)
    .set("Cookie", cookie)
    .send({ expectedRevision: changed.revision })
    .expect(403);
  await server.statelessAgent
    .post("/api/mail-recipient-groups")
    .set("Cookie", cookie)
    .send({ name: "Unauthorized", members: [] })
    .expect(403);
  expect(server.transport.calls).toHaveLength(0);
});

// @verifies-requirement HALL-FR-EML-060
it("allows only one external submission while two callers race with different request keys", async () => {
  const server = await setup();
  const message = await draft(server);
  const preview = domainBody<MailPreview>(await server.agent.get(`/api/mail/${message.id}/preview`).expect(200));
  let release!: (result: { status: "accepted"; adapter: "outlook" }) => void;
  server.transport.outcomes.push(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const input = { expectedRevision: message.revision, fingerprint: preview.fingerprint };
  const first = server.agent
    .post(`/api/mail/${message.id}/send`)
    .send({ ...input, requestKey: randomUUID() })
    .then((response) => response);
  await expect.poll(() => server.transport.calls.length).toBe(1);
  await server.agent
    .post(`/api/mail/${message.id}/send`)
    .send({ ...input, requestKey: randomUUID() })
    .expect(409);
  release({ status: "accepted", adapter: "outlook" });
  expect((await first).status).toBe(200);
  expect(server.transport.calls).toHaveLength(1);
});

// @verifies-requirement HALL-FR-EML-040
it("copies a document chosen through a Markdown reference into the explicit attachment list only once", async () => {
  const server = await setup();
  const resource = domainBody<{ id: string }>(
    await server.agent
      .post("/api/resources/documents")
      .field("path", "")
      .attach("file", Buffer.from("Document reference fixture"), { filename: "rapport.txt", contentType: "text/plain" })
      .expect(201),
  );
  const bodyMarkdown = `Le document :resource[rapport]{#${resource.id}} est joint.`;
  const message = domainBody<MailMessage>(
    await server.agent.post("/api/mail").send({ subject: "Report", bodyMarkdown, recipients: [] }).expect(201),
  );
  expect(message.attachments).toHaveLength(1);
  expect(message.attachments[0]?.resourceId).toBe(resource.id);
  const updated = domainBody<MailMessage>(
    await server.agent
      .put(`/api/mail/${message.id}`)
      .send({ subject: "Updated report", bodyMarkdown, recipients: [], expectedRevision: message.revision })
      .expect(200),
  );
  expect(updated.attachments).toHaveLength(1);
});

// @verifies-requirement HALL-FR-EML-040
it("prepares a document with a compatible attachment name and keeps its source unchanged", async () => {
  const server = await setup();
  const resource = domainBody<{ id: string; name: string }>(
    await server.agent
      .post("/api/resources/documents")
      .field("path", "")
      .attach("file", Buffer.from("Document bytes"), { filename: "rapport:2026?.txt", contentType: "text/plain" })
      .expect(201),
  );
  const original = domainBody(await server.agent.get(`/api/resources/${resource.id}`).expect(200));
  const message = domainBody<MailMessage>(
    await server.agent.post("/api/mail/prepare").send({ kind: "resource", resourceId: resource.id }).expect(201),
  );
  expect(message.attachments[0]?.fileName).toBe("rapport-2026-.txt");
  expect(domainBody(await server.agent.get(`/api/resources/${resource.id}`).expect(200))).toEqual(original);
  const preview = domainBody<MailPreview>(await server.agent.get(`/api/mail/${message.id}/preview`).expect(200));
  expect(preview.issues.map((issue) => issue.code)).not.toContain("invalid_attachment_name");
});

// @verifies-requirement HALL-FR-EML-040
// @verifies-requirement HALL-FR-EML-060
it("distinguishes the attachment size limit from a stale draft and preserves accepted files", async () => {
  const server = await setup();
  let message = await draft(server);
  const firstRevision = message.revision;
  const content = Buffer.alloc(18 * 1024 * 1024, 65);
  for (let i = 0; i < 2; i++)
    message = domainBody<MailMessage>(
      await server.agent
        .post(`/api/mail/${message.id}/attachments/upload`)
        .field("expectedRevision", String(message.revision))
        .attach("file", content, { filename: `part-${i}.txt`, contentType: "text/plain" })
        .expect(200),
    );
  const rejected = await server.agent
    .post(`/api/mail/${message.id}/attachments/upload`)
    .field("expectedRevision", String(message.revision))
    .attach("file", content, { filename: "too-large.txt", contentType: "text/plain" })
    .expect(413);
  expect(rejected.body.code).toBe("mail_attachments_too_large");
  const stale = await server.agent
    .put(`/api/mail/${message.id}`)
    .send({
      expectedRevision: firstRevision,
      subject: message.subject,
      bodyMarkdown: message.bodyMarkdown,
      recipients: message.recipients,
    })
    .expect(409);
  expect(stale.body.code).toBe("mail_draft_changed");
  const persisted = domainBody<MailMessage>(await server.agent.get(`/api/mail/${message.id}`).expect(200));
  expect(persisted.revision).toBe(message.revision);
  expect(persisted.attachments).toHaveLength(2);
});
