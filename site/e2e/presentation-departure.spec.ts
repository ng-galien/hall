import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { spots } from "../src/presentation/place";
import type { StorySettings } from "../src/story/settings";
import { TimeBase } from "../src/story/timebase";
import { Timeline } from "../src/story/timeline";

const settings = JSON.parse(
  readFileSync(new URL("../src/presentation/story-settings.json", import.meta.url), "utf8"),
) as StorySettings;
const base = new TimeBase(new Timeline(Object.keys(settings.steps), settings));
type Inspection = {
  __story?: { seek(p: number): void };
  __presentation: {
    progress(): number;
    cards(): string[];
    motion(): { car: { spot: { x: number; y: number }; heading: number } };
  };
};

test("the councillor drives straight out of the garage then follows the local bend", async ({ page }) => {
  // Since the continuous playback, a scrolled position plays the story up to it on its own clock.
  test.setTimeout(90_000);
  await page.goto("./");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  const [a, b] = base.timeline.moment("carDepartsBureau").map((p) => base.time(p));
  // Without the studio, a progress is reached by scrolling, at a whole pixel: the samples around a moment are taken
  // at the same number of pixels on each side, so that the bearing they give is centred on the moment.
  const pixels = await page.evaluate(() => {
    const state = window as unknown as Inspection;
    if (state.__story) return null;
    return (document.querySelector(".p-scroll") as HTMLElement).offsetHeight - document.documentElement.clientHeight;
  });
  const reachable = (p: number) => (pixels === null ? p : Math.round(p * pixels) / pixels);
  const show = async (progress: number) => {
    await page.evaluate(
      ([p, max]) => {
        const state = window as unknown as Inspection;
        if (state.__story) state.__story.seek(p);
        else window.scrollTo(0, Math.round(p * (max ?? 1)));
      },
      [progress, pixels] as const,
    );
    await page.waitForFunction(
      (p) => Math.abs((window as unknown as Inspection).__presentation.progress() - p) < 0.00001,
      progress,
    );
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    return page.evaluate(() => (window as unknown as Inspection).__presentation.motion().car);
  };
  const garageAngle = Math.atan2(4, 22);
  let straightSamples = 0;
  for (const fraction of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const time = a + (b - a) * fraction;
    const middle = reachable(base.progress(time));
    const step = reachable(base.progress(time + 0.03)) - middle;
    const before = await show(middle - step);
    const here = await show(middle);
    const after = await show(middle + step);
    const bearing = Math.atan2(after.spot.x - before.spot.x, -(after.spot.y - before.spot.y));
    const angle = Math.atan2(Math.sin(here.heading - bearing), Math.cos(here.heading - bearing));
    expect(Math.abs(angle)).toBeLessThan(0.06);
    const dx = (here.spot.x - spots.home.x) * 0.1;
    const dz = -(here.spot.y - spots.home.y) * 0.1;
    const localZ = (dx * Math.sin(garageAngle) + dz * Math.cos(garageAngle)) / 1.15;
    if (localZ < 2.25) {
      straightSamples++;
      const localX = (dx * Math.cos(garageAngle) - dz * Math.sin(garageAngle)) / 1.15;
      expect(localX).toBeCloseTo(-1.25, 4);
      expect(here.heading).toBeCloseTo(garageAngle, 3);
    }
    expect(await page.evaluate(() => (window as unknown as Inspection).__presentation.cards())).not.toContain(
      "rendezvous",
    );
  }
  expect(straightSamples).toBeGreaterThan(1);
});
