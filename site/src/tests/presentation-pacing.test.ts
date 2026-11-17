import { expect, test } from "vitest";
import settings from "../presentation/story-settings.json";
import type { StorySettings } from "../story/settings";
import { TimeBase } from "../story/timebase";
import { Timeline } from "../story/timeline";

const timeline = new Timeline(Object.keys(settings.steps), settings as StorySettings);
const base = new TimeBase(timeline);
const seconds = (name: string) => timeline.moment(name).map((p) => base.time(p));
const duration = (name: string) => {
  const [start, end] = seconds(name);
  return end - start;
};

test("the journey shows two short shots instead of rushing through kilometres of road", () => {
  expect(duration("carDepartsBureau")).toBeCloseTo(2.5, 2);
  expect(timeline.end("appointmentFiled")).toBeLessThan(timeline.start("carDepartsBureau"));
  expect(duration("carArrivesAtChemin")).toBeCloseTo(2.5, 2);
  expect(timeline.end("carDepartsBureau")).toBe(timeline.start("carArrivesAtChemin"));
  expect(
    timeline.param("carArrivesAtChemin", "routeStart") - timeline.param("carDepartsBureau", "routeEnd"),
  ).toBeGreaterThan(0.95);
  expect(timeline.cameraKeys().some((key) => key.cut && key.p === timeline.start("carArrivesAtChemin"))).toBe(true);
  expect(duration("carParkedAtChemin")).toBeGreaterThan(0.6);
  expect(duration("deputyGetsOut")).toBeGreaterThan(1.1);
});

test("parking, getting out and walking have separate readable playback time", () => {
  const mairieCut = timeline.cameraKeys().find((key) => key.cut && key.step === "assistant");
  expect(mairieCut?.p).toBe(timeline.range("assistant")[0]);
  expect(timeline.at("assistant", timeline.landing("assistant"))).toBeGreaterThan(mairieCut?.p ?? 1);
  const sequence = ["carToMairie", "carParkedAtMairie", "secretaryGetsOut", "secretaryWalksToDoor"];
  for (let i = 1; i < sequence.length; i++) expect(timeline.start(sequence[i])).toBe(timeline.end(sequence[i - 1]));
  expect(duration("carToMairie")).toBeCloseTo(3, 2);
  expect(duration("carParkedAtMairie")).toBeGreaterThan(1.1);
  expect(duration("secretaryGetsOut")).toBeGreaterThan(1.7);
  expect(duration("secretaryWalksToDoor")).toBeGreaterThan(4.9);
  expect(timeline.start("secretaryInMairie")).toBeGreaterThan(timeline.end("secretaryWalksToDoor"));
  expect(timeline.start("assistantAppears")).toBe(timeline.start("secretaryWalksToDoor"));
  expect(timeline.start("assistantReadsFolders")).toBeLessThan(timeline.end("secretaryWalksToDoor"));
  expect(timeline.end("assistantWrites")).toBeCloseTo(timeline.start("secretaryInMairie"), 5);
  expect(timeline.end("assistantWrites")).toBeLessThan(timeline.start("draftResolutionFiled"));
  expect(timeline.start("assistantLeaves")).toBeGreaterThan(timeline.start("draftResolutionFiled"));
  expect(base.duration(timeline.order.indexOf("assistant"))).toBeCloseTo(15.5, 3);
  expect(timeline.at("assistant", timeline.landing("assistant"))).toBeLessThanOrEqual(timeline.start("carToMairie"));
});
