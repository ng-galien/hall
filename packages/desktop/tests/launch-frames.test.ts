import { expect, test } from "vitest";
import { createFrameProbe } from "../src/launch/frames";

/** @verifies-requirement HALL-TR-DSK-020 */
test("a uniformly slow thirty-Hz animation still counts misses against the explicit sixty-Hz budget", () => {
  const probe = createFrameProbe();
  for (let i = 0; i <= 6; i += 1) probe.record((i * 1000) / 30);
  expect(probe.statistics().dropped).toBe(6);
});

test("retains preparation delays and raw intervals rather than only a median and longest shortlist", () => {
  const probe = createFrameProbe();
  probe.record(0);
  probe.record(600);
  for (let i = 1; i <= 20; i += 1) probe.record(600 + (i * 1000) / 60);
  expect(probe.statistics().maxMs).toBe(600);
  expect(probe.statistics().p99Ms).toBe(600);
  expect(probe.samples()).toHaveLength(21);
  expect(probe.samples()[0]).toEqual({ atMs: 600, ms: 600 });
});
