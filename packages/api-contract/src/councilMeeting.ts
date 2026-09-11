import {
  agendaNumberSchema,
  conductBlockerSchema,
  conductBlockersSchema,
  meetingEntryBlockerSchema,
  meetingNoticeDeadlineSchema,
  meetingOpeningBlockerSchema,
} from "@hall/contracts";
import { z } from "zod";
import { councilBusinessSchema } from "./councilBusiness.js";
import { meetingConductStateSchema } from "./meetingConduct.js";
import { minutesSummarySchema } from "./minutes.js";
import { agendaItemRecusalStateSchema } from "./recusal.js";
import { resourceIdSchema, resourceNameSchema, resourcePathSchema } from "./resources.js";

const timestampSchema = z.iso.datetime({ offset: true });
export const updateAgendaItemNotesSchema = z.object({ discussionSummary: z.string() }).strict();

export const councilMeetingSchema = z
  .object({
    id: resourceIdSchema,
    slug: z.string().min(1).nullable(),
    number: z.number().int().positive(),
    previousCouncilMeetingId: resourceIdSchema.nullable(),
    minutesId: resourceIdSchema.nullable(),
    noticeDeadline: meetingNoticeDeadlineSchema,
    currentNoticeId: resourceIdSchema.nullable(),
    agendaFrozenAt: timestampSchema.nullable(),
    scheduledAt: timestampSchema.nullable(),
    location: z.string().min(1).nullable(),
    chairMemberId: resourceIdSchema.nullable(),
    secretaryMemberId: resourceIdSchema.nullable(),
    quorum: z.number().int().positive().nullable(),
    startedAt: timestampSchema.nullable(),
    closedAt: timestampSchema.nullable(),
    // TODO REMOVE_STALE: temporary incomplete meeting marker.
    stale: z.boolean(),
    closureBlockers: z.array(conductBlockerSchema),
    entryBlockers: z.array(meetingEntryBlockerSchema),
    openingBlockers: z.array(meetingOpeningBlockerSchema),
  })
  .strict();

export const provisionInitialCouncilMeetingSchema = z.object({}).strict();

export const scheduleCouncilMeetingSchema = z
  .object({
    scheduledAt: timestampSchema,
    location: z.string().trim().min(1),
  })
  .strict();

export const setCouncilMeetingOfficersSchema = z
  .object({
    chairMemberId: resourceIdSchema,
    secretaryMemberId: resourceIdSchema,
  })
  .strict();

export const prepareCouncilMeetingSchema = scheduleCouncilMeetingSchema.extend({
  chairMemberId: resourceIdSchema,
  secretaryMemberId: resourceIdSchema,
});

export const meetingAttendanceStatusSchema = z.enum(["present", "represented", "excused", "absent"]);

export const meetingAttendanceSchema = z
  .object({
    id: resourceIdSchema,
    councilMeetingId: resourceIdSchema,
    councilMemberId: resourceIdSchema,
    status: meetingAttendanceStatusSchema,
    proxyHolderCouncilMemberId: resourceIdSchema.nullable(),
    proxyDocumentId: resourceIdSchema.nullable(),
  })
  .strict();

const attendanceDeclarationBase = {
  councilMemberId: resourceIdSchema,
};

export const meetingAttendanceDeclarationSchema = z.discriminatedUnion("status", [
  z.object({ ...attendanceDeclarationBase, status: z.literal("present") }).strict(),
  z.object({ ...attendanceDeclarationBase, status: z.literal("excused") }).strict(),
  z.object({ ...attendanceDeclarationBase, status: z.literal("absent") }).strict(),
  z
    .object({
      ...attendanceDeclarationBase,
      status: z.literal("represented"),
      proxyHolderCouncilMemberId: resourceIdSchema,
      proxyDocumentId: resourceIdSchema,
    })
    .strict(),
]);

export const recordMeetingAttendanceSchema = z
  .object({
    attendance: z.array(meetingAttendanceDeclarationSchema).min(1),
  })
  .strict();

export const recordMeetingOpeningSchema = recordMeetingAttendanceSchema
  .extend({
    observedAt: timestampSchema,
    chairMemberId: resourceIdSchema,
    secretaryMemberId: resourceIdSchema,
  })
  .strict();

export const agendaSubjectSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("minutesApproval"),
      id: resourceIdSchema,
      minutesId: resourceIdSchema,
      documentId: resourceIdSchema.nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("councilDecisionProposal"),
      id: resourceIdSchema,
      textResourceId: resourceIdSchema,
      content: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("openQuestion"),
      id: resourceIdSchema,
      textResourceId: resourceIdSchema,
      content: z.string(),
    })
    .strict(),
]);

export const agendaItemSchema = z
  .object({
    id: resourceIdSchema,
    title: z.string(),
    councilBusinessId: resourceIdSchema.nullable(),
    discussionSummary: z.string(),
    canStartDiscussion: z.boolean(),
    canReviewBallot: z.boolean(),
    conductBlockers: conductBlockersSchema,
    agendaNumber: agendaNumberSchema.nullable(),
    introducedAt: timestampSchema.nullable(),
    councilMeetingId: resourceIdSchema,
    position: z
      .number()
      .int()
      .refine((position) => position !== 0),
    subject: agendaSubjectSchema,
    startedAt: timestampSchema.nullable(),
    completedAt: timestampSchema.nullable(),
    adjournedAt: timestampSchema.nullable(),
  })
  .strict();

const scheduledSubjectBase = {
  councilBusinessId: resourceIdSchema,
};

export const scheduleAgendaItemSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...scheduledSubjectBase,
      kind: z.literal("councilDecisionProposal"),
      position: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...scheduledSubjectBase,
      kind: z.literal("openQuestion"),
      position: z.number().int().positive(),
    })
    .strict(),
]);

export const reprogramAgendaItemSchema = z
  .object({
    councilMeetingId: resourceIdSchema,
    position: z.number().int().positive(),
  })
  .strict();

export const reorderCouncilAgendaSchema = z
  .object({
    agendaItemIds: z.array(resourceIdSchema),
  })
  .strict()
  .refine((value) => new Set(value.agendaItemIds).size === value.agendaItemIds.length, {
    message: "Each agenda item must occur exactly once",
    path: ["agendaItemIds"],
  });

export const startAgendaItemSchema = z
  .object({
    startedAt: timestampSchema,
  })
  .strict();

export const adjournAgendaItemSchema = z.object({ adjournedAt: timestampSchema }).strict();
export type AdjournAgendaItem = z.infer<typeof adjournAgendaItemSchema>;

export const completeAgendaItemSchema = z
  .object({
    completedAt: timestampSchema,
  })
  .strict();

export const closeCouncilMeetingSchema = z
  .object({
    closedAt: timestampSchema,
  })
  .strict();

const createAndScheduleCouncilBusinessBase = {
  path: resourcePathSchema,
  name: resourceNameSchema,
  reportName: resourceNameSchema,
  reportContent: z.string(),
  position: z.number().int().positive(),
};

export const createAndScheduleCouncilBusinessSchema = z.discriminatedUnion("kind", [
  z.object({ ...createAndScheduleCouncilBusinessBase, kind: z.literal("councilDecisionProposal") }).strict(),
  z.object({ ...createAndScheduleCouncilBusinessBase, kind: z.literal("openQuestion") }).strict(),
]);

export const createdAndScheduledCouncilBusinessSchema = z
  .object({ business: councilBusinessSchema, agendaItem: agendaItemSchema })
  .strict();

export const councilMeetingClosureSchema = z
  .object({
    closedMeeting: councilMeetingSchema,
    nextMeeting: councilMeetingSchema,
    minutes: minutesSummarySchema,
  })
  .strict();

export type CouncilMeeting = z.infer<typeof councilMeetingSchema>;
export type ProvisionInitialCouncilMeeting = z.infer<typeof provisionInitialCouncilMeetingSchema>;
export type ScheduleCouncilMeeting = z.infer<typeof scheduleCouncilMeetingSchema>;
export type SetCouncilMeetingOfficers = z.infer<typeof setCouncilMeetingOfficersSchema>;
export type PrepareCouncilMeeting = z.infer<typeof prepareCouncilMeetingSchema>;
export type RecordMeetingOpening = z.infer<typeof recordMeetingOpeningSchema>;
export type MeetingAttendanceStatus = z.infer<typeof meetingAttendanceStatusSchema>;
export type MeetingAttendance = z.infer<typeof meetingAttendanceSchema>;
export type MeetingAttendanceDeclaration = z.infer<typeof meetingAttendanceDeclarationSchema>;
export type RecordMeetingAttendance = z.infer<typeof recordMeetingAttendanceSchema>;
export type AgendaSubject = z.infer<typeof agendaSubjectSchema>;
export type AgendaItem = z.infer<typeof agendaItemSchema>;
export type ScheduleAgendaItem = z.infer<typeof scheduleAgendaItemSchema>;
export type ReprogramAgendaItem = z.infer<typeof reprogramAgendaItemSchema>;
export type ReorderCouncilAgenda = z.infer<typeof reorderCouncilAgendaSchema>;
export type StartAgendaItem = z.infer<typeof startAgendaItemSchema>;
export type CompleteAgendaItem = z.infer<typeof completeAgendaItemSchema>;
export type CloseCouncilMeeting = z.infer<typeof closeCouncilMeetingSchema>;
export type CouncilMeetingClosure = z.infer<typeof councilMeetingClosureSchema>;
export type CreateAndScheduleCouncilBusiness = z.infer<typeof createAndScheduleCouncilBusinessSchema>;
export type CreatedAndScheduledCouncilBusiness = z.infer<typeof createdAndScheduledCouncilBusinessSchema>;

export const agendaItemRecusalsSchema = agendaItemRecusalStateSchema.extend({ agendaItem: agendaItemSchema });
export type AgendaItemRecusals = z.infer<typeof agendaItemRecusalsSchema>;

export const meetingConductWorkspaceSchema = meetingConductStateSchema
  .extend({ meeting: councilMeetingSchema })
  .strict();
export type MeetingConductWorkspace = z.infer<typeof meetingConductWorkspaceSchema>;

// TODO REMOVE_STALE: temporary transition only; no validation or closure.
export const staleCouncilMeetingResultSchema = z.object({
  staleMeeting: councilMeetingSchema,
  nextMeeting: councilMeetingSchema,
});
export type StaleCouncilMeetingResult = z.infer<typeof staleCouncilMeetingResultSchema>;
