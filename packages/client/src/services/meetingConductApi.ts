import {
  type CorrectMeetingAuxiliaryAttendance,
  correctMeetingAuxiliaryAttendanceSchema,
  type DeclareMeetingAuxiliaryAttendance,
  declareMeetingAuxiliaryAttendanceSchema,
  meetingConductWorkspaceSchema,
  type RecordMeetingAttendanceEvents,
  type RecordMeetingOfficerChange,
  type RecordMeetingOpening,
  type RecordMeetingQuorum,
  type RecordMeetingReconvocation,
  recordMeetingAttendanceEventsSchema,
  recordMeetingOfficerChangeSchema,
  recordMeetingOpeningSchema,
  recordMeetingQuorumSchema,
  recordMeetingReconvocationSchema,
} from "@hall/api-contract";
import { apiSirenRequest, submitSirenActionAt } from "./apiClient";

const conductPath = (reference: string) => `/council-meetings/${encodeURIComponent(reference)}/conduct`;

export async function openMeetingConduct(reference: string) {
  const result = await apiSirenRequest<unknown>(conductPath(reference));
  return { data: meetingConductWorkspaceSchema.parse(result.data), representation: result.representation };
}
export async function recordMeetingOpening(reference: string, input: RecordMeetingOpening) {
  const result = await submitSirenActionAt<unknown>(
    `/council-meetings/${encodeURIComponent(reference)}`,
    "meeting.record-opening",
    recordMeetingOpeningSchema.parse(input),
  );
  return meetingConductWorkspaceSchema.parse(result.data);
}
export async function recordMeetingReconvocation(reference: string, input: RecordMeetingReconvocation) {
  const result = await submitSirenActionAt<unknown>(
    conductPath(reference),
    "meeting.record-reconvocation",
    recordMeetingReconvocationSchema.parse(input),
  );
  return meetingConductWorkspaceSchema.parse(result.data);
}
export async function recordMeetingAttendanceEvents(reference: string, input: RecordMeetingAttendanceEvents) {
  return submitSirenActionAt(
    conductPath(reference),
    "meeting.record-attendance-events",
    recordMeetingAttendanceEventsSchema.parse(input),
  );
}
export async function recordMeetingQuorum(reference: string, input: RecordMeetingQuorum) {
  return submitSirenActionAt(conductPath(reference), "meeting.record-quorum", recordMeetingQuorumSchema.parse(input));
}
export async function recordMeetingOfficerChange(reference: string, input: RecordMeetingOfficerChange) {
  return submitSirenActionAt(
    conductPath(reference),
    "meeting.record-officer-change",
    recordMeetingOfficerChangeSchema.parse(input),
  );
}
export async function correctMeetingAuxiliaryAttendance(reference: string, input: CorrectMeetingAuxiliaryAttendance) {
  return submitSirenActionAt(
    conductPath(reference),
    "meeting.correct-auxiliary-attendance",
    correctMeetingAuxiliaryAttendanceSchema.parse(input),
  );
}
export async function declareMeetingAuxiliaryAttendance(reference: string, input: DeclareMeetingAuxiliaryAttendance) {
  return submitSirenActionAt(
    conductPath(reference),
    "meeting.declare-auxiliary-attendance",
    declareMeetingAuxiliaryAttendanceSchema.parse(input),
  );
}
