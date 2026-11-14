import type { BallotResultPreview } from "@hall/api-contract";

/** A member taking part in the reviewed ballot, with the holder of the written proxy when represented. */
export interface BallotConfirmationVoter {
  memberId: string;
  represented: boolean;
  proxyHolderMemberId: string | null;
}

export interface BallotConfirmationFacts {
  /** The members whose vote the ballot records: every participant of a public ballot except those not voting, every participant of a secret ballot. */
  voters: BallotConfirmationVoter[];
  presentCount: number;
  representedCount: number;
  /** The participants of a public ballot recorded as not taking part in the vote. */
  nonVotingMemberIds: string[];
  chairMemberId: string | null;
}

interface AttendanceEntry {
  id: string;
  memberId: string;
  status: string;
  proxyHolderMemberId: string | null;
}

/**
 * Names the participants of a reviewed ballot preview from the attendance of the meeting. The preview remains the
 * only source of who takes part, who does not vote and who chairs; the attendance only gives their member and proxy.
 * @implements-requirement HALL-FR-BAL-320
 */
export function ballotConfirmationFacts(
  preview: BallotResultPreview,
  attendance: readonly AttendanceEntry[],
): BallotConfirmationFacts {
  const byAttendanceId = new Map(attendance.map((entry) => [entry.id, entry]));
  const nonParticipationIds = new Set(
    preview.candidate.mode === "public"
      ? preview.candidate.nonParticipations.map((entry) => entry.meetingAttendanceId)
      : [],
  );
  const voters = preview.candidate.participantAttendanceIds.flatMap((attendanceId) => {
    const entry = byAttendanceId.get(attendanceId);
    if (!entry || nonParticipationIds.has(attendanceId)) return [];
    return [
      {
        memberId: entry.memberId,
        represented: entry.status === "represented",
        proxyHolderMemberId: entry.status === "represented" ? entry.proxyHolderMemberId : null,
      },
    ];
  });
  return {
    voters,
    presentCount: voters.filter((voter) => !voter.represented).length,
    representedCount: voters.filter((voter) => voter.represented).length,
    nonVotingMemberIds: [...nonParticipationIds].flatMap((attendanceId) => {
      const entry = byAttendanceId.get(attendanceId);
      return entry ? [entry.memberId] : [];
    }),
    chairMemberId: byAttendanceId.get(preview.candidate.chairmanAttendanceId)?.memberId ?? null,
  };
}
