import {
  meetingConductWorkspaceSchema,
  recordMeetingMembershipSchema,
  recordMeetingAttendanceEventsSchema,
  recordMeetingQuorumSchema,
  type RecordMeetingMembership,
  type RecordMeetingAttendanceEvents,
  type RecordMeetingQuorum,
} from "@hall/api-contract";
import { apiSirenRequest, submitSirenActionAt } from "./apiClient";

const conductPath = (reference: string) => `/council-meetings/${encodeURIComponent(reference)}/conduct`;

export async function openMeetingConduct(reference: string) {
  const result = await apiSirenRequest<unknown>(conductPath(reference));
  return { data: meetingConductWorkspaceSchema.parse(result.data), representation: result.representation };
}
export async function recordMeetingMembership(reference: string, input: RecordMeetingMembership) {
  return submitSirenActionAt(
    conductPath(reference),
    "meeting.record-membership",
    recordMeetingMembershipSchema.parse(input),
  );
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
