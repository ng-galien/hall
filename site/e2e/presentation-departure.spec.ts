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
  const show = async (time: number) => {
    const progress = await page.evaluate((p) => {
      const state = window as unknown as Inspection;
      if (state.__story) {
        state.__story.seek(p);
        return p;
      }
      const max =
        (document.querySelector(".p-scroll") as HTMLElement).offsetHeight - document.documentElement.clientHeight;
      const pixel = Math.round(p * max);
      window.scrollTo(0, pixel);
      return pixel / max;
    }, base.progress(time));
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
    const before = await show(time - 0.03);
    const here = await show(time);
    const after = await show(time + 0.03);
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
