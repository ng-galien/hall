import { expect, test } from "../fixtures/application";

// @verifies-requirement HALL-FR-DOC-300
test("Escape cancels a drawing in progress before it closes the resource dialog", async ({ appPage: page }) => {
  const created = await page.request.post("/api/resources", {
    data: { kind: "geographic", name: `Escape drawing ${crypto.randomUUID()}`, path: "seed" },
  });
  expect(created.ok()).toBeTruthy();
  const resource = (await created.json()).properties;
  await page.goto(`/app/workspace?path=seed&resource=${resource.id}`);
  await expect(page.getByTestId("resource-workbench")).toBeVisible();
  await page.getByTestId("resource-open-extended").click();
  const dialog = page.getByTestId("resource-preview");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("geographic-mode-draw").click();
  const features = dialog.locator(
    '[data-testid="geographic-composition"] li[data-testid^="geographic-composition-feature-"]',
  );
  await expect(features).toHaveCount(0);

  await dialog.getByTestId("geographic-tool-area").click();
  const map = await dialog.locator(".geographic-map").boundingBox();
  if (!map) throw new Error("The map must be rendered");
  const point = (x: number, y: number) => ({ x: map.x + map.width * x, y: map.y + map.height * y });
  for (const [x, y] of [
    [0.55, 0.3],
    [0.8, 0.35],
    [0.7, 0.7],
  ] as const) {
    const target = point(x, y);
    await page.mouse.move(target.x, target.y, { steps: 4 });
    await page.mouse.click(target.x, target.y);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(features).toHaveCount(0);
  const saved = await page.request.get(`/api/resources/${resource.id}`);
  expect((await saved.json()).properties.document.hallLayer.features).toHaveLength(0);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
