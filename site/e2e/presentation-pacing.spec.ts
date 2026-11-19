import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { StorySettings } from "../src/story/settings";
import { TimeBase } from "../src/story/timebase";
import { Timeline } from "../src/story/timeline";

const settings = JSON.parse(
  readFileSync(new URL("../src/presentation/story-settings.json", import.meta.url), "utf8"),
) as StorySettings;
const timeline = new Timeline(Object.keys(settings.steps), settings);
const base = new TimeBase(timeline);
type Spot = { x: number; y: number };
type Motion = {
  car: { spot: Spot };
  mairieCar: { spot: Spot };
  person: { spot: Spot; visible: boolean };
  camera: Spot;
};
type Story = { seek(p: number): void; shown(): number; settings(): StorySettings };
type PageState = {
  __story?: Story;
  __presentation: {
    progress(): number;
    motion(): Motion;
    cards(): string[];
    framing(): Record<string, { left: number; right: number; top: number; bottom: number }>;
  };
};
const distance = (a: Spot, b: Spot) => Math.hypot(a.x - b.x, a.y - b.y);

test("the road edit skips the long journey and the mairie actions remain distinct", async ({ page }) => {
  const invalidGeometry: string[] = [];
  page.on("console", (message) => {
    if (/NaN|computeBoundingSphere/.test(message.text())) invalidGeometry.push(message.text());
  });
  test.setTimeout(90_000);
  await page.goto("./");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  // The published page plays the story from the scroll position: a progress is reached at the nearest pixel.
  const show = async (p: number) => {
    const reached = await page.evaluate((p) => {
      const state = window as unknown as PageState;
      if (state.__story) {
        state.__story.seek(p);
        return p;
      }
      const max =
        (document.querySelector(".p-scroll") as HTMLElement).offsetHeight - document.documentElement.clientHeight;
      const pixel = Math.round(p * max);
      window.scrollTo(0, pixel);
      return pixel / max;
    }, p);
    await page.waitForFunction(
      (p) => Math.abs((window as unknown as PageState).__presentation.progress() - p) < 0.000001,
      reached,
    );
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    return page.evaluate(() => (window as unknown as PageState).__presentation.motion());
  };
  const cut = timeline.start("carArrivesAtChemin");
  const before = await show(cut - 0.0002);
  const after = await show(cut + 0.0002);
  expect(distance(before.car.spot, after.car.spot)).toBeGreaterThan(1000);
  expect(distance(after.camera, after.car.spot)).toBeLessThan(80);
  for (const phase of ["carDepartsBureau", "carArrivesAtChemin", "carToMairie"]) {
    const [a, b] = timeline.moment(phase);
    const first = await show(a + 0.0002);
    const last = await show(b - 0.0002);
    const actor = phase === "carToMairie" ? "mairieCar" : "car";
    expect(distance(first[actor].spot, last[actor].spot), phase).toBeLessThan(90);
    expect(distance(first[actor].spot, last[actor].spot), phase).toBeGreaterThan(10);
  }
  const middle = async (name: string, f = 0.5) => {
    const [a, b] = timeline.moment(name).map((p) => base.time(p));
    return show(base.progress(a + (b - a) * f));
  };
  const parked = await middle("carParkedAtMairie");
  const out = await middle("secretaryGetsOut", 0.85);
  const walking = await middle("secretaryWalksToDoor");
  expect(parked.person.visible).toBe(false);
  expect(out.person.visible).toBe(true);
  expect(walking.person.visible).toBe(true);
  expect(distance(parked.mairieCar.spot, walking.mairieCar.spot)).toBeLessThan(0.01);
  expect(distance(out.person.spot, walking.person.spot)).toBeGreaterThan(8);
  await expect(page.locator(".p-assistant")).toBeVisible();
  await expect(page.locator(".p-assistant")).toHaveClass(/is-working/);
  const writing = await middle("assistantWrites");
  expect(writing.person.visible).toBe(true);
  await expect(page.locator(".p-assistant")).toHaveClass(/is-writing/);
  const overlap = await page.evaluate(() => {
    const actor = (window as unknown as PageState).__presentation.framing().person;
    const robot = document.querySelector(".p-assistant")?.getBoundingClientRect();
    if (!robot) throw new Error("Missing assistant");
    return actor.left < robot.right && actor.right > robot.left && actor.top < robot.bottom && actor.bottom > robot.top;
  });
  expect(overlap, "The assistant must leave the walking person visible").toBe(false);
  await show(timeline.at("projet", 0.2));
  await expect(page.locator(".p-assistant")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as PageState).__presentation.cards())).toContain("projet");
  await expect(page.locator(".p-assistant")).not.toHaveClass(/is-writing/);
  expect(invalidGeometry).toEqual([]);
});

test("moving a studio block changes the actual animation preview", async ({ page }) => {
  const invalidGeometry: string[] = [];
  page.on("console", (message) => {
    if (/NaN|computeBoundingSphere/.test(message.text())) invalidGeometry.push(message.text());
  });
  test.skip(test.info().project.name !== "bureau", "The studio edits the same settings for both frames");
  await page.goto("./studio/");
  test.skip(!(await page.getByTestId("studio-play").count()), "Studio is excluded from the public build");
  await expect(page.getByTestId("studio-step-assistant")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("studio-step-picker").selectOption("assistant");
  const preview = page.frames().find((frame) => frame !== page.mainFrame());
  if (!preview) throw new Error("Missing studio preview");
  await expect(page.getByTestId("studio-moment-carToMairie")).toBeVisible();
  await page.getByTestId("studio-moment-carToMairie").click();
  await preview.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  const before = await preview.evaluate(() => (window as unknown as PageState).__presentation.motion().mairieCar.spot);
  await page.keyboard.press("Shift+ArrowRight");
  await expect
    .poll(async () => {
      const now = await preview.evaluate(() => (window as unknown as PageState).__presentation.motion().mairieCar.spot);
      return distance(before, now);
    })
    .toBeGreaterThan(1);
  await page.getByTestId("studio-undo").click();
  await expect
    .poll(async () => {
      const now = await preview.evaluate(() => (window as unknown as PageState).__presentation.motion().mairieCar.spot);
      return distance(before, now);
    })
    .toBeLessThan(0.1);

  await page.getByTestId("studio-moment-secretaryGetsOut").click();
  await expect
    .poll(() => preview.evaluate(() => (window as unknown as PageState).__presentation.motion().person.visible))
    .toBe(true);
  await preview.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  await expect(page.getByTestId("studio-moment-start")).toBeDisabled();
  await expect(page.getByTestId("studio-moment-links")).toContainText("Voiture arrêtée sur le parking");
  await expect(page.getByTestId("studio-moment-end")).toHaveValue("9");
  const positionBeforeEdit = await preview.evaluate(
    () => (window as unknown as PageState).__presentation.motion().person.spot,
  );
  await page.getByTestId("studio-moment-end").fill("9.5");
  await page.getByTestId("studio-moment-apply").click();
  await expect(page.getByTestId("studio-moment-duration")).toContainText("2,30");
  const linkedStart = await preview.evaluate(
    () => (window as unknown as PageState).__story?.settings().moments.secretaryGetsOut.start,
  );
  expect(linkedStart).toBe("carParkedAtMairie.end");
  await expect
    .poll(async () => {
      const now = await preview.evaluate(() => (window as unknown as PageState).__presentation.motion().person.spot);
      return distance(positionBeforeEdit, now);
    })
    .toBeGreaterThan(0.5);
  await page.getByTestId("studio-undo").click();
  await expect(page.getByTestId("studio-moment-end")).toHaveValue("9");
  await expect
    .poll(async () => {
      const now = await preview.evaluate(() => (window as unknown as PageState).__presentation.motion().person.spot);
      return distance(positionBeforeEdit, now);
    })
    .toBeLessThan(0.1);

  expect(invalidGeometry).toEqual([]);
});
