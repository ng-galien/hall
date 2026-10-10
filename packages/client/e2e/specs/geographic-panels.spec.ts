import { expect, test } from "../fixtures/application";

// @verifies-requirement HALL-FR-DOC-490
test("Mesures and Dessin toggle their panel and a second press returns to the plain map", async ({
  appPage: page,
}) => {
  const created = await page.request.post("/api/resources", {
    data: { kind: "geographic", name: `Mode toggle ${crypto.randomUUID()}`, path: "seed" },
  });
  expect(created.ok()).toBeTruthy();
  const resource = (await created.json()).properties;
  await page.goto(`/app/workspace?path=seed&resource=${resource.id}`);
  const measureMode = page.getByTestId("geographic-mode-map");
  const drawMode = page.getByTestId("geographic-mode-draw");
  const measures = page.getByTestId("geographic-measures");
  const composition = page.getByTestId("geographic-composition");
  await expect(measures).toBeVisible();
  await expect(measureMode).toHaveAttribute("aria-pressed", "true");

  await measureMode.click();
  await expect(measures).toHaveCount(0);
  await expect(composition).toHaveCount(0);
  await expect(measureMode).toHaveAttribute("aria-pressed", "false");
  await expect(drawMode).toHaveAttribute("aria-pressed", "false");

  await measureMode.click();
  await expect(measures).toBeVisible();
  await expect(measureMode).toHaveAttribute("aria-pressed", "true");

  await drawMode.click();
  await expect(composition).toBeVisible();
  await expect(measures).toHaveCount(0);
  await expect(drawMode).toHaveAttribute("aria-pressed", "true");
  await expect(measureMode).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Escape");
  await expect(drawMode).toHaveAttribute("aria-pressed", "true");
  await expect(composition).toBeVisible();

  await drawMode.click();
  await expect(composition).toHaveCount(0);
  await expect(measures).toHaveCount(0);
  await expect(drawMode).toHaveAttribute("aria-pressed", "false");
  await expect(measureMode).toHaveAttribute("aria-pressed", "false");

  await drawMode.click();
  await expect(composition).toBeVisible();
  await measureMode.click();
  await expect(measures).toBeVisible();
  await expect(composition).toHaveCount(0);
  await expect(measureMode).toHaveAttribute("aria-pressed", "true");
  await expect(drawMode).toHaveAttribute("aria-pressed", "false");
});
