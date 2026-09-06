import type { LiveMeetingPresentation } from "../../models/liveMeeting";

export type MeetingOpeningBlock =
  | "attendanceIncomplete"
  | "quorumNotReached"
  | "officersMissing"
  | "officersNotPresent"
  | "quorumFailure";

export function meetingOpeningBlock(aggregate: LiveMeetingPresentation): MeetingOpeningBlock | null {
  const { meeting, rosterMemberIds, attendance, quorum } = aggregate;
  if (meeting.quorumFailure) return "quorumFailure";
  const attendedMemberIds = new Set(attendance.map((item) => item.memberId));
  const attendanceComplete =
    rosterMemberIds.length > 0 &&
    attendedMemberIds.size === rosterMemberIds.length &&
    rosterMemberIds.every((memberId) => attendedMemberIds.has(memberId));
  if (!attendanceComplete) return "attendanceIncomplete";
  if (!quorum.reached) return "quorumNotReached";
  if (
    !meeting.chairMemberId ||
    !meeting.secretaryMemberId ||
    !rosterMemberIds.includes(meeting.chairMemberId) ||
    !rosterMemberIds.includes(meeting.secretaryMemberId)
  ) {
    return "officersMissing";
  }
  const physicallyPresentMemberIds = new Set(
    attendance.filter((item) => item.status === "present").map((item) => item.memberId),
  );
  if (
    !physicallyPresentMemberIds.has(meeting.chairMemberId) ||
    !physicallyPresentMemberIds.has(meeting.secretaryMemberId)
  ) {
    return "officersNotPresent";
  }
  return null;
}
