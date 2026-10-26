import { meetingActionBlockersSchema } from "@hall/contracts";
import { z } from "zod";

const id = z.uuid();
const time = z.iso.datetime({ offset: true });
const memberIdentity = z.object({ councilMemberId: id, name: z.string() }).strict();
const evidence = { id, councilMeetingId: id, observedAt: time, recordedAt: time, recordedBy: z.string().min(1) };
export const currentMeetingAttendanceSchema = z
  .object({
    id,
    councilMemberId: id,
    status: z.enum(["present", "represented", "excused", "absent"]),
    proxyHolderAttendanceId: id.nullable(),
    proxyDocumentId: id.nullable(),
    observedAt: time.nullable(),
  })
  .strict();
export const meetingMembershipRecordSchema = z
  .object({
    ...evidence,
    sourceReference: z.string().min(1),
    members: z.array(memberIdentity).min(1),
  })
  .strict();
export const meetingAttendanceEventSchema = z
  .object({
    id,
    meetingAttendanceId: id,
    observedAt: time,
    recordedAt: time,
    recordedBy: z.string().min(1),
    status: z.enum(["present", "represented", "excused", "absent"]),
    proxyHolderAttendanceId: id.nullable(),
    proxyDocumentId: id.nullable(),
  })
  .strict();
export const meetingQuorumFactsSchema = z
  .object({
    membershipRecordId: id,
    membersInOffice: z.array(memberIdentity).min(1),
    membershipObservedAt: time,
    membershipSourceReference: z.string().min(1),
    memberCount: z.number().int().positive(),
    excludedMemberIds: z.array(id),
    denominatorExcludedMemberIds: z.array(id),
    denominator: z.number().int().nonnegative(),
    requiredPresent: z.number().int().positive(),
    presentMemberIds: z.array(id),
    presentCount: z.number().int().nonnegative(),
    regime: z.enum(["ordinary", "secondConvocation"]),
    verdict: z.enum(["met", "notMet", "exempt"]),
    reconvocationId: id.nullable(),
    attendance: z.array(currentMeetingAttendanceSchema),
    remainingAgendaItemIds: z.array(id),
  })
  .strict();
export const meetingQuorumObservationSchema = z
  .object({
    ...evidence,
    agendaItemId: id.nullable(),
    facts: meetingQuorumFactsSchema,
  })
  .strict();
export const meetingReconvocationSchema = z
  .object({
    id,
    councilMeetingId: id,
    failedObservationId: id,
    sentAt: time,
    scheduledAt: time,
    timeZone: z.string().min(1),
    firstNoticeEvidence: z.string().min(1),
    renewedNoticeEvidence: z.string().min(1),
    agendaItemIds: z.array(id).min(1),
    recordedAt: time,
    recordedBy: z.string().min(1),
  })
  .strict();
export const meetingOfficeSchema = z.enum(["chair", "secretary"]);
export type MeetingOffice = z.infer<typeof meetingOfficeSchema>;
export const meetingOfficerBasisSchema = z.enum([
  "mayor",
  "deputyInNominationOrder",
  "councilDesignation",
  "councilNomination",
  "financialStatementElection",
]);
export type MeetingOfficerBasis = z.infer<typeof meetingOfficerBasisSchema>;
export const meetingOfficerChangeSchema = z
  .object({
    id,
    councilMeetingId: id,
    agendaItemId: id.nullable(),
    office: meetingOfficeSchema,
    basis: meetingOfficerBasisSchema,
    councilMemberId: id,
    memberName: z.string(),
    observedAt: time,
    recordedAt: time,
    recordedBy: z.string().min(1),
  })
  .strict();
export type MeetingOfficerChange = z.infer<typeof meetingOfficerChangeSchema>;
export const auxiliaryAttendanceQualitySchema = z.enum(["townHallSecretary", "auxiliarySecretary", "guest", "expert"]);
export type AuxiliaryAttendanceQuality = z.infer<typeof auxiliaryAttendanceQualitySchema>;
export const auxiliaryAttendanceQualities = auxiliaryAttendanceQualitySchema.options;
export const meetingAuxiliaryAttendanceSchema = z
  .object({
    id,
    councilMeetingId: id,
    contactId: id,
    name: z.string(),
    quality: auxiliaryAttendanceQualitySchema,
    declaredAt: time,
    recordedAt: time,
    recordedBy: z.string().min(1),
  })
  .strict();
export type MeetingAuxiliaryAttendance = z.infer<typeof meetingAuxiliaryAttendanceSchema>;
export const meetingConductEvidenceSchema = z
  .object({
    membershipRecords: z.array(meetingMembershipRecordSchema),
    attendanceEvents: z.array(meetingAttendanceEventSchema),
    quorumObservations: z.array(meetingQuorumObservationSchema),
    reconvocations: z.array(meetingReconvocationSchema),
    // Minutes closed before these events existed carry no such entries.
    officerChanges: z.array(meetingOfficerChangeSchema).default([]),
    auxiliaryAttendances: z.array(meetingAuxiliaryAttendanceSchema).default([]),
  })
  .strict();
const handoverOption = z.object({ councilMemberId: id, basis: meetingOfficerBasisSchema }).strict();
export const meetingConductStateSchema = meetingConductEvidenceSchema
  .extend({
    councilMeetingId: id,
    currentAttendance: z.array(currentMeetingAttendanceSchema),
    canRecordAttendanceEvents: z.boolean(),
    meetingActionBlockers: meetingActionBlockersSchema,
    currentOfficers: z.object({ chairMemberId: id.nullable(), secretaryMemberId: id.nullable() }).strict(),
    officerHandoverOptions: z.object({ chair: z.array(handoverOption), secretary: z.array(handoverOption) }).strict(),
    canRecordOfficerChange: z.boolean(),
    canDeclareAuxiliaryAttendance: z.boolean(),
    canRecordQuorum: z.boolean(),
    canRecordReconvocation: z.boolean(),
  })
  .strict();
export type MeetingQuorumObservation = z.infer<typeof meetingQuorumObservationSchema>;
export type MeetingConductState = z.infer<typeof meetingConductStateSchema>;
export const recordMeetingAttendanceEventsSchema = z
  .object({
    observedAt: time,
    changes: z
      .array(
        z
          .object({
            councilMemberId: id,
            status: z.enum(["present", "represented", "excused", "absent"]),
            proxyHolderCouncilMemberId: id.nullable(),
            proxyDocumentId: id.nullable(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export const recordMeetingQuorumSchema = z.object({ agendaItemId: id.nullable(), observedAt: time }).strict();
export const recordMeetingOfficerChangeSchema = z
  .object({ office: meetingOfficeSchema, councilMemberId: id, observedAt: time })
  .strict();
export type RecordMeetingOfficerChange = z.infer<typeof recordMeetingOfficerChangeSchema>;
export const declareMeetingAuxiliaryAttendanceSchema = z
  .object({ contactId: id, quality: auxiliaryAttendanceQualitySchema, declaredAt: time })
  .strict();
export type DeclareMeetingAuxiliaryAttendance = z.infer<typeof declareMeetingAuxiliaryAttendanceSchema>;
export const recordMeetingReconvocationSchema = z
  .object({
    failedObservationId: id,
    sentAt: time,
    scheduledAt: time,
    timeZone: z.string().min(1),
    firstNoticeEvidence: z.string().trim().min(1),
    renewedNoticeEvidence: z.string().trim().min(1),
    agendaItemIds: z.array(id).min(1),
  })
  .strict();
export type RecordMeetingAttendanceEvents = z.infer<typeof recordMeetingAttendanceEventsSchema>;
export type RecordMeetingQuorum = z.infer<typeof recordMeetingQuorumSchema>;
export type RecordMeetingReconvocation = z.infer<typeof recordMeetingReconvocationSchema>;
