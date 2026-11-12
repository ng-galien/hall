import type { CouncilMeetingView } from "../../models/councilMeeting";

type MeetingLabelSource = Pick<CouncilMeetingView, "number" | "scheduledAt">;

export function meetingScheduleInputValue(scheduledAt: string | null, timeZone: string, now = new Date()): string {
  const date = scheduledAt === null ? now : new Date(scheduledAt);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Convert Hall's wall clock to an instant, rejecting nonexistent daylight-saving times. */
export function meetingScheduleInstant(value: string, timeZone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const wallClock = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wallClock)) return null;
  let instant = wallClock;
  for (let attempt = 0; attempt < 3; attempt++) {
    const rendered = meetingScheduleInputValue(new Date(instant).toISOString(), timeZone);
    if (rendered === value) return new Date(instant).toISOString();
    instant += wallClock - Date.parse(`${rendered}:00Z`);
  }
  return null;
}

/** Name of a meeting without its date, for a row whose date head already gives the day. */
export function formatMeetingName(meeting: MeetingLabelSource, template: string): string {
  return template.replace(/,?\s*\{date\}/, "").replace("{number}", String(meeting.number));
}

export function formatMeetingLabel(
  meeting: MeetingLabelSource,
  template: string,
  formatDate: (value: string | Date) => string,
  unscheduledLabel = "",
): string {
  const label = meeting.scheduledAt || unscheduledLabel ? template : template.replace(/,?\s*\{date\}/, "");
  return label
    .replace("{number}", String(meeting.number))
    .replace("{date}", meeting.scheduledAt ? formatDate(meeting.scheduledAt) : unscheduledLabel);
}
