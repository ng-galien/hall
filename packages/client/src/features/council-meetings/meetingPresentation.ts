import type { CouncilMeeting } from "@hall/domain";

type MeetingLabelSource = Pick<CouncilMeeting, "number" | "startsAt">;

export function formatMeetingLabel(
  meeting: MeetingLabelSource,
  template: string,
  formatDate: (value: string | Date) => string,
): string {
  return template.replace("{number}", meeting.number).replace("{date}", formatDate(meeting.startsAt));
}
