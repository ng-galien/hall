import { z } from "zod";
import { councilDecisionSummarySchema } from "./councilDecisionDocument.js";
import { meetingAgendaFreezeSchema, meetingNoticeSchema } from "./meetingNotice.js";

const id = z.uuid();
const observation = { phase: z.enum(["opening", "closing"]), capturedAt: z.iso.datetime({ offset: true }) };
export const meetingDocumentSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("current") }).strict(),
  z.object({ kind: z.literal("snapshot"), ...observation }).strict(),
  z.object({ kind: z.literal("unavailable"), ...observation, reason: z.literal("notCaptured") }).strict(),
]);
export const meetingDocumentResourceSchema = z
  .object({
    id,
    title: z.string().nullable(),
    mediaType: z.string().nullable(),
    source: meetingDocumentSourceSchema,
    roles: z.array(z.enum(["proxy", "report", "subject", "attachment"])).min(1),
    councilBusinessIds: z.array(id),
  })
  .strict();
export const meetingDocumentBusinessSchema = z
  .object({
    id,
    title: z.string().nullable(),
    source: meetingDocumentSourceSchema,
    agendaItemIds: z.array(id),
  })
  .strict();
export const meetingDocumentGroupSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("noticeAndAgenda"),
      notices: z.array(meetingNoticeSchema),
      agendaFreeze: meetingAgendaFreezeSchema.nullable(),
    })
    .strict(),
  z.object({ kind: z.literal("proxies"), resources: z.array(meetingDocumentResourceSchema) }).strict(),
  z.object({ kind: z.literal("decisions"), decisions: z.array(councilDecisionSummarySchema) }).strict(),
  z
    .object({
      kind: z.literal("minutes"),
      minutes: z.array(
        z.object({ id, generatedAt: z.iso.datetime({ offset: true }).nullable(), documentId: id.nullable() }).strict(),
      ),
    })
    .strict(),
  z.object({ kind: z.literal("resources"), resources: z.array(meetingDocumentResourceSchema) }).strict(),
  z.object({ kind: z.literal("businesses"), businesses: z.array(meetingDocumentBusinessSchema) }).strict(),
]);
export const meetingDocumentsSchema = z
  .object({ councilMeetingId: id, groups: z.array(meetingDocumentGroupSchema) })
  .strict();
export type MeetingDocumentSource = z.infer<typeof meetingDocumentSourceSchema>;
export type MeetingDocumentResource = z.infer<typeof meetingDocumentResourceSchema>;
export type MeetingDocumentGroup = z.infer<typeof meetingDocumentGroupSchema>;
export type MeetingDocuments = z.infer<typeof meetingDocumentsSchema>;
