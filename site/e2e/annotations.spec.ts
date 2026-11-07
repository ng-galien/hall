import { expect, test } from "@playwright/test";
import { scenes } from "../src/scenes";

test.use({ contextOptions: { reducedMotion: "reduce" } });

for (const { id: scene } of scenes) {
  test(`${scene}: narrative annotations remain legible beside the place labels`, async ({ page }, testInfo) => {
    await page.goto(`./demonstration/?view=3d#${scene}`);
    await expect(page.getByTestId("terrain-stage")).toHaveAttribute("data-ready", "true");
    await expect(page.getByTestId("terrain-stage")).toHaveAttribute("data-motion", "done");
    if (await page.getByTestId("terrain-mark").count())
      await expect(page.getByTestId("terrain-mark").last()).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const labels = [...document.querySelectorAll<HTMLElement>(".terrain-label, .terrain-mark")]
            .filter((node) => getComputedStyle(node).visibility === "visible")
            .map((node) => ({ text: node.textContent, rect: node.getBoundingClientRect() }));
          const overlaps: string[] = [];
          for (let i = 0; i < labels.length; i++) {
            for (let j = i + 1; j < labels.length; j++) {
              const a = labels[i];
              const b = labels[j];
              if (
                Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left) > 2 &&
                Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top) > 2
              )
                overlaps.push(`${a.text} / ${b.text}`);
            }
          }
          return overlaps;
        }),
      )
      .toEqual([]);
    if (scene === "actes") {
      await expect(page.getByTestId("terrain-mark")).toHaveText(["Le camp du proconsul"]);
      await expect(page.getByTestId("scenario-actes")).toContainText("La missive au proconsul");
    }
    expect((await page.locator(".terrain-mark").allTextContents()).join(" ")).not.toMatch(
      /425|120 sacs|procès-verbal|7 pour/,
    );
    const journeyState = JSON.parse(
      (await page.getByTestId("terrain-stage").getAttribute("data-journeys")) ?? "[]",
    ) as { progress: number; visible: boolean; x: number; y: number }[];
    expect(journeyState).toHaveLength(scenes.find((entry) => entry.id === scene)?.motion.journeys?.length ?? 0);
    const panel = await page.getByTestId("scenario-panel").boundingBox();
    const canvas = await page.getByTestId("terrain-stage").boundingBox();
    if (!panel || !canvas) throw new Error("Missing scenario frame");
    for (const traveller of journeyState) {
      expect(traveller.progress).toBe(1);
      expect(traveller.visible).toBe(true);
      const x = canvas.x + traveller.x;
      const y = canvas.y + traveller.y;
      expect(x > panel.x && x < panel.x + panel.width && y > panel.y && y < panel.y + panel.height).toBe(false);
    }
    const firstCapture = page.getByTestId(`scenario-${scene}`).locator(".capture img").first();
    if (await firstCapture.count())
      await expect
        .poll(() => firstCapture.evaluate((node) => (node as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath(`${scene}.png`) });
  });
}
