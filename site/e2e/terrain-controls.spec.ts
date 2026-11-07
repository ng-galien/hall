import { expect, test } from "@playwright/test";

test.use({ contextOptions: { reducedMotion: "reduce" } });

test("right drag pans, left drag rotates and tilts, and the wheel zooms without selecting a story", async ({
  page,
}) => {
  await page.goto("./demonstration/?view=3d");
  const stage = page.getByTestId("terrain-stage");
  const canvas = page.getByTestId("terrain-canvas");
  await expect(stage).toHaveAttribute("data-motion", "done");
  const pose = () =>
    stage.evaluate((node) => ({
      x: Number(node.dataset.targetWorldX),
      z: Number(node.dataset.targetWorldZ),
      azimuth: Number(node.dataset.azimuth),
      polar: Number(node.dataset.polar),
      distance: Number(node.dataset.distance),
    }));
  const freePoint = () =>
    canvas.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      for (const y of [0.35, 0.5, 0.65])
        for (const x of [0.2, 0.4, 0.6]) {
          const point = { x: rect.x + rect.width * x, y: rect.y + rect.height * y };
          if (document.elementFromPoint(point.x, point.y) === node) return point;
        }
      throw new Error("No clear map area available for the gesture");
    });
  const drag = async (button: "left" | "right") => {
    const point = await freePoint();
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button });
    await page.mouse.move(point.x + 60, point.y + 45, { steps: 8 });
    await page.mouse.up({ button });
  };
  const beforePan = await pose();
  await drag("right");
  await expect
    .poll(async () => Math.hypot((await pose()).x - beforePan.x, (await pose()).z - beforePan.z))
    .toBeGreaterThan(1);
  const afterPan = await pose();
  expect(afterPan.azimuth).toBeCloseTo(beforePan.azimuth, 3);
  expect(afterPan.polar).toBeCloseTo(beforePan.polar, 3);
  await drag("left");
  await expect.poll(async () => Math.abs((await pose()).azimuth - afterPan.azimuth)).toBeGreaterThan(0.01);
  const afterRotate = await pose();
  expect(Math.abs(afterRotate.polar - afterPan.polar)).toBeGreaterThan(0.01);
  expect(afterRotate.x).toBeCloseTo(afterPan.x, 2);
  expect(afterRotate.z).toBeCloseTo(afterPan.z, 2);
  const point = await freePoint();
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, -250);
  await expect.poll(async () => (await pose()).distance).toBeLessThan(afterRotate.distance);
  await expect(page.getByTestId("scenario-panel")).toBeHidden();
  await page.getByTestId("terrain-label-maison").click({ button: "right" });
  await expect(page.getByTestId("scenario-panel")).toBeHidden();
  await page.getByTestId("terrain-label-maison").click();
  await expect(page.getByTestId("scenario-convocation")).toBeVisible();
});
