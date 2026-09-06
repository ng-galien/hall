import type { CouncilMemberView } from "../../models/directory";
import type { LiveMeetingPresentation } from "../../models/liveMeeting";

export interface BallotParticipant {
  memberId: string;
  castByMemberId: string;
  memberName: string;
  castByName: string;
  represented: boolean;
}

const memberName = (members: CouncilMemberView[], memberId: string): string => {
  const member = members.find((candidate) => candidate.id === memberId);
  return member ? `${member.contact.firstName} ${member.contact.lastName}` : memberId;
};

export function ballotParticipants(aggregate: LiveMeetingPresentation, members: CouncilMemberView[]): BallotParticipant[] {
  return aggregate.attendance
    .filter((attendance) => attendance.status === "present" || attendance.status === "represented")
    .map((attendance) => {
      const represented = attendance.status === "represented";
      const castByMemberId = represented
        ? (attendance.proxyHolderMemberId ?? attendance.memberId)
        : attendance.memberId;
      return {
        memberId: attendance.memberId,
        castByMemberId,
        memberName: memberName(members, attendance.memberId),
        castByName: memberName(members, castByMemberId),
        represented,
      };
    });
}

export function councilMemberName(members: CouncilMemberView[], memberId: string): string {
  return memberName(members, memberId);
}
