import { expect, test } from "@playwright/test";

test("the missive travels towards the Roman camp while labels stay in place", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("./demonstration/?view=3d#actes");
  const stage = page.getByTestId("terrain-stage");
  const message = async () =>
    JSON.parse((await stage.getAttribute("data-journeys")) ?? "[]")[0] as
      | { kind: string; progress: number; x: number; y: number; visible: boolean }
      | undefined;
  await expect(stage).toHaveAttribute("data-ready", "true");
  await expect.poll(async () => (await message())?.progress ?? 0, { timeout: 15_000 }).toBeGreaterThan(0.2);
  const first = await message();
  expect(first?.kind).toBe("missive");
  expect(first?.visible).toBe(true);
  const labelPositions = () =>
    page.locator(".terrain-label").evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { x: box.x, y: box.y };
      }),
    );
  const labelsBefore = await labelPositions();
  await expect.poll(async () => (await message())?.progress ?? 0, { timeout: 15_000 }).toBeGreaterThan(0.55);
  const second = await message();
  if (!first || !second) throw new Error("Missing visible message");
  expect(Math.hypot(second.x - first.x, second.y - first.y)).toBeGreaterThan(12);
  // Software-rendered test cameras land immediately; the moving message must not displace labels.
  const labelsAfter = await labelPositions();
  for (let i = 0; i < labelsBefore.length; i++)
    expect(Math.hypot(labelsAfter[i].x - labelsBefore[i].x, labelsAfter[i].y - labelsBefore[i].y)).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath("missive-in-transit.png") });
  await expect(stage).toHaveAttribute("data-motion", "done", { timeout: 20_000 });
  expect((await message())?.progress).toBe(1);
  await page.screenshot({ path: testInfo.outputPath("missive-delivered.png") });
  await page.getByTestId("menu-group-preparer").click();
  await page.getByTestId("menu-item-carte").click();
  await expect.poll(async () => (await message())?.kind).toBe("grain");
  await expect(stage).toHaveAttribute("data-story-groups", "1");
  await expect(page.getByTestId("scenario-carte")).toBeVisible();
  await page.getByTestId("scenario-close").click();
  await expect(stage).toHaveAttribute("data-story-groups", "0");
  await expect.poll(async () => JSON.parse((await stage.getAttribute("data-journeys")) ?? "[]").length).toBe(0);
});
