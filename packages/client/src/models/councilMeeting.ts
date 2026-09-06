import type { AgendaItem, Ballot, CouncilMeeting, MeetingAttendance } from "@hall/api-contract";

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
