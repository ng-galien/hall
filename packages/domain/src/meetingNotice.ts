import { z } from "zod";

const id = z.string().uuid();
const time = z.iso.datetime({ offset: true });
export const frozenAgendaItemSchema = z.object({
  id, position: z.number().int().positive(), title: z.string(),
  kind: z.enum(["minutesApproval", "councilDecisionProposal", "openQuestion"]),
}).strict();
export const meetingAgendaFreezeSchema = z.object({
  councilMeetingId: id, frozenAt: time, agenda: z.array(frozenAgendaItemSchema).min(1),
}).strict();
export const meetingNoticeMeetingFactsSchema = z.object({
  id, number: z.number().int().positive(), scheduledAt: time, location: z.string().min(1),
  agendaFrozenAt: time, agenda: z.array(frozenAgendaItemSchema).min(1),
}).strict();
export const meetingNoticeHallFactsSchema = z.object({ name: z.string(), timeZone: z.string() }).strict();
export const meetingNoticeFactsSchema = z.object({
  meeting: meetingNoticeMeetingFactsSchema, hall: meetingNoticeHallFactsSchema,
}).strict();
export const meetingNoticeSchema = z.object({
  id, councilMeetingId: id, version: z.number().int().positive(), generatedAt: time,
  documentId: id, byteSize: z.number().int().positive(), facts: meetingNoticeFactsSchema, isCurrent: z.boolean(),
}).strict();
export type MeetingAgendaFreeze = z.infer<typeof meetingAgendaFreezeSchema>;
export type MeetingNoticeMeetingFacts = z.infer<typeof meetingNoticeMeetingFactsSchema>;
export type MeetingNoticeHallFacts = z.infer<typeof meetingNoticeHallFactsSchema>;
export type MeetingNoticeFacts = z.infer<typeof meetingNoticeFactsSchema>;
export type MeetingNotice = z.infer<typeof meetingNoticeSchema>;
