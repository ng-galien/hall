import { expect, test } from "../fixtures/application";

// @verifies-requirement HALL-FR-DOC-490
test("Elements opens by default, and each panel returns to the plain map on a second press", async ({
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
  await expect(composition).toBeVisible();
  await expect(drawMode).toHaveAttribute("aria-pressed", "true");
  const switchBox = await page.locator(".geographic-mode-switch").boundingBox();
  expect(switchBox!.height).toBeLessThanOrEqual(33);
  for (const control of [
    measureMode,
    drawMode,
    page.getByTestId("geographic-layers-trigger"),
    page.getByTestId("geographic-zoom-in"),
    page.getByTestId("geographic-zoom-out"),
    page.getByTestId("geographic-fit-drawings"),
  ]) {
    const box = await control.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(32);
    expect(box!.width).toBeGreaterThanOrEqual(32);
  }

  await drawMode.click();
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

// @verifies-requirement HALL-FR-DOC-490
test("Elements is selected again for a different map and each modal opening", async ({ appPage: page }) => {
  const createMap = async () => {
    const created = await page.request.post("/api/resources", {
      data: { kind: "geographic", name: `Opening mode ${crypto.randomUUID()}`, path: "seed" },
    });
    expect(created.ok()).toBeTruthy();
    return (await created.json()).properties.id as string;
  };
  const first = await createMap();
  const second = await createMap();
  await page.goto(`/app/workspace?path=seed&resource=${first}`);
  await expect(page.getByTestId("geographic-mode-draw")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("geographic-mode-map").click();
  await page.getByTestId("resource-open-extended").click();
  let dialog = page.getByTestId("resource-preview");
  await expect(dialog.getByTestId("geographic-mode-draw")).toHaveAttribute("aria-pressed", "true");
  await dialog.getByTestId("geographic-mode-map").click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByTestId("resource-open-extended").click();
  dialog = page.getByTestId("resource-preview");
  await expect(dialog.getByTestId("geographic-mode-draw")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await page.goto(`/app/workspace?path=seed&resource=${second}`);
  await expect(page.getByTestId("geographic-mode-draw")).toHaveAttribute("aria-pressed", "true");
});

type SirenAction = { name: string; href: string; method: string };

function squares(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const [longitude, latitude, size] = [4.5 + (index % 8) * 0.01, 47.5 + Math.floor(index / 8) * 0.01, 0.004];
    return {
      type: "Feature",
      id: crypto.randomUUID(),
      properties: {
        kind: "area",
        visible: true,
        label: `Zone ${index + 1}`,
        style: { fillColor: "#2255aa", strokeColor: "#2255aa", strokeWidth: 2, fillOpacity: 0.2 },
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [longitude, latitude],
            [longitude + size, latitude],
            [longitude + size, latitude + size],
            [longitude, latitude + size],
            [longitude, latitude],
          ],
        ],
      },
    };
  });
}

// @verifies-requirement HALL-FR-DOC-490
test("the Composition and Mesures panels take their content height inside the map and the list scrolls beyond it", async ({
  appPage: page,
}) => {
  const composition = page.getByTestId("geographic-composition");
  const list = composition.locator(".geographic-composition-list");
  const rows = composition.locator('li[data-testid^="geographic-composition-feature-"]');
  for (const count of [0, 3, 40]) {
    const created = await page.request.post("/api/resources", {
      data: { kind: "geographic", name: `Panel height ${count} ${crypto.randomUUID()}`, path: "seed" },
    });
    expect(created.ok()).toBeTruthy();
    const resource = (await created.json()).properties;
    if (count > 0) {
      const representation = await (await page.request.get(`/api/resources/${resource.id}`)).json();
      const update = (representation.actions as SirenAction[]).find(({ name }) => name === "resource.update-content");
      if (!update) throw new Error("The administrator must be able to update the map");
      const updated = await page.request.fetch(update.href, {
        method: update.method,
        data: {
          kind: "geographic",
          expectedVersion: representation.properties.version,
          document: {
            ...representation.properties.document,
            hallLayer: { type: "FeatureCollection", features: squares(count) },
          },
        },
      });
      expect(updated.ok()).toBeTruthy();
    }
    await page.goto(`/app/workspace?path=seed&resource=${resource.id}`);
    const map = page.getByTestId("geographic-resource-map");
    const measures = page.getByTestId("geographic-measures");
    await expect(composition).toBeVisible();
    const mapBox = await map.boundingBox();
    await page.getByTestId("geographic-mode-map").click();
    const measuresBox = await measures.boundingBox();
    if (!mapBox || !measuresBox) throw new Error("The map and its Mesures panel must be rendered");
    expect(measuresBox.y + measuresBox.height).toBeLessThanOrEqual(mapBox.y + mapBox.height);

    await page.getByTestId("geographic-mode-draw").click();
    await expect(composition).toBeVisible();
    await expect(rows).toHaveCount(count);
    const panelBox = await composition.boundingBox();
    if (!panelBox) throw new Error("The Composition panel must be rendered");
    expect(panelBox.y).toBeGreaterThanOrEqual(mapBox.y);
    expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(mapBox.y + mapBox.height);
    const scroll = await list.evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }));
    if (count === 40) {
      expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
      await rows.last().scrollIntoViewIfNeeded();
      await expect(rows.last()).toBeInViewport();
    } else {
      expect(scroll.scrollHeight).toBeLessThanOrEqual(scroll.clientHeight + 1);
    }
  }

  const before = await composition.boundingBox();
  if (!before) throw new Error("The Composition panel must be rendered");
  await page.mouse.move(before.x + before.width - 3, before.y + before.height - 3);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width - 3, before.y + before.height - 103, { steps: 5 });
  await page.mouse.up();
  const resized = await composition.boundingBox();
  expect(resized!.height).toBeLessThan(before.height - 50);
  await page.getByTestId("geographic-mode-draw").click();
  await expect(composition).toHaveCount(0);
  await page.getByTestId("geographic-mode-draw").click();
  await expect(composition).toBeVisible();
  expect(Math.round((await composition.boundingBox())!.height)).toBe(Math.round(resized!.height));
  await page.reload();
  await expect(composition).toBeVisible();
  expect(Math.round((await composition.boundingBox())!.height)).toBe(Math.round(resized!.height));

  // Mesures reopens the same window: same place and same size as the Éléments the user resized.
  const elementsBox = (await composition.boundingBox())!;
  await page.getByTestId("geographic-mode-map").click();
  const measures = page.getByTestId("geographic-measures");
  await expect(measures).toBeVisible();
  const measuresBox = (await measures.boundingBox())!;
  expect(Math.round(measuresBox.x)).toBe(Math.round(elementsBox.x));
  expect(Math.round(measuresBox.y)).toBe(Math.round(elementsBox.y));
  expect(Math.round(measuresBox.width)).toBe(Math.round(elementsBox.width));
  expect(Math.round(measuresBox.height)).toBe(Math.round(elementsBox.height));
});
