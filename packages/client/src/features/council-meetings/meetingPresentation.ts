import type { CouncilMeetingView } from "../../models/councilMeeting";

type MeetingLabelSource = Pick<CouncilMeetingView, "number" | "scheduledAt">;

export function formatMeetingLabel(
  meeting: MeetingLabelSource,
  template: string,
  formatDate: (value: string | Date) => string,
  unscheduledLabel = "-",
): string {
  return template
    .replace("{number}", String(meeting.number))
    .replace("{date}", meeting.scheduledAt ? formatDate(meeting.scheduledAt) : unscheduledLabel);
}
