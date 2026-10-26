import { z } from "zod";
import { matchLiteral } from "./match.js";
import type { MeetingStatus } from "./model.js";

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
// Exceptions to the three-meeting limit of a written proxy (CGCT L2121-20).
export const proxyLimitExceptionSchema = z.enum(["illness", "maternityLeave"]);
export type ProxyLimitException = z.infer<typeof proxyLimitExceptionSchema>;
export const meetingProxyExceptionSchema = z
  .object({
    id,
    councilMeetingId: id,
    proxyDocumentId: id,
    basis: proxyLimitExceptionSchema,
    declaredAt: time,
    recordedAt: time,
    recordedBy: z.string().min(1),
  })
  .strict();
export type MeetingProxyException = z.infer<typeof meetingProxyExceptionSchema>;
// Closed session decided without debate (CGCT L2121-18).
export const meetingClosedSessionSchema = z
  .object({
    id,
    councilMeetingId: id,
    requesters: z.array(memberIdentity).min(1),
    approvals: z.number().int().nonnegative(),
    presentOrRepresented: z.number().int().nonnegative(),
    wholeMeeting: z.boolean(),
    agendaItemIds: z.array(id),
    observedAt: time,
    recordedAt: time,
    recordedBy: z.string().min(1),
  })
  .strict();
export type MeetingClosedSession = z.infer<typeof meetingClosedSessionSchema>;
export const meetingOfficeSchema = z.enum(["chair", "secretary"]);
export type MeetingOffice = z.infer<typeof meetingOfficeSchema>;
export const meetingOfficerBasisSchema = z.enum([
  "mayor",
  "deputyInNominationOrder",
  "councilDesignation",
  "councilNomination",
]);
export type MeetingOfficerBasis = z.infer<typeof meetingOfficerBasisSchema>;
export const meetingOfficerChangeSchema = z
  .object({
    id,
    councilMeetingId: id,
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
export const meetingAuxiliaryAttendanceSchema = z
  .object({
    id,
    councilMeetingId: id,
    contactId: id,
    name: z.string(),
    quality: z.string().nullable(),
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
    proxyExceptions: z.array(meetingProxyExceptionSchema).default([]),
    closedSessions: z.array(meetingClosedSessionSchema).default([]),
  })
  .strict();
const handoverOption = z.object({ councilMemberId: id, basis: meetingOfficerBasisSchema }).strict();
export const meetingConductStateSchema = meetingConductEvidenceSchema
  .extend({
    councilMeetingId: id,
    currentAttendance: z.array(currentMeetingAttendanceSchema),
    canRecordAttendanceEvents: z.boolean(),
    currentOfficers: z.object({ chairMemberId: id.nullable(), secretaryMemberId: id.nullable() }).strict(),
    officerHandoverOptions: z
      .object({
        chair: z.array(handoverOption),
        secretary: z.array(handoverOption),
        proposedChairMemberId: id.nullable(),
      })
      .strict(),
    canRecordOfficerChange: z.boolean(),
    canDeclareAuxiliaryAttendance: z.boolean(),
    canRecordClosedSession: z.boolean(),
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
            proxyException: proxyLimitExceptionSchema.nullable().optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export const recordMeetingClosedSessionSchema = z
  .object({
    requesterMemberIds: z.array(id).min(1).max(3),
    approvals: z.number().int().nonnegative(),
    scope: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("wholeMeeting") }).strict(),
      z.object({ kind: z.literal("agendaItems"), agendaItemIds: z.array(id).min(1) }).strict(),
    ]),
    observedAt: time,
  })
  .strict();
export type RecordMeetingClosedSession = z.infer<typeof recordMeetingClosedSessionSchema>;
export const recordMeetingQuorumSchema = z.object({ agendaItemId: id.nullable(), observedAt: time }).strict();
export const recordMeetingOfficerChangeSchema = z
  .object({ office: meetingOfficeSchema, councilMemberId: id, observedAt: time })
  .strict();
export type RecordMeetingOfficerChange = z.infer<typeof recordMeetingOfficerChangeSchema>;
const auxiliaryQuality = z
  .string()
  .trim()
  .transform((value) => value || null)
  .nullable();
export const declareMeetingAuxiliaryAttendanceSchema = z
  .object({
    person: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("contact"), contactId: id }).strict(),
      z
        .object({
          kind: z.literal("newContact"),
          firstName: z.string().trim().min(1),
          lastName: z.string().trim().min(1),
        })
        .strict(),
    ]),
    quality: auxiliaryQuality,
    declaredAt: time,
  })
  .strict();
export type DeclareMeetingAuxiliaryAttendance = z.input<typeof declareMeetingAuxiliaryAttendanceSchema>;
export const correctMeetingAuxiliaryAttendanceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("quality"), attendanceId: id, quality: auxiliaryQuality }).strict(),
  z.object({ kind: z.literal("removal"), attendanceId: id }).strict(),
]);
export type CorrectMeetingAuxiliaryAttendance = z.input<typeof correctMeetingAuxiliaryAttendanceSchema>;
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

export function meetingAgendaCanChange(status: MeetingStatus): boolean {
  return matchLiteral(status, {
    draft: () => true,
    scheduled: () => true,
    inProgress: () => false,
    closed: () => false,
    cancelled: () => false,
  });
}
