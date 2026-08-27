import { type Attendance, calculateQuorum, type ParticipationEvidence } from "@mairie/domain";

export function buildParticipationEvidence(
  rosterMemberIds: string[],
  attendance: Attendance[],
  isReconvenedMeeting: boolean,
): ParticipationEvidence {
  const roster = [...rosterMemberIds];
  const attendanceEvidence = attendance.map((item) => ({
    memberId: item.memberId,
    status: item.status,
    proxyHolderMemberId: item.proxyHolderMemberId,
    proxyDocumentId: item.proxyDocumentId,
    version: item.version,
  }));
  return {
    rosterMemberIds: roster,
    attendance: attendanceEvidence,
    quorum: calculateQuorum(roster.length, attendance, isReconvenedMeeting),
  };
}
