import { expect, test } from "@playwright/test";

const destinations = {
  tour: "veille",
  cornu: "carte",
  plaine: "ouvrages",
  rempart: "defense",
  maison: "convocation",
  place: "actes",
  belvedere: "motion",
} as const;

test("the siege landmarks render and retain the existing scenario interactions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./demonstration/");
  const stage = page.getByTestId("terrain-stage");
  await expect(stage).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  const models = JSON.parse((await stage.getAttribute("data-landmarks")) ?? "{}") as Record<
    string,
    { meshes: number; triangles: number }
  >;
  expect(Object.keys(models).sort()).toEqual(Object.keys(destinations).sort());
  expect(models.plaine.triangles).toBeGreaterThan(1000);
  expect(Object.values(models).reduce((sum, model) => sum + model.meshes, 0)).toBeLessThan(50);
  // Since the battle map, a place shows its label only while its scenario is open; the scenarios open from the menu.
  for (const [place, scenario] of Object.entries(destinations)) {
    await page.goto(`./demonstration/#${scenario}`);
    await expect(page.getByTestId(`scenario-${scenario}`)).toBeVisible();
    await expect(stage).toHaveAttribute("data-motion", "done", { timeout: 30_000 });
    const label = page.getByTestId(`terrain-label-${place}`);
    await expect(label).toBeVisible();
    await expect(label).toHaveClass(/is-active/);
    for (const other of Object.keys(destinations).filter((entry) => entry !== place))
      await expect(page.getByTestId(`terrain-label-${other}`)).toBeHidden();
  }
  // A landmark pressed on the relief opens its scenario: the pointer finds one where the stage marks it as pointing.
  await page.getByTestId("scenario-close").click();
  await expect(page.getByTestId("scenario-panel")).toBeHidden();
  await expect(stage).toHaveAttribute("data-motion", "done", { timeout: 30_000 });
  const box = await stage.boundingBox();
  if (!box) throw new Error("Missing terrain");
  let landmark: { x: number; y: number } | null = null;
  for (let y = box.y + 100; y < box.y + box.height - 40 && !landmark; y += 24)
    for (let x = box.x + 40; x < box.x + box.width - 40 && !landmark; x += 24) {
      await page.mouse.move(x, y);
      if (await stage.evaluate((node) => node.classList.contains("is-pointing"))) landmark = { x, y };
    }
  if (!landmark) throw new Error("No landmark under the pointer");
  await page.mouse.click(landmark.x, landmark.y);
  await expect(page.getByTestId("scenario-panel")).toBeVisible();
  await expect(page.locator('[data-testid^="terrain-label-"].is-active')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("the opening presents the two figures and preserves both story entries", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./demonstration/#ouverture");
  const opening = page.getByTestId("scenario-ouverture");
  await expect(opening).toBeVisible();
  await expect(opening.locator(".opening-figure")).toHaveCount(2);
  for (const image of await opening.locator(".opening-figure img").all()) {
    await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await expect(opening.getByTestId("entry-preparer")).toContainText("Le piège");
  await expect(opening.getByTestId("entry-sieger")).toContainText("Le siège");
  await opening.getByTestId("entry-preparer").click();
  await expect(page.getByTestId("scenario-veille")).toBeVisible();
  await page.getByTestId("menu-item-ouverture").click();
  await page.getByTestId("entry-sieger").click();
  await expect(page.getByTestId("scenario-convocation")).toBeVisible();
});
