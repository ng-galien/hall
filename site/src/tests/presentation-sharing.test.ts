import { expect, test } from "vitest";
import settings from "../presentation/story-settings.json";
import type { StorySettings } from "../story/settings";
import { TimeBase } from "../story/timebase";
import { Timeline } from "../story/timeline";

const timeline = new Timeline(Object.keys(settings.steps), settings as StorySettings);
const base = new TimeBase(timeline);
test("the shared act keeps its continuous journey and enters before the final pause", () => {
  const phases = [
    "resolutionCopied",
    "resolutionDeparts",
    "resolutionShrinks",
    "resolutionEnters",
    "resolutionSharedPause",
  ];
  expect(timeline.start(phases[0])).toBeGreaterThan(timeline.range("transmission")[0]);
  for (let i = 1; i < phases.length; i++) expect(timeline.start(phases[i])).toBe(timeline.end(phases[i - 1]));
  const pause = timeline.moment("resolutionSharedPause").map((p) => base.time(p));
  expect(pause[1] - pause[0]).toBeGreaterThan(1.8);
  expect(base.duration(timeline.order.indexOf("transmission"))).toBeCloseTo(11, 4);
  const keys = timeline.cameraKeys();
  expect(
    keys.filter((key) => key.step === "liste" || key.step === "pv").every((key) => key.aim === "mairieSquare"),
  ).toBe(true);
  expect(keys.filter((key) => key.step === "transmission").some((key) => key.cut)).toBe(false);
  expect(keys.filter((key) => key.step === "transmission").map((key) => key.aim)).toContain("sharedResolution");
  expect(base.time(timeline.end("resolutionDeparts")) - base.time(timeline.start("resolutionDeparts"))).toBeGreaterThan(
    4,
  );
  expect(timeline.start("sharingLinkReturns")).toBeGreaterThan(timeline.end("resolutionDeparts"));
  expect(timeline.end("resolutionFiled")).toBeLessThan(timeline.start("resolutionCopied"));
  for (const retired of ["resolutionSent", "receiptReturns"])
    expect(timeline.settings.moments[retired]).toBeUndefined();
});
