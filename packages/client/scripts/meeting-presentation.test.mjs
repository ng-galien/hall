import assert from "node:assert/strict";
import test from "node:test";
import {
  formatMeetingLabel,
  meetingScheduleInputValue,
  meetingScheduleInstant,
} from "../src/features/council-meetings/meetingPresentation.ts";

test("meeting labels derive identity from the occurrence number and date", () => {
  const label = formatMeetingLabel(
    { number: 3, scheduledAt: "2026-11-02T17:30:00.000Z" },
    "Conseil municipal {number}, {date}",
    () => "02/11/2026",
  );

  assert.equal(label, "Conseil municipal 3, 02/11/2026");
});

test("undated meeting labels omit the date separator unless an explicit fallback is requested", () => {
  const meeting = { number: 4, scheduledAt: null };
  const template = "Conseil municipal {number}, {date}";
  assert.equal(formatMeetingLabel(meeting, template, () => "unexpected"), "Conseil municipal 4");
  assert.equal(formatMeetingLabel(meeting, template, () => "unexpected", "À planifier"), "Conseil municipal 4, À planifier");
});

test("an unscheduled meeting proposes today's local date without changing its schedule", () => {
  const meeting = { scheduledAt: null };
  assert.equal(
    meetingScheduleInputValue(meeting.scheduledAt, "Europe/Paris", new Date("2026-09-06T12:35:00Z")),
    "2026-09-06T14:35",
  );
  assert.equal(meeting.scheduledAt, null);
});

test("an existing schedule is preserved in local time, including a genuine epoch date", () => {
  for (const [date, expected] of [
    ["2026-11-09T17:30:00Z", "2026-11-09T18:30"],
    ["1970-01-01T00:00:00Z", "1970-01-01T01:00"],
  ]) {
    assert.equal(meetingScheduleInputValue(date, "Europe/Paris"), expected);
  }
});

test("scheduling uses Hall's time zone, including daylight-saving boundaries", () => {
  assert.equal(meetingScheduleInstant("2026-09-06T14:35", "Europe/Paris"), "2026-09-06T12:35:00.000Z");
  assert.equal(meetingScheduleInstant("2026-11-09T18:30", "Europe/Paris"), "2026-11-09T17:30:00.000Z");
  assert.equal(meetingScheduleInstant("2026-03-29T02:30", "Europe/Paris"), null);
  assert.equal(meetingScheduleInstant("invalid", "Europe/Paris"), null);
});
