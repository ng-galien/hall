import { expect, test } from "@playwright/test";

type Box = { left: number; right: number; top: number; bottom: number; terrainOccluded: boolean };
type Inspection = {
  progress(): number;
  range(id: string): [number, number];
  framing(): Record<string, Box>;
};

test("moving cars and the councillor remain outside the narrative panels", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("./");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  const samples: [string, number, string][] = [
    ["creer", 0.62, "deputy"],
    ["rendezvous", 0.14, "car"],
    ["rendezvous", 0.35, "car"],
    ["rendezvous", 0.65, "car"],
    ["rendezvous", 0.94, "car"],
    ["photo", 0.4, "deputy"],
    ["assistant", 0.07, "mairieCar"],
    ["assistant", 0.12, "mairieCar"],
    ["assistant", 0.2, "mairieCar"],
    ["assistant", 0.55, "person"],
    ["assistant", 0.75, "person"],
    ["assistant", 0.95, "person"],
  ];
  for (const [step, fraction, actor] of samples) {
    const progress = await page.evaluate(
      ([step, fraction]) => {
        const inspection = (window as unknown as { __presentation: Inspection }).__presentation;
        const [a, b] = inspection.range(step as string);
        const p = a + (b - a) * (fraction as number);
        const max =
          (document.querySelector(".p-scroll") as HTMLElement).offsetHeight - document.documentElement.clientHeight;
        window.scrollTo(0, Math.round(p * max));
        return p;
      },
      [step, fraction],
    );
    await page.waitForFunction(
      (p) => Math.abs((window as unknown as { __presentation: Inspection }).__presentation.progress() - p) < 0.0001,
      progress,
    );
    const observation = await page.evaluate((actor) => {
      const box = (window as unknown as { __presentation: Inspection }).__presentation.framing()[actor];
      const selectors = [".p-masthead", ".p-board", ".p-watermark", ".p-phone"];
      const overlaps = selectors.filter((selector) => {
        const element = document.querySelector(selector) as HTMLElement;
        if (getComputedStyle(element).visibility === "hidden" || Number(getComputedStyle(element).opacity) < 0.1)
          return false;
        const rect = element.getBoundingClientRect();
        return box.left < rect.right && box.right > rect.left && box.top < rect.bottom && box.bottom > rect.top;
      });
      return { box, overlaps, width: innerWidth, height: innerHeight };
    }, actor);
    await page.screenshot({ path: testInfo.outputPath(`${step}-${fraction}.png`) });
    expect(observation.overlaps, `${step}/${fraction}: ${JSON.stringify(observation.box)}`).toEqual([]);
    expect(observation.box.terrainOccluded, `${step}/${fraction}: hidden by terrain`).toBe(false);
    expect(observation.box.left).toBeGreaterThan(0);
    expect(observation.box.right).toBeLessThan(observation.width);
    expect(observation.box.top).toBeGreaterThan(0);
    expect(observation.box.bottom).toBeLessThan(observation.height);
  }
});

test("at 768 pixels the place list, the step card and the fiche leave each other and the step subject free", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "bureau", "one tablet width is enough");
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("./");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  for (const [step, fraction, actor] of [
    ["assistant", 0.75, "person"],
    ["appel", 0.5, null],
  ] as const) {
    const progress = await page.evaluate(
      ([step, fraction]) => {
        const inspection = (window as unknown as { __presentation: Inspection }).__presentation;
        const [a, b] = inspection.range(step);
        const p = a + (b - a) * fraction;
        const max =
          (document.querySelector(".p-scroll") as HTMLElement).offsetHeight - document.documentElement.clientHeight;
        window.scrollTo(0, Math.round(p * max));
        return p;
      },
      [step, fraction] as const,
    );
    await page.waitForFunction(
      (p) => Math.abs((window as unknown as { __presentation: Inspection }).__presentation.progress() - p) < 0.0001,
      progress,
    );
    const observation = await page.evaluate((actor) => {
      const shown = [".p-gutter", ".p-watermark", ".p-board"].flatMap((selector) => {
        const element = document.querySelector(selector) as HTMLElement;
        const style = getComputedStyle(element);
        if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) < 0.1) return [];
        return [{ selector, rect: element.getBoundingClientRect() }];
      });
      const meets = (a: DOMRect | Box, b: DOMRect | Box) =>
        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const panels = shown.flatMap((a, i) =>
        shown.slice(i + 1).flatMap((b) => (meets(a.rect, b.rect) ? [`${a.selector} ${b.selector}`] : [])),
      );
      const box = actor ? (window as unknown as { __presentation: Inspection }).__presentation.framing()[actor] : null;
      const subject = box ? shown.flatMap((panel) => (meets(box, panel.rect) ? [panel.selector] : [])) : [];
      return { shown: shown.map((panel) => panel.selector), panels, subject };
    }, actor);
    await page.screenshot({ path: testInfo.outputPath(`768-${step}.png`) });
    expect(observation.shown, step).toEqual([".p-gutter", ".p-watermark", ".p-board"]);
    expect(observation.panels, step).toEqual([]);
    expect(observation.subject, step).toEqual([]);
  }
});
