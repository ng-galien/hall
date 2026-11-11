import { randomUUID } from "node:crypto";
import type { MailMessage } from "@hall/contracts";
import { expect, it, vi } from "vitest";
import { createMailService } from "../../src/services/mailService.js";

function fixture() {
  const message: MailMessage = {
    id: randomUUID(),
    revision: 1,
    subject: "Conseil",
    bodyMarkdown: "Message",
    recipients: [{ kind: "to", name: "Member", address: "member@example.org", contactId: null }],
    attachments: [],
    submissions: [],
    source: { kind: "free" },
    createdBy: "actor",
    updatedBy: "actor",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const repository = {
    open: vi.fn(async () => message),
    create: vi.fn(async () => message),
    attach: vi.fn(async (_id: string, _revision: number, _file: unknown) => message),
    update: vi.fn(async () => message),
  };
  const resourcesClient = {
    open: vi.fn(async () => ({ data: { kind: "document", name: "Rapport: finances?/2026.pdf", version: 2 } })),
    readDocumentContent: vi.fn(async () => ({ mediaType: "application/pdf", content: Buffer.from("PDF fixture") })),
  };
  const meetingNoticeService = {
    messagePreparation: vi.fn(async () => ({
      canGenerate: true,
      noticeId: "current-notice",
      recipients: [{ email: "member@example.org" }],
    })),
  };
  const emailTransport = { send: vi.fn() };
  const dependencies = {
    mailRepository: repository,
    resourcesClient,
    meetingNoticeService,
    emailTransport,
    hallSettingsRepository: {
      get: async () => ({ outboundEmailSenderAddress: "town@example.org", outboundEmailReplyToAddress: null }),
    },
    contentTemplateService: { preview: async () => ({ html: "<p>Message</p>", text: "Message", diagnostics: [] }) },
    unitOfWork: { execute: async (operation: () => Promise<unknown>) => operation() },
  } as unknown as Parameters<typeof createMailService>[0];
  return {
    service: createMailService(dependencies),
    message,
    repository,
    resourcesClient,
    meetingNoticeService,
    emailTransport,
  };
}
// @verifies-requirement HALL-FR-EML-040
it.each(["resource", "prepared", "reference"])(
  "makes %s attachment names usable before persistence",
  async (origin) => {
    const f = fixture();
    const resourceId = randomUUID();
    if (origin === "resource") await f.service.attachResource(f.message.id, 1, resourceId);
    if (origin === "prepared")
      await f.service.createPrepared({
        draft: f.message,
        source: { kind: "free" },
        files: [
          {
            id: resourceId,
            fileName: "Rapport: finances?/2026.pdf",
            mediaType: "application/pdf",
            content: Buffer.from("PDF fixture"),
          },
        ],
      });
    if (origin === "reference")
      await f.service.create({ ...f.message, bodyMarkdown: `Voir :resource[rapport]{#${resourceId}}.` });
    expect(f.repository.attach.mock.calls[0]?.[2]).toMatchObject({
      fileName: "Rapport- finances--2026.pdf",
      content: Buffer.from("PDF fixture"),
    });
  },
);
// @verifies-requirement HALL-FR-EML-020
// @verifies-requirement HALL-FR-EML-090
it.each(["stale_notice", "incomplete_notice_recipients", "stale_event"])(
  "shows %s in the preview and prevents sending",
  async (code) => {
    const f = fixture();
    f.message.source =
      code === "stale_event"
        ? { kind: "event", resourceId: randomUUID(), version: 1, method: "request" }
        : {
            kind: "notice",
            meetingId: randomUUID(),
            noticeId: code === "stale_notice" ? "old-notice" : "current-notice",
          };
    if (code === "incomplete_notice_recipients") f.message.recipients = [];
    const preview = await f.service.preview(f.message.id);
    expect(preview.html).toContain("Message");
    expect(preview.issues).toContainEqual({ code });
    await expect(
      f.service.send(f.message.id, { expectedRevision: 1, fingerprint: preview.fingerprint, requestKey: randomUUID() }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(f.emailTransport.send).not.toHaveBeenCalled();
  },
);
it("reports a stored invalid attachment name in the preview", async () => {
  const f = fixture();
  f.message.attachments = [
    {
      id: randomUUID(),
      fileName: "CON.pdf",
      binaryObjectId: randomUUID(),
      mediaType: "application/pdf",
      byteSize: 3,
      resourceId: null,
    },
  ];
  expect((await f.service.preview(f.message.id)).issues).toContainEqual({ code: "invalid_attachment_name" });
});

it("normalizes uploaded reserved names without changing the bytes", async () => {
  const f = fixture();
  const content = Buffer.from("body");
  await f.service.attachFile(f.message.id, 1, {
    fileName: "CON.txt",
    mediaType: "text/plain",
    content,
    resourceId: null,
  });
  expect(f.repository.attach.mock.calls[0]?.[2]).toMatchObject({ fileName: "_CON.txt", content });
});
