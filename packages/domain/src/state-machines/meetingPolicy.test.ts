import { describe, expect, it } from "vitest";
import { meetingAgendaCanChange, meetingAttendanceCanChange, meetingIsFinished } from "./meetingMachine.js";

describe("meeting status policies", () => {
  it.each([
    ["draft", true],
    ["scheduled", true],
    ["inProgress", false],
    ["closed", false],
    ["cancelled", false],
  ] as const)("defines whether the %s agenda can change", (status, expected) => {
    expect(meetingAgendaCanChange(status)).toBe(expected);
  });

  it.each([
    ["draft", false],
    ["scheduled", true],
    ["inProgress", true],
    ["closed", false],
    ["cancelled", false],
  ] as const)("defines whether %s attendance can change", (status, expected) => {
    expect(meetingAttendanceCanChange(status)).toBe(expected);
  });

  it.each([
    ["draft", false],
    ["scheduled", false],
    ["inProgress", false],
    ["closed", true],
    ["cancelled", true],
  ] as const)("defines whether %s is finished", (status, expected) => {
    expect(meetingIsFinished(status)).toBe(expected);
  });
});
