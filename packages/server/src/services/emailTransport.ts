import { z } from "zod";
import { mailAttachmentFileNameSchema } from "./mailAttachmentFileName.js";

/** A fully prepared payload. Authorization and durable submission tracking belong to the mail service. */
export const emailPayloadSchema = z.object({
  senderAddress: z.email(),
  replyToAddress: z.email().nullable(),
  subject: z.string().refine((value) => !/[\r\n]/.test(value)),
  html: z.string(),
  text: z.string(),
  recipients: z
    .array(
      z.object({
        kind: z.enum(["to", "cc", "bcc"]),
        address: z.email(),
      }),
    )
    .min(1),
  attachments: z.array(
    z.object({
      fileName: mailAttachmentFileNameSchema,
      content: z.instanceof(Uint8Array),
    }),
  ),
});
export type EmailPayload = z.infer<typeof emailPayloadSchema>;

export const emailTransportResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("accepted"), adapter: z.string().min(1) }),
  z.object({ status: z.literal("failed"), code: z.string().min(1) }),
  z.object({ status: z.literal("unknown"), code: z.string().min(1) }),
]);
export type EmailTransportResult = z.infer<typeof emailTransportResultSchema>;

// @implements-requirement HALL-FR-EML-070
export interface EmailTransport {
  send(payload: EmailPayload): Promise<EmailTransportResult>;
}
