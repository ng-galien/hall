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
export const meetingConductEvidenceSchema = z
  .object({
    membershipRecords: z.array(meetingMembershipRecordSchema),
    attendanceEvents: z.array(meetingAttendanceEventSchema),
    quorumObservations: z.array(meetingQuorumObservationSchema),
    reconvocations: z.array(meetingReconvocationSchema),
  })
  .strict();
export const meetingConductStateSchema = meetingConductEvidenceSchema
  .extend({
    councilMeetingId: id,
    currentAttendance: z.array(currentMeetingAttendanceSchema),
    canRecordAttendanceEvents: z.boolean(),
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
