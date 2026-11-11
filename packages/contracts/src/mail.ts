import { z } from "zod";

export const mailSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("free") }).strict(),
  z.object({ kind: z.literal("notice"), meetingId: z.uuid(), noticeId: z.uuid() }).strict(),
  z
    .object({
      kind: z.literal("event"),
      resourceId: z.uuid(),
      version: z.number().int().positive(),
      method: z.enum(["request", "cancel"]),
    })
    .strict(),
]);
export type MailSource = z.infer<typeof mailSourceSchema>;
export const mailRecipientKindSchema = z.enum(["to", "cc", "bcc"]);
export const mailRecipientSchema = z
  .object({
    kind: mailRecipientKindSchema,
    name: z.string(),
    address: z.string().trim(),
    contactId: z.uuid().nullable().default(null),
  })
  .strict();
export const mailDraftSchema = z
  .object({
    subject: z.string().refine((value) => !/[\r\n]/.test(value)),
    bodyMarkdown: z.string(),
    recipients: z.array(mailRecipientSchema),
  })
  .strict();
export const createMailSchema = mailDraftSchema.extend({
  subject: mailDraftSchema.shape.subject.default(""),
  bodyMarkdown: z.string().default(""),
  recipients: z.array(mailRecipientSchema).default([]),
});
export const updateMailSchema = mailDraftSchema.extend({ expectedRevision: z.number().int().positive() });
export const mailAttachmentSchema = z.object({
  id: z.uuid(),
  fileName: z.string(),
  binaryObjectId: z.uuid(),
  mediaType: z.string(),
  byteSize: z.number().nonnegative(),
  resourceId: z.uuid().nullable(),
});
export const mailVerificationSchema = z.object({
  outcome: z.enum(["sent", "not-sent"]),
  notes: z.string().trim().min(1),
  verifiedBy: z.string().min(1),
  verifiedAt: z.string(),
});
export const mailSubmissionSchema = z.object({
  id: z.uuid(),
  messageId: z.uuid(),
  revision: z.number().int().positive(),
  requestKey: z.uuid(),
  status: z.enum(["submitting", "accepted", "failed", "unknown"]),
  requestedBy: z.string().min(1),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  errorCode: z.string().nullable(),
  verification: mailVerificationSchema.nullable(),
});
export const mailMessageSchema = mailDraftSchema.extend({
  source: mailSourceSchema,
  id: z.uuid(),
  revision: z.number().int().positive(),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  attachments: z.array(mailAttachmentSchema),
  submissions: z.array(mailSubmissionSchema),
});
export const mailGroupMemberSchema = mailRecipientSchema.omit({ kind: true });
export const saveMailRecipientGroupSchema = z
  .object({
    name: z.string().trim().min(1),
    members: z.array(mailGroupMemberSchema),
  })
  .strict();
export const updateMailRecipientGroupSchema = saveMailRecipientGroupSchema.extend({
  expectedRevision: z.number().int().positive(),
});
export const mailRecipientGroupSchema = saveMailRecipientGroupSchema.extend({
  id: z.uuid(),
  revision: z.number().int().positive(),
  updatedAt: z.string(),
});
export const mailPreviewSchema = z.object({
  messageId: z.uuid(),
  revision: z.number().int().positive(),
  fingerprint: z.string(),
  senderAddress: z.string(),
  replyToAddress: z.string().nullable(),
  subject: z.string(),
  html: z.string(),
  text: z.string(),
  recipients: z.array(mailRecipientSchema),
  attachments: z.array(mailAttachmentSchema),
  issues: z.array(
    z.object({
      code: z.enum([
        "missing_sender",
        "missing_recipients",
        "invalid_recipient",
        "duplicate_recipient",
        "rendering_error",
        "invalid_attachment_name",
        "stale_notice",
        "incomplete_notice_recipients",
        "stale_event",
      ]),
      recipientIndex: z.number().int().optional(),
    }),
  ),
});
export const sendMailSchema = z
  .object({ expectedRevision: z.number().int().positive(), fingerprint: z.string().min(1), requestKey: z.uuid() })
  .strict();
export const verifyMailSubmissionSchema = z
  .object({ outcome: z.enum(["sent", "not-sent"]), notes: z.string().trim().min(1) })
  .strict();
export const attachMailResourceSchema = z
  .object({ expectedRevision: z.number().int().positive(), resourceId: z.uuid() })
  .strict();
export const mailRevisionSchema = z.object({ expectedRevision: z.number().int().positive() }).strict();
export type MailRecipient = z.infer<typeof mailRecipientSchema>;
export type MailDraft = z.infer<typeof mailDraftSchema>;
export type MailMessage = z.infer<typeof mailMessageSchema>;
export type MailAttachment = z.infer<typeof mailAttachmentSchema>;
export type MailSubmission = z.infer<typeof mailSubmissionSchema>;
export type MailRecipientGroup = z.infer<typeof mailRecipientGroupSchema>;
export type MailPreview = z.infer<typeof mailPreviewSchema>;

export const prepareMailSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("resource"), resourceId: z.uuid() }).strict(),
  z.object({ kind: z.literal("pdf"), title: z.string().min(1), bodyMarkdown: z.string() }).strict(),
]);
