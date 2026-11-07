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
  for (const [place, scenario] of Object.entries(destinations)) {
    await page.getByTestId(`terrain-label-${place}`).click();
    await expect(page.getByTestId(`scenario-${scenario}`)).toBeVisible();
    await expect(stage).toHaveAttribute("data-motion", "done", { timeout: 30_000 });
    await expect(page.getByTestId(`terrain-label-${place}`)).toHaveClass(/is-active/);
    await page.getByTestId("scenario-close").click();
  }
  await stage.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await expect(stage).toHaveAttribute("data-motion", "done");
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  const label = page.getByTestId("terrain-label-maison");
  const box = await stage.boundingBox();
  if (!box) throw new Error("Missing terrain");
  await page.mouse.click(
    box.x + Number(await label.getAttribute("data-hit-x")),
    box.y + Number(await label.getAttribute("data-hit-y")),
  );
  await expect(page.getByTestId("scenario-convocation")).toBeVisible();
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
