import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import type { StorySettings } from "../src/story/settings";
import { TimeBase } from "../src/story/timebase";
import { Timeline } from "../src/story/timeline";

const settings = JSON.parse(
  readFileSync(new URL("../src/presentation/story-settings.json", import.meta.url), "utf8"),
) as StorySettings;
const timeline = new Timeline(Object.keys(settings.steps), settings);
const base = new TimeBase(timeline);
type State = {
  __presentation: {
    progress(): number;
    motion(): { camera: { x: number; y: number }; mairieCar: { spot: { x: number; y: number } } };
  };
};
const snapshot = (page: Page) =>
  page.evaluate(() => {
    const state = (window as unknown as State).__presentation;
    return { p: state.progress(), now: performance.now(), motion: state.motion() };
  });

test("real navigation keeps mairie playback time, camera and cards together", async ({ page }) => {
  test.setTimeout(120_000);
  const title = test.info().project.name === "telephone" ? "Assistant IA" : "Votre assistant IA, relié à vos dossiers";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  await page.getByTestId("story-start").click();
  await expect(page.getByTestId("step-panel-title")).toHaveText("Création de l'affaire");
  await page.getByTestId("gutter-place-2").click();
  await expect(page.getByTestId("step-panel-title")).toHaveText(title);
  const landed = await snapshot(page);
  expect(
    Math.hypot(
      landed.motion.camera.x - landed.motion.mairieCar.spot.x,
      landed.motion.camera.y - landed.motion.mairieCar.spot.y,
    ),
  ).toBeLessThan(80);
  const end = timeline.at("projet", timeline.rest("projet"));
  const started = await snapshot(page);
  await page.getByTestId("step-card-next").click();
  await page.waitForTimeout(4000);
  const during = await snapshot(page);
  expect(base.time(during.p) - base.time(started.p)).toBeCloseTo((during.now - started.now) / 1000, 0);
  await expect(page.getByTestId("step-panel-title")).toHaveText(title);
  expect(during.p).toBeLessThan(timeline.range("projet")[0]);
  await expect.poll(async () => Math.abs((await snapshot(page)).p - end), { timeout: 20_000 }).toBeLessThan(0.0001);
  await expect(page.getByTestId("step-panel-title")).toHaveText("Projet de délibération");
  const finished = await snapshot(page);
  expect((finished.now - started.now) / 1000).toBeGreaterThan(15);
  expect((finished.now - started.now) / 1000).toBeLessThan(19);

  // Previous uses the same clock backwards, with the existing destination unchanged.
  await page.getByTestId("step-card-previous").click();
  const assistantRest = timeline.at("assistant", timeline.rest("assistant"));
  await expect
    .poll(async () => Math.abs((await snapshot(page)).p - assistantRest), { timeout: 7000 })
    .toBeLessThan(0.0001);
  await expect(page.getByTestId("step-panel-title")).toHaveText(title);

  // Interrupt through a real location control, then continue from its landing.
  await page.getByTestId("step-card-next").click();
  await page.waitForTimeout(600);
  await page.getByTestId("gutter-place-1").click();
  await expect(page.getByTestId("gutter-sub-photo")).toHaveClass(/is-current/);
  await page.getByTestId("gutter-sub-cadastre").click();
  await expect(page.getByTestId("gutter-sub-cadastre")).toHaveClass(/is-current/);
  const resumed = await snapshot(page);
  await page.getByTestId("step-card-next").click();
  await page.waitForTimeout(3500);
  const replaying = await snapshot(page);
  expect(base.time(replaying.p) - base.time(resumed.p)).toBeCloseTo((replaying.now - resumed.now) / 1000, 0);
  await expect(page.getByTestId("step-panel-title")).toHaveText(title, { timeout: 10_000 });
  const mairie = await snapshot(page);
  expect(
    Math.hypot(
      mairie.motion.camera.x - mairie.motion.mairieCar.spot.x,
      mairie.motion.camera.y - mairie.motion.mairieCar.spot.y,
    ),
  ).toBeLessThan(80);
  expect(errors).toEqual([]);
});
