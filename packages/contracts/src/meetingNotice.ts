import { z } from "zod";
import { agendaNumberSchema } from "./agendaNumber.js";

const id = z.string().uuid();
const time = z.iso.datetime({ offset: true });
export const frozenAgendaItemSchema = z
  .object({
    id,
    position: z.number().int().positive(),
    agendaNumber: agendaNumberSchema,
    title: z.string(),
    kind: z.enum(["minutesApproval", "councilDecisionProposal", "openQuestion"]),
  })
  .strict();
export const meetingAgendaFreezeSchema = z
  .object({
    councilMeetingId: id,
    frozenAt: time,
    agenda: z.array(frozenAgendaItemSchema).min(1),
  })
  .strict();
export const meetingNoticeMeetingFactsSchema = z
  .object({
    id,
    number: z.number().int().positive(),
    scheduledAt: time,
    location: z.string().min(1),
    agendaFrozenAt: time,
    agenda: z.array(frozenAgendaItemSchema).min(1),
  })
  .strict();
export const meetingNoticeHallFactsSchema = z.object({ name: z.string(), timeZone: z.string() }).strict();
export const meetingNoticeFactsSchema = z
  .object({
    issuedOn: z.iso.date().nullable(),
    meeting: meetingNoticeMeetingFactsSchema,
    hall: meetingNoticeHallFactsSchema,
  })
  .strict();
export const meetingNoticeSchema = z
  .object({
    id,
    councilMeetingId: id,
    version: z.number().int().positive(),
    generatedAt: time,
    documentId: id,
    byteSize: z.number().int().positive(),
    facts: meetingNoticeFactsSchema,
    isCurrent: z.boolean(),
  })
  .strict();
export type MeetingAgendaFreeze = z.infer<typeof meetingAgendaFreezeSchema>;
export type MeetingNoticeMeetingFacts = z.infer<typeof meetingNoticeMeetingFactsSchema>;
export type MeetingNoticeHallFacts = z.infer<typeof meetingNoticeHallFactsSchema>;
export type MeetingNoticeFacts = z.infer<typeof meetingNoticeFactsSchema>;
export type MeetingNotice = z.infer<typeof meetingNoticeSchema>;

const noticeDeadlineDateSchema = z
  .object({
    deadlineDate: z.iso.date(),
    meetingDate: z.iso.date(),
    clearDays: z.union([z.literal(3), z.literal(5)]),
    timeZone: z.string(),
    reminder: z.enum(["upcoming", "due", "overdue"]),
  })
  .strict();
export const meetingNoticeDeadlineSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("indeterminate"),
      reason: z.enum(["scheduleUnknown", "timeZoneUnknown", "populationUnknown"]),
    })
    .strict(),
  z
    .object({
      status: z.literal("qualificationRequired"),
      reason: z.literal("noticeRegimeUnqualified"),
      ordinaryReference: noticeDeadlineDateSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("determined"),
      regime: z.literal("secondConvocation"),
      deadline: noticeDeadlineDateSchema,
    })
    .strict(),
]);
export type MeetingNoticeDeadline = z.infer<typeof meetingNoticeDeadlineSchema>;

export const meetingNoticeMessagePreparationSchema = z
  .object({
    councilMeetingId: id,
    noticeId: id.nullable(),
    canGenerate: z.boolean(),
    recipients: z.array(
      z.object({ councilMemberId: id, contactId: id, name: z.string(), email: z.email().nullable() }).strict(),
    ),
    missingEmailMemberIds: z.array(id),
  })
  .strict();
export const generateMeetingNoticeMessageSchema = z.object({ noticeId: id }).strict();
export type MeetingNoticeMessagePreparation = z.infer<typeof meetingNoticeMessagePreparationSchema>;
