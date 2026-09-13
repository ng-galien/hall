import type { EventDocument } from "@hall/api-contract";

export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return localDate(value);
}
export function emptyEventDocument(): EventDocument {
  const start = localDate(new Date());
  return { content: "", location: "", participants: [], schedule: { kind: "allDay", start, end: nextDate(start) } };
}
export function localDateTime(value: string): string {
  const date = new Date(value);
  return `${localDate(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function eventDocumentUsesQuarterHours(document: EventDocument): boolean {
  if (document.schedule.kind === "allDay") return true;
  return [document.schedule.start, document.schedule.end].every((value) => {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.getSeconds() === 0 && date.getMilliseconds() === 0 && date.getMinutes() % 15 === 0;
  });
}

export function nextDate(date: string): string {
  return shiftDate(date, 1);
}
