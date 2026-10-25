import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "../fixtures/application";

interface StoredFeature {
  id: string;
  properties: { kind: string; label: string | null; length?: number; area?: number; perimeter?: number };
  geometry: { type: string };
}

async function storedFeatures(request: APIRequestContext, mapId: string): Promise<StoredFeature[]> {
  const representation = await (await request.get(`/api/resources/${mapId}`)).json();
  return representation.properties.document.hallLayer.features;
}

// @verifies-requirement HALL-FR-DOC-410
test("the Coordonnées tab holds the positions and is reached with the keyboard", async ({ appPage: page }) => {
  const created = await page.request.post("/api/resources", {
    data: { kind: "geographic", name: `Coordinates ${crypto.randomUUID()}`, path: "seed" },
  });
  expect(created.ok()).toBeTruthy();
  const resource = (await created.json()).properties;
  await page.goto(`/app/workspace?path=seed&resource=${resource.id}`);
  await page.getByTestId("geographic-mode-map").click();
  const panel = page.getByTestId("geographic-measures");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("geographic-measures-panel-measures")).toBeVisible();
  await expect(page.getByTestId("geographic-measure-cursor")).toHaveCount(0);
  await expect(page.getByTestId("geographic-measure-center")).toHaveCount(0);
  const measuresWidth = (await panel.boundingBox())?.width;

  await page.getByTestId("geographic-measures-tab-measures").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("geographic-measures-tab-coordinates")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("geographic-measures-panel-coordinates")).toBeVisible();
  await expect(page.getByTestId("geographic-measure-center-wgs84")).toHaveText(/\d° [NS], .*\d° [EOW]/);
  await expect(page.getByTestId("geographic-measure-center-copy-projected")).toBeVisible();
  await expect(page.getByTestId("geographic-measure-tool-length")).toHaveCount(0);
  expect((await panel.boundingBox())?.width).toBe(measuresWidth);

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("geographic-measures-tab-measures")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("geographic-measure-tool-length")).toBeVisible();
});

// @verifies-requirement HALL-FR-DOC-460
test("measurements are saved under a name in the drawings GeoJSON, renamed, removed and rebuilt on reload", async ({
  appPage: page,
}) => {
  const created = await page.request.post("/api/resources", {
    data: { kind: "geographic", name: `Saved measurements ${crypto.randomUUID()}`, path: "seed" },
  });
  expect(created.ok()).toBeTruthy();
  const resource = (await created.json()).properties;
  await page.goto(`/app/workspace?path=seed&resource=${resource.id}`);
  await page.getByTestId("geographic-mode-map").click();
  await expect(page.getByTestId("geographic-measures")).toBeVisible();
  const box = await page.locator(".geographic-map").boundingBox();
  if (!box) throw new Error("The map must be rendered");
  const [freeLeft, freeRight] = [box.x + 270, box.x + box.width - 40];
  const visibleBottom = Math.min(box.y + box.height, page.viewportSize()?.height ?? box.y + box.height) - 8;
  /** Visible map area to the right of the Mesures panel. */
  const at = (x: number, y: number) =>
    [freeLeft + (freeRight - freeLeft) * x, box.y + (visibleBottom - box.y) * y] as const;
  const list = page.getByTestId("geographic-measurement-list");
  const rows = list.locator('li[data-testid^="geographic-measurement-"]');

  await page.getByTestId("geographic-measure-tool-length").click();
  await expect(page.getByTestId("geographic-measure-save")).toHaveCount(0);
  await page.mouse.click(...at(0.2, 0.3));
  await page.mouse.move(...at(0.6, 0.35), { steps: 4 });
  await page.mouse.dblclick(...at(0.6, 0.35));
  await expect(page.getByTestId("geographic-measure-current-length")).toHaveText(/^[\d\s,.]+ (m|km)$/);
  await page.getByTestId("geographic-measure-save").click();
  await expect(rows).toHaveCount(1);
  const lengthId = ((await rows.first().getAttribute("data-testid")) ?? "").replace("geographic-measurement-", "");
  const lengthName = page.getByTestId(`geographic-measurement-name-${lengthId}`);
  await expect(lengthName).toBeFocused();
  await lengthName.fill("Chemin du lavoir");
  await lengthName.press("Enter");
  await expect(page.getByTestId(`geographic-measurement-rename-${lengthId}`)).toHaveText("Chemin du lavoir");
  await expect(page.getByTestId("geographic-measure-current")).toHaveCount(0);

  await page.getByTestId("geographic-measure-tool-area").click();
  for (const [x, y] of [
    [0.2, 0.5],
    [0.6, 0.5],
  ] as const) {
    await page.mouse.move(...at(x, y), { steps: 3 });
    await page.mouse.click(...at(x, y));
  }
  await page.mouse.move(...at(0.4, 0.85), { steps: 3 });
  await page.mouse.dblclick(...at(0.4, 0.85));
  await expect(page.getByTestId("geographic-measure-current-area")).toHaveText(/(m²|ha)/);
  await page.getByTestId("geographic-measure-save").click();
  await expect(rows).toHaveCount(2);
  const areaId = ((await rows.nth(1).getAttribute("data-testid")) ?? "").replace("geographic-measurement-", "");
  await page.getByTestId(`geographic-measurement-name-${areaId}`).press("Enter");
  await expect(page.getByTestId(`geographic-measurement-value-${areaId}`)).toHaveText(/(m²|ha) · [\d\s,.]+ (m|km)$/);

  await expect
    .poll(async () => (await storedFeatures(page.request, resource.id)).map(({ id }) => id))
    .toEqual([lengthId, areaId]);
  const [length, area] = await storedFeatures(page.request, resource.id);
  expect(length?.properties).toMatchObject({ kind: "lengthMeasurement", label: "Chemin du lavoir" });
  expect(length?.properties.length).toBeGreaterThan(0);
  expect(length?.geometry.type).toBe("LineString");
  expect(area?.properties.kind).toBe("areaMeasurement");
  expect(area?.properties.label).toMatch(/\S+ 2$/);
  expect(area?.properties.area).toBeGreaterThan(0);
  expect(area?.properties.perimeter).toBeGreaterThan(0);
  expect(area?.geometry.type).toBe("Polygon");

  await page.getByTestId(`geographic-measurement-rename-${lengthId}`).click();
  await page.getByTestId(`geographic-measurement-name-${lengthId}`).fill("Chemin rural");
  await page.getByTestId(`geographic-measurement-name-${lengthId}`).press("Enter");
  await expect
    .poll(async () => (await storedFeatures(page.request, resource.id))[0]?.properties.label)
    .toBe("Chemin rural");

  await page.reload();
  await page.getByTestId("geographic-mode-map").click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId(`geographic-measurement-rename-${lengthId}`)).toHaveText("Chemin rural");
  await expect(rows.nth(1)).toHaveAttribute("data-measurement-kind", "areaMeasurement");

  await page.getByTestId(`geographic-measurement-remove-${areaId}`).click();
  await expect(rows).toHaveCount(1);
  await expect.poll(async () => (await storedFeatures(page.request, resource.id)).length).toBe(1);

  await page.getByTestId("geographic-mode-draw").click();
  await expect(
    page.locator('[data-testid="geographic-composition"] li[data-testid^="geographic-composition-feature-"]'),
  ).toHaveCount(0);
  await page.getByTestId("geographic-mode-map").click();
  await expect(rows).toHaveCount(1);
});

// @verifies-requirement HALL-FR-DOC-460
test("a reader sees the saved measurements in Cartes without saving, renaming or removing", async ({
  appPage: page,
}) => {
  const created = await page.request.post("/api/resources", {
    data: { kind: "geographic", name: `Read measurements ${crypto.randomUUID()}`, path: "seed" },
  });
  expect(created.ok()).toBeTruthy();
  const resource = (await created.json()).properties;
  const representation = await (await page.request.get(`/api/resources/${resource.id}`)).json();
  const update = (representation.actions as Array<{ name: string; href: string; method: string }>).find(
    (action) => action.name === "resource.update-content",
  );
  if (!update) throw new Error("The administrator must be able to update the map");
  const measurementId = crypto.randomUUID();
  const saved = await page.request.fetch(update.href, {
    method: update.method,
    data: {
      kind: "geographic",
      expectedVersion: representation.properties.version,
      document: {
        ...representation.properties.document,
        hallLayer: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              id: measurementId,
              properties: { kind: "lengthMeasurement", label: "Clôture du stade", length: 152.4 },
              geometry: {
                type: "LineString",
                coordinates: [
                  [4.5, 47.54],
                  [4.502, 47.54],
                ],
              },
            },
          ],
        },
      },
    },
  });
  expect(saved.ok()).toBeTruthy();

  await page.route(`**/api/resources/${resource.id}`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.actions = [];
    await route.fulfill({ response, contentType: "application/vnd.siren+json", body: JSON.stringify(body) });
  });
  await page.goto(`/app/maps/${resource.id}?view=4.501,47.54,16`);
  await expect(page.getByTestId("geographic-mode-draw")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("geographic-mode-map").click();
  await expect(page.getByTestId(`geographic-measurement-rename-${measurementId}`)).toHaveText("Clôture du stade");
  await expect(page.getByTestId(`geographic-measurement-rename-${measurementId}`)).toBeDisabled();
  await expect(page.getByTestId(`geographic-measurement-value-${measurementId}`)).toHaveText(/^152 m$/);
  await expect(page.getByTestId(`geographic-measurement-remove-${measurementId}`)).toHaveCount(0);

  const map = await page.locator(".maps-surface .geographic-map").boundingBox();
  if (!map) throw new Error("The map must be rendered");
  await page.getByTestId("geographic-measure-tool-length").click();
  await page.mouse.click(map.x + map.width * 0.5, map.y + 120);
  await page.mouse.move(map.x + map.width * 0.7, map.y + 160, { steps: 4 });
  await page.mouse.dblclick(map.x + map.width * 0.7, map.y + 160);
  await expect(page.getByTestId("geographic-measure-current-length")).toBeVisible();
  await expect(page.getByTestId("geographic-measure-save")).toHaveCount(0);
});

// @verifies-requirement HALL-FR-DOC-460
test("a measurement that does not fit the capacity of the map stays current with a message", async ({
  appPage: page,
}) => {
  const created = await page.request.post("/api/resources", {
    data: { kind: "geographic", name: `Full map ${crypto.randomUUID()}`, path: "seed" },
  });
  expect(created.ok()).toBeTruthy();
  const resource = (await created.json()).properties;
  const representation = await (await page.request.get(`/api/resources/${resource.id}`)).json();
  const update = (representation.actions as Array<{ name: string; href: string; method: string }>).find(
    (action) => action.name === "resource.update-content",
  );
  if (!update) throw new Error("The administrator must be able to update the map");
  const markers = Array.from({ length: 100 }, (_, index) => ({
    type: "Feature",
    id: crypto.randomUUID(),
    properties: {
      kind: "marker",
      visible: true,
      label: `Point ${index + 1}`,
      style: { color: "#24439b", size: "small" },
    },
    geometry: { type: "Point", coordinates: [4.5 + index / 100_000, 47.5] },
  }));
  const saved = await page.request.fetch(update.href, {
    method: update.method,
    data: {
      kind: "geographic",
      expectedVersion: representation.properties.version,
      document: { ...representation.properties.document, hallLayer: { type: "FeatureCollection", features: markers } },
    },
  });
  expect(saved.ok()).toBeTruthy();

  await page.goto(`/app/workspace?path=seed&resource=${resource.id}`);
  await page.getByTestId("geographic-mode-map").click();
  await expect(page.getByTestId("geographic-measures")).toBeVisible();
  const box = await page.locator(".geographic-map").boundingBox();
  if (!box) throw new Error("The map must be rendered");
  const at = (x: number, y: number) => [box.x + 270 + (box.width - 310) * x, box.y + 300 * y] as const;
  await page.getByTestId("geographic-measure-tool-length").click();
  await page.mouse.click(...at(0.2, 0.3));
  await page.mouse.move(...at(0.6, 0.35), { steps: 4 });
  await page.mouse.dblclick(...at(0.6, 0.35));
  await page.getByTestId("geographic-measure-save").click();
  await expect(page.getByTestId("geographic-measure-capacity")).toContainText("100");
  await expect(page.getByTestId("geographic-measure-capacity")).toContainText(/5\D?000/);
  await expect(page.getByTestId("geographic-measure-current-length")).toBeVisible();
  await expect(page.getByTestId("geographic-measurement-list")).toHaveCount(0);
  await page.waitForTimeout(2_000);
  expect(await storedFeatures(page.request, resource.id)).toHaveLength(100);
});
