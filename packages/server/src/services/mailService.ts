import { createHash } from "node:crypto";
import type { MailDraft, MailPreview, MailSource } from "@hall/contracts";
import { mailCanCopy, mailCanEdit, matchDiscriminated } from "@hall/domain";
import { collectResourceReferences, parse } from "@hall/templating";
import { z } from "zod";
import type { ResourcesClient } from "../clients/resourcesClient.js";
import type { HallSettingsRepository, UnitOfWork } from "../repositories/contracts.js";
import type { MailRepository } from "../repositories/mailRepository.js";
import type { ContentTemplateService, TemplateAttachment } from "./contentTemplateService.js";
import {
  type EmailPayload,
  type EmailTransport,
  type EmailTransportResult,
  emailPayloadSchema,
} from "./emailTransport.js";
import { DomainError } from "./errors.js";
import { mailAttachmentFileName, mailAttachmentFileNameSchema } from "./mailAttachmentFileName.js";
import type { MeetingNoticeService } from "./meetingNoticeService.js";

// @implements-requirement HALL-FR-EML-010
// @implements-requirement HALL-FR-EML-040
// @implements-requirement HALL-FR-EML-060
export function createMailService({
  mailRepository: repository,
  contentTemplateService,
  hallSettingsRepository,
  resourcesClient,
  emailTransport,
  unitOfWork,
  meetingNoticeService,
}: {
  mailRepository: MailRepository;
  contentTemplateService: ContentTemplateService;
  hallSettingsRepository: HallSettingsRepository;
  resourcesClient: ResourcesClient;
  emailTransport: EmailTransport;
  unitOfWork: UnitOfWork;
  meetingNoticeService: MeetingNoticeService;
}) {
  const open = async (id: string) => {
    const message = await repository.open(id);
    if (!message) throw new DomainError("resource_not_found", 404);
    return message;
  };
  const sourceIssues = async (message: Awaited<ReturnType<typeof open>>): Promise<MailPreview["issues"]> =>
    matchDiscriminated(message.source, "kind", {
      free: async (): Promise<MailPreview["issues"]> => [],
      notice: async (source): Promise<MailPreview["issues"]> => {
        let current: Awaited<ReturnType<MeetingNoticeService["messagePreparation"]>>;
        try {
          current = await meetingNoticeService.messagePreparation(source.meetingId);
        } catch (error) {
          if (error instanceof DomainError && ["meeting_not_found", "contact_not_found"].includes(error.code))
            return [{ code: "stale_notice" }];
          throw error;
        }
        if (!current.canGenerate || current.noticeId !== source.noticeId) return [{ code: "stale_notice" }];
        const expected = current.recipients.map((entry) => entry.email?.toLowerCase());
        return expected.some(
          (address) => !address || !message.recipients.some((entry) => entry.address.toLowerCase() === address),
        )
          ? [{ code: "incomplete_notice_recipients" }]
          : [];
      },
      event: async (source): Promise<MailPreview["issues"]> => {
        const resource = await resourcesClient.open(source.resourceId);
        return resource?.data.kind !== "event" || resource.data.version !== source.version
          ? [{ code: "stale_event" }]
          : [];
      },
    });
  const attach = (id: string, revision: number, file: Parameters<MailRepository["attach"]>[2]) =>
    repository.attach(id, revision, { ...file, fileName: mailAttachmentFileName(file.fileName) });
  const preview = async (id: string): Promise<MailPreview> => {
    const message = await open(id);
    const sent = message.submissions.find(
      (entry) => entry.status === "accepted" || entry.verification?.outcome === "sent",
    );
    if (sent) {
      const frozen = await repository.snapshot(sent.id);
      if (frozen) return frozen;
    }
    const settings = await hallSettingsRepository.get();
    const rendering = await contentTemplateService.preview(
      {
        kind: "message",
        bodyMarkdown: `{{ ${JSON.stringify(message.bodyMarkdown)} | markdown }}`,
        subject: `{{ ${JSON.stringify(message.subject)} | text }}`,
      },
      {},
    );
    const issues = await sourceIssues(message);
    if (message.attachments.some((file) => !mailAttachmentFileNameSchema.safeParse(file.fileName).success))
      issues.push({ code: "invalid_attachment_name" });
    const senderAddress = settings.outboundEmailSenderAddress ?? settings.email ?? "";
    if (!z.email().safeParse(senderAddress).success) issues.push({ code: "missing_sender" });
    if (!message.recipients.length) issues.push({ code: "missing_recipients" });
    const addresses = new Set<string>();
    message.recipients.forEach((recipient, recipientIndex) => {
      if (!z.email().safeParse(recipient.address).success) issues.push({ code: "invalid_recipient", recipientIndex });
      const normalized = recipient.address.toLowerCase();
      if (addresses.has(normalized)) issues.push({ code: "duplicate_recipient", recipientIndex });
      addresses.add(normalized);
    });
    if (rendering.diagnostics.some((diagnostic) => diagnostic.severity === "error"))
      issues.push({ code: "rendering_error" });
    const result = {
      messageId: id,
      revision: message.revision,
      senderAddress,
      replyToAddress: settings.outboundEmailReplyToAddress,
      subject: message.subject,
      html: rendering.html,
      text: rendering.text,
      recipients: message.recipients,
      attachments: message.attachments,
      issues,
    };
    return { ...result, fingerprint: createHash("sha256").update(JSON.stringify(result)).digest("hex") };
  };
  const attachment = async (id: string, attachmentId: string) => {
    const file = await repository.attachment(id, attachmentId);
    if (!file) throw new DomainError("resource_not_found", 404);
    return { fileName: file.fileName, mediaType: file.mediaType, content: Buffer.from(file.base64, "base64") };
  };
  const referencedFiles = async (bodyMarkdown: string, excluded: ReadonlySet<string>) => {
    const ids = new Set(
      collectResourceReferences(parse(bodyMarkdown))
        .filter((entry) => entry.directive !== "image")
        .map((entry) => entry.id),
    );
    const files: Array<{ fileName: string; mediaType: string; content: Buffer; resourceId: string }> = [];
    for (const id of ids) {
      if (excluded.has(id)) continue;
      const resource = await resourcesClient.open(id);
      if (resource?.data.kind !== "document") continue;
      const file = await resourcesClient.readDocumentContent(id);
      if (!file) throw new DomainError("resource_content_unavailable", 422);
      files.push({ fileName: resource.data.name, mediaType: file.mediaType, content: file.content, resourceId: id });
    }
    return files;
  };
  return {
    open,
    async snapshot(id: string, submissionId: string) {
      if (!(await open(id)).submissions.some((entry) => entry.id === submissionId))
        throw new DomainError("resource_not_found", 404);
      const snapshot = await repository.snapshot(submissionId);
      if (!snapshot) throw new DomainError("resource_not_found", 404);
      return snapshot;
    },
    async snapshotAttachment(id: string, submissionId: string, attachmentId: string) {
      if (!(await open(id)).submissions.some((entry) => entry.id === submissionId))
        throw new DomainError("resource_not_found", 404);
      const file = await repository.snapshotAttachment(submissionId, attachmentId);
      if (!file) throw new DomainError("resource_not_found", 404);
      return { ...file, content: Buffer.from(file.base64, "base64") };
    },
    preview,
    attachment,
    async createPrepared(prepared: { draft: MailDraft; source: MailSource; files: TemplateAttachment[] }) {
      const referenced = await referencedFiles(
        prepared.draft.bodyMarkdown,
        new Set(prepared.files.map((file) => file.id)),
      );
      return unitOfWork.execute(async () => {
        let message = await repository.create({ ...prepared.draft, source: prepared.source });
        for (const file of prepared.files)
          message = await attach(message.id, message.revision, { ...file, resourceId: null });
        for (const file of referenced) message = await attach(message.id, message.revision, file);
        return message;
      });
    },
    async copy(id: string, revision: number) {
      const original = await open(id);
      if (original.revision !== revision || !mailCanCopy(original.submissions)) throw new DomainError("conflict", 409);
      const files = await Promise.all(original.attachments.map((file) => attachment(id, file.id)));
      return unitOfWork.execute(async () => {
        let copied = await repository.create({
          subject: original.subject,
          bodyMarkdown: original.bodyMarkdown,
          recipients: original.recipients,
          source: original.source,
        });
        for (const file of files) copied = await attach(copied.id, copied.revision, { ...file, resourceId: null });
        return copied;
      });
    },
    list: () => repository.list(),
    async create(draft: MailDraft) {
      const files = await referencedFiles(draft.bodyMarkdown, new Set());
      return unitOfWork.execute(async () => {
        let message = await repository.create(draft);
        for (const file of files) message = await attach(message.id, message.revision, file);
        return message;
      });
    },
    async update(id: string, revision: number, draft: MailDraft) {
      const previous = await open(id);
      const excluded = new Set([
        ...collectResourceReferences(parse(previous.bodyMarkdown)).map((entry) => entry.id),
        ...previous.attachments.flatMap((file) => (file.resourceId ? [file.resourceId] : [])),
      ]);
      const files = await referencedFiles(draft.bodyMarkdown, excluded);
      return unitOfWork.execute(async () => {
        let message = await repository.update(id, revision, draft);
        for (const file of files) message = await attach(id, message.revision, file);
        return message;
      });
    },
    delete: (id: string, revision: number) => unitOfWork.execute(() => repository.delete(id, revision)),
    attachFile: (
      id: string,
      revision: number,
      file: { fileName: string; mediaType: string; content: Buffer; resourceId: string | null },
    ) => {
      if (
        !emailPayloadSchema.shape.attachments.element.safeParse({
          ...file,
          fileName: mailAttachmentFileName(file.fileName),
        }).success
      )
        throw new DomainError("invalid_request", 422);
      return unitOfWork.execute(() => attach(id, revision, file));
    },
    async attachResource(id: string, revision: number, resourceId: string) {
      const resource = await resourcesClient.open(resourceId);
      if (resource?.data.kind !== "document") throw new DomainError("resource_content_unavailable", 422);
      const content = await resourcesClient.readDocumentContent(resourceId);
      if (!content) throw new DomainError("resource_content_unavailable", 404);
      return unitOfWork.execute(() =>
        attach(id, revision, {
          fileName: resource.data.name,
          mediaType: content.mediaType,
          content: content.content,
          resourceId,
        }),
      );
    },
    removeAttachment: (id: string, revision: number, attachmentId: string) =>
      unitOfWork.execute(() => repository.removeAttachment(id, revision, attachmentId)),
    async send(id: string, input: { expectedRevision: number; fingerprint: string; requestKey: string }) {
      const message = await open(id);
      const previous = message.submissions.find((entry) => entry.requestKey === input.requestKey);
      if (previous) return previous;
      if (!mailCanEdit(message.submissions)) throw new DomainError("mail_submission_blocks_changes", 409);
      const reviewed = await preview(id);
      if (reviewed.revision !== input.expectedRevision || reviewed.fingerprint !== input.fingerprint)
        throw new DomainError("mail_review_changed", 409);
      if (reviewed.issues.length) throw new DomainError("invalid_request", 422);
      const files = await Promise.all(reviewed.attachments.map((file) => attachment(id, file.id)));
      const payload: EmailPayload = emailPayloadSchema.parse({
        ...reviewed,
        recipients: reviewed.recipients.map(({ kind, address }) => ({ kind, address })),
        attachments: files,
      });
      const claim = await unitOfWork.execute(() =>
        repository.claimSubmission(id, input.expectedRevision, input.requestKey, reviewed),
      );
      if (!claim.created) return claim.submission;
      let outcome: EmailTransportResult;
      try {
        outcome = await emailTransport.send(payload);
      } catch {
        outcome = { status: "unknown", code: "transport_submission_uncertain" };
      }
      return repository.finish(claim.submission.id, outcome.status, "code" in outcome ? outcome.code : null);
    },
    verify: (id: string, outcome: "sent" | "not-sent", notes: string) =>
      unitOfWork.execute(() => repository.verify(id, outcome, notes)),
    groups: () => repository.groups(),
    saveGroup: (id: string | null, revision: number | null, input: Parameters<MailRepository["saveGroup"]>[2]) =>
      unitOfWork.execute(() => repository.saveGroup(id, revision, input)),
    deleteGroup: (id: string, revision: number) => unitOfWork.execute(() => repository.deleteGroup(id, revision)),
  };
}
export type MailService = ReturnType<typeof createMailService>;
