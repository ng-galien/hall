import {
  meetingConductWorkspaceSchema,
  recordMeetingAttendanceEventsSchema,
  recordMeetingQuorumSchema,
  type RecordMeetingAttendanceEvents,
  type RecordMeetingQuorum,
  recordMeetingReconvocationSchema,
  type RecordMeetingReconvocation,
  recordMeetingOpeningSchema,
  type RecordMeetingOpening,
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
