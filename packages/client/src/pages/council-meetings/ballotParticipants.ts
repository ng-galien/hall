import type { CouncilMember, MeetingAggregate } from "@hall/domain";

export interface BallotParticipant {
  memberId: string;
  castByMemberId: string;
  memberName: string;
  castByName: string;
  represented: boolean;
}

const memberName = (members: CouncilMember[], memberId: string): string => {
  const member = members.find((candidate) => candidate.id === memberId);
  return member ? `${member.firstName} ${member.lastName}` : memberId;
};

export function ballotParticipants(aggregate: MeetingAggregate, members: CouncilMember[]): BallotParticipant[] {
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

export function councilMemberName(members: CouncilMember[], memberId: string): string {
  return memberName(members, memberId);
}
