import type { AgendaItem, Ballot, CouncilMeeting, MeetingAttendance, MeetingConductState } from "@hall/api-contract";

export type CouncilMeetingPhase = "draft" | "scheduled" | "inProgress" | "closed";

export interface CouncilMeetingView extends CouncilMeeting {
  phase: CouncilMeetingPhase;
  reference: string;
}

export interface CouncilMeetingWorkspace {
  meeting: CouncilMeetingView;
  attendance: MeetingAttendance[];
  agendaItems: AgendaItem[];
  ballots: Ballot[];
  conduct: MeetingConductState;
}

export function councilMeetingPhase(meeting: CouncilMeeting): CouncilMeetingPhase {
  if (meeting.closedAt) return "closed";
  if (meeting.startedAt) return "inProgress";
  if (meeting.scheduledAt) return "scheduled";
  return "draft";
}

export function councilMeetingView(meeting: CouncilMeeting): CouncilMeetingView {
  return {
    ...meeting,
    phase: councilMeetingPhase(meeting),
    reference: meeting.slug ?? meeting.id,
  };
}

export function councilMeetingIsFinished(meeting: CouncilMeetingView): boolean {
  return meeting.phase === "closed";
}

export function physicallyPresentCount(attendance: readonly MeetingAttendance[]): number {
  return attendance.filter((entry) => entry.status === "present").length;
}

// TODO REMOVE_STALE: temporary incomplete sessions are not upcoming, but remain unclosed.
export function councilMeetingIsActive(meeting: CouncilMeetingView): boolean {
  return !meeting.stale && !councilMeetingIsFinished(meeting);
}

/** Meetings still to hold or in progress, the earliest first. */
export function upcomingCouncilMeetings(meetings: readonly CouncilMeetingView[]): CouncilMeetingView[] {
  return meetings
    .filter(councilMeetingIsActive)
    .sort((left, right) => (left.scheduledAt ?? "").localeCompare(right.scheduledAt ?? ""));
}

/** Latest closed meeting that is not marked incomplete. */
export function lastClosedCouncilMeeting(meetings: readonly CouncilMeetingView[]): CouncilMeetingView | null {
  return (
    meetings
      .filter((meeting) => !meeting.stale && councilMeetingIsFinished(meeting))
      .sort((left, right) => (right.scheduledAt ?? "").localeCompare(left.scheduledAt ?? ""))[0] ?? null
  );
}
