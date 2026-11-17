import { afterEach, expect, test, vi } from "vitest";
import settings from "../presentation/story-settings.json";
import { Player } from "../story/playback";
import type { StorySettings } from "../story/settings";
import { TimeBase } from "../story/timebase";
import { Timeline } from "../story/timeline";

const timeline = new Timeline(Object.keys(settings.steps), settings as StorySettings);
const base = new TimeBase(timeline);
afterEach(() => vi.unstubAllGlobals());

test("page playback preserves the remaining time across steps, backwards and after interruption", () => {
  let now = 0;
  let id = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("performance", { now: () => now });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.set(++id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (frame: number) => callbacks.delete(frame));
  const advance = (seconds: number) => {
    now += seconds * 1000;
    const pending = [...callbacks.values()];
    callbacks.clear();
    for (const callback of pending) callback(now);
  };
  let shown = 0;
  const player = new Player(
    () => base,
    (p) => {
      shown = p;
    },
  );
  const start = base.time(timeline.at("assistant", timeline.landing("assistant")));
  const end = base.time(timeline.at("projet", timeline.rest("projet")));
  expect(end - start).toBeGreaterThan(15);
  const done = vi.fn();
  player.playTo(start, end, done);
  advance(4);
  expect(base.time(shown)).toBeCloseTo(start + 4);
  expect(player.playing).toBe(true);
  player.stop();
  advance(3);
  expect(base.time(shown)).toBeCloseTo(start + 4);
  player.playTo(base.time(shown), end);
  advance(4);
  expect(base.time(shown)).toBeCloseTo(start + 8);
  advance(end - start - 8);
  expect(base.time(shown)).toBeCloseTo(end);
  expect(player.playing).toBe(false);
  expect(done).toHaveBeenCalledOnce();
  player.playTo(end, start);
  advance(4);
  expect(base.time(shown)).toBeCloseTo(end - 4);
  player.speed = 2;
  advance(2);
  expect(base.time(shown)).toBeCloseTo(end - 8);
  advance(10);
  expect(base.time(shown)).toBeCloseTo(start);
  expect(player.playing).toBe(false);
});
