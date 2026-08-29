import assert from "node:assert/strict";
import test from "node:test";
import { formatMeetingLabel } from "../src/features/council-meetings/meetingPresentation.ts";

test("meeting labels derive identity from the occurrence number and date", () => {
  const label = formatMeetingLabel(
    { number: "2026-003", startsAt: "2026-11-02T17:30:00.000Z" },
    "Conseil municipal {number}, {date}",
    () => "02/11/2026",
  );

  assert.equal(label, "Conseil municipal 2026-003, 02/11/2026");
});
