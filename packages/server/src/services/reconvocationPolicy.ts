const millisecondsPerDay = 24 * 60 * 60 * 1000;

function localCalendarDay(isoDateTime: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(isoDateTime);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Three complete calendar days must fall between sending the notice and holding the reconvened meeting. */
export function hasThreeClearDays(noticeSentAt: string, meetingStartsAt: string): boolean {
  return localCalendarDay(meetingStartsAt) - localCalendarDay(noticeSentAt) >= 4 * millisecondsPerDay;
}
