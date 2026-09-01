import {
  type AgendaItem,
  agendaBusinessRank,
  type CouncilMeeting,
  councilBusinessAgendaProfile,
  isAgendaBusinessOrderValid,
} from "@hall/domain";

export interface AgendaReadiness {
  agendaReady: boolean;
  requiredMinutesOfMeetingId: string | null;
}

export function previousCouncilMeeting(
  meetings: readonly CouncilMeeting[],
  meeting: CouncilMeeting,
): CouncilMeeting | null {
  return (
    meetings
      .filter((candidate) => candidate.id !== meeting.id && candidate.status !== "cancelled")
      .filter((candidate) => candidate.startsAt < meeting.startsAt)
      .sort((left, right) => right.startsAt.localeCompare(left.startsAt))[0] ?? null
  );
}

export function followingCouncilMeeting(
  meetings: readonly CouncilMeeting[],
  meeting: CouncilMeeting,
): CouncilMeeting | null {
  return (
    meetings
      .filter((candidate) => candidate.id !== meeting.id && candidate.status !== "cancelled")
      .filter((candidate) => candidate.startsAt > meeting.startsAt)
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt))[0] ?? null
  );
}

export function agendaReadiness(
  meeting: CouncilMeeting,
  agendaItems: readonly AgendaItem[],
  meetings: readonly CouncilMeeting[],
): AgendaReadiness {
  const previousMeeting = previousCouncilMeeting(meetings, meeting);
  const minutesApprovalMeetingIds = agendaItems.flatMap((item) => {
    const minutesOfMeetingId = councilBusinessAgendaProfile(item.business).minutesOfMeetingId;
    return minutesOfMeetingId ? [minutesOfMeetingId] : [];
  });
  const minutesAreValid = previousMeeting
    ? minutesApprovalMeetingIds.length === 1 && minutesApprovalMeetingIds[0] === previousMeeting.id
    : minutesApprovalMeetingIds.length === 0;
  return {
    agendaReady: minutesAreValid && isAgendaBusinessOrderValid(agendaItems.map((item) => item.business)),
    requiredMinutesOfMeetingId: previousMeeting?.id ?? null,
  };
}

export function normalizedAgendaItemIds(agendaItems: readonly AgendaItem[]): string[] {
  return [...agendaItems]
    .sort(
      (left, right) =>
        agendaBusinessRank(left.business) - agendaBusinessRank(right.business) || left.position - right.position,
    )
    .map((item) => item.id);
}

export function isPartialAgendaValid(agendaItems: readonly AgendaItem[]): boolean {
  const minutesApprovalCount = agendaItems.filter(
    (item) => councilBusinessAgendaProfile(item.business).role === "minutesApproval",
  ).length;
  return minutesApprovalCount <= 1 && isAgendaBusinessOrderValid(agendaItems.map((item) => item.business));
}
