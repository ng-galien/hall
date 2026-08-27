import type { AttendanceEvidence, ParticipationEvidence } from "./model.js";

type AttendanceStatusEvidence = Pick<AttendanceEvidence, "status">;

export function calculateQuorum(
  activeMembers: number,
  attendance: AttendanceStatusEvidence[],
  isReconvenedMeeting: boolean,
): ParticipationEvidence["quorum"] {
  const physicallyPresent = attendance.filter((item) => item.status === "present").length;
  const required = Math.floor(activeMembers / 2) + 1;
  return {
    activeMembers,
    physicallyPresent,
    required,
    reached: isReconvenedMeeting || (activeMembers > 0 && physicallyPresent >= required),
  };
}

export function isAttendanceComplete(evidence: ParticipationEvidence): boolean {
  const attendedMemberIds = new Set(evidence.attendance.map((item) => item.memberId));
  return (
    evidence.rosterMemberIds.length > 0 &&
    attendedMemberIds.size === evidence.rosterMemberIds.length &&
    evidence.rosterMemberIds.every((memberId) => attendedMemberIds.has(memberId))
  );
}

export function isQuorumEvidenceConsistent(evidence: ParticipationEvidence, isReconvenedMeeting: boolean): boolean {
  const expected = calculateQuorum(evidence.rosterMemberIds.length, evidence.attendance, isReconvenedMeeting);
  return (
    evidence.quorum.activeMembers === expected.activeMembers &&
    evidence.quorum.physicallyPresent === expected.physicallyPresent &&
    evidence.quorum.required === expected.required &&
    evidence.quorum.reached === expected.reached
  );
}
