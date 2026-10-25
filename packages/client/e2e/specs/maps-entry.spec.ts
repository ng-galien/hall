import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "../fixtures/application";

interface SirenAction {
  name: string;
  href: string;
  method: string;
}

function area(longitude: number, latitude: number, size: number) {
  return {
    type: "Feature",
    id: crypto.randomUUID(),
    properties: {
      kind: "area",
      visible: true,
      label: "Zone",
      style: { fillColor: "#2255aa", strokeColor: "#2255aa", strokeWidth: 2, fillOpacity: 0.2 },
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [longitude, latitude],
          [longitude + size, latitude],
          [longitude + size, latitude + size],
          [longitude, latitude],
        ],
      ],
    },
  };
}

async function createMap(
  request: APIRequestContext,
  input: { name: string; path: string; councilBusinessId?: string; features?: ReturnType<typeof area>[] },
) {
  const created = await request.post("/api/resources", {
    data: {
      kind: "geographic",
      name: input.name,
      path: input.path,
      ...(input.councilBusinessId ? { councilBusinessId: input.councilBusinessId } : {}),
    },
  });
  expect(created.ok()).toBeTruthy();
  const resource = (await created.json()).properties;
  if (!input.features?.length) return resource as { id: string; version: number };
  const representation = await (await request.get(`/api/resources/${resource.id}`)).json();
  const update = (representation.actions as SirenAction[]).find((action) => action.name === "resource.update-content");
  if (!update) throw new Error("The administrator must be able to update the map");
  const updated = await request.fetch(update.href, {
    method: update.method,
    data: {
      kind: "geographic",
      expectedVersion: representation.properties.version,
      document: {
        ...representation.properties.document,
        hallLayer: { type: "FeatureCollection", features: input.features },
      },
    },
  });
  expect(updated.ok()).toBeTruthy();
  return (await updated.json()).properties as { id: string; version: number };
}

async function mapVersion(request: APIRequestContext, id: string): Promise<number> {
  return (await (await request.get(`/api/resources/${id}`)).json()).properties.version;
}

// @verifies-requirement HALL-FR-WSP-310
// @verifies-requirement HALL-FR-WSP-320
// @verifies-requirement HALL-FR-WSP-330
// @verifies-requirement HALL-FR-WSP-340
// @verifies-requirement HALL-FR-WSP-350
test("Cartes lists the maps, opens a deep link, switches maps and links back to the workspace", async ({
  appPage: page,
}) => {
  const root = `Cartes ${Date.now()}`;
  const businessResponse = await page.request.post("/api/council-business", {
    data: { path: root, name: "Voirie communale", reportName: "Rapport", reportContent: "" },
  });
  expect(businessResponse.status()).toBe(201);
  const business = (await businessResponse.json()).properties;
  const roads = await createMap(page.request, {
    name: "Routes",
    path: `${root}/Voirie`,
    councilBusinessId: business.id,
    features: [area(4.44, 47.56, 0.004)],
  });
  const bridges = await createMap(page.request, {
    name: "Ponts",
    path: `${root}/Voirie`,
    features: [area(4.446, 47.564, 0.002)],
  });
  const distant = await createMap(page.request, { name: "Lointaine", path: root, features: [area(2.3, 48.8, 0.01)] });
  for (const [name, path] of [
    ["Cimetière", `${root}/Population`],
    ["Réservoirs", `${root}/Équipements`],
    ["Tourisme", `${root}/Tourisme/Sentiers`],
  ]) {
    await createMap(page.request, { name, path });
  }

  await page.goto("/app/");
  await page.getByTestId("navigation-maps").click();
  await expect(page).toHaveURL(/\/app\/maps\?view=/);
  const scenarioBranch = page.getByTestId("maps-tree").getByTestId(`maps-tree-folder-${encodeURIComponent(root)}`);
  await expect(scenarioBranch.getByTestId("maps-tree-map")).toHaveCount(6);
  await expect(page.getByTestId("maps-context-empty")).toBeVisible();

  await page.goto(`/app/maps/${roads.id}?view=4.442,47.562,15`);
  await expect(page.getByTestId("maps-context-title")).toHaveText("Routes");
  await expect(page).toHaveURL(new RegExp(`/maps/${roads.id}\\?view=4\\.442000,47\\.562000,15$`));
  await expect(page.getByTestId("geographic-resource-map")).toBeVisible();
  await expect(page.getByTestId("geographic-mode-draw")).toBeEnabled();
  await expect(page.getByTestId("geographic-save-view")).toBeVisible();
  await expect(page.getByTestId("maps-context-business")).toHaveAttribute("data-business-id", business.id);
  await expect(page.getByTestId("maps-recent").getByTestId("maps-entry")).toHaveCount(1);

  await page.getByTestId(`maps-tree-map-${bridges.id}-open`).click();
  await expect(page.getByTestId("maps-context-title")).toHaveText("Ponts");
  await expect(page).toHaveURL(new RegExp(`/maps/${bridges.id}\\?view=4\\.442000,47\\.562000,15$`));

  const map = await page.locator(".maps-surface .geographic-map").boundingBox();
  if (!map) throw new Error("The map must be rendered");
  await page.mouse.move(map.x + map.width / 2, map.y + map.height / 2);
  await page.mouse.down();
  await page.mouse.move(map.x + map.width / 2 - 60, map.y + map.height / 2 - 40, { steps: 5 });
  await page.mouse.up();
  await expect(page).not.toHaveURL(/view=4\.442000,47\.562000,15$/);
  expect(await mapVersion(page.request, bridges.id)).toBe(bridges.version);
  expect(await mapVersion(page.request, roads.id)).toBe(roads.version);

  await page.getByTestId(`maps-tree-map-${distant.id}-open`).click();
  await expect(page.getByTestId("maps-context-title")).toHaveText("Lointaine");
  await expect(page).toHaveURL(new RegExp(`/maps/${distant.id}\\?view=2\\.30`));

  await page.goBack();
  await expect(page.getByTestId("maps-context-title")).toHaveText("Ponts");
  await expect(page).toHaveURL(new RegExp(`/maps/${bridges.id}\\?view=`));

  await page
    .getByTestId("maps-context-folder")
    .and(page.locator(`[data-path="${root}/Voirie"]`))
    .click();
  await expect(page).toHaveURL(new RegExp(`/workspace\\?path=${encodeURIComponent(`${root}/Voirie`)}$`));

  await page.goto(`/app/workspace?path=${encodeURIComponent(`${root}/Voirie`)}&resource=${roads.id}`);
  const workbench = page.getByTestId("resource-workbench");
  await expect(workbench.getByTestId("geographic-resource-map")).toBeVisible();
  const saveView = workbench.getByTestId("geographic-save-view");
  await expect(saveView).toBeDisabled();
  const workspaceMap = await workbench.locator(".geographic-map").boundingBox();
  if (!workspaceMap) throw new Error("The workspace map must be rendered");
  await page.mouse.move(workspaceMap.x + workspaceMap.width / 2, workspaceMap.y + workspaceMap.height / 2);
  await page.mouse.down();
  await page.mouse.move(workspaceMap.x + workspaceMap.width / 2 + 80, workspaceMap.y + workspaceMap.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(saveView).toBeEnabled();
  await page.waitForTimeout(2_000);
  expect(await mapVersion(page.request, roads.id)).toBe(roads.version);
  await saveView.click();
  await expect.poll(() => mapVersion(page.request, roads.id)).toBe(roads.version + 1);
  await expect(saveView).toBeDisabled();

  await workbench.getByTestId("resource-open-in-maps").click();
  await expect(page).toHaveURL(new RegExp(`/maps/${roads.id}\\?view=`));
  await expect(page.getByTestId("maps-context-title")).toHaveText("Routes");
});

// @verifies-requirement HALL-FR-WSP-360
// @verifies-requirement HALL-FR-WSP-330
test("a writer draws from Cartes and sees the drawing on the workspace map; a reader keeps a read-only map", async ({
  appPage: page,
}) => {
  const root = `Cartes dessin ${Date.now()}`;
  const created = await createMap(page.request, { name: "Chantier", path: root });
  const initial = (await (await page.request.get(`/api/resources/${created.id}`)).json()).properties;

  await page.goto(`/app/maps/${created.id}?view=4.44,47.56,15`);
  await expect(page.getByTestId("maps-context-title")).toHaveText("Chantier");
  await expect(page.getByTestId("geographic-composition")).toBeVisible();
  await page.getByTestId("geographic-tool-marker").click();
  const map = await page.locator(".maps-surface .geographic-map").boundingBox();
  if (!map) throw new Error("The map must be rendered");
  await page.mouse.move(map.x + map.width * 0.75, map.y + map.height * 0.5, { steps: 3 });
  await page.mouse.click(map.x + map.width * 0.75, map.y + map.height * 0.5);
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/resources/${created.id}`)).json()).properties.document.hallLayer.features
          .length,
    )
    .toBe(1);
  const saved = (await (await page.request.get(`/api/resources/${created.id}`)).json()).properties;
  expect(saved.document.view).toEqual(initial.document.view);

  await page.goto(`/app/workspace?path=${encodeURIComponent(root)}&resource=${created.id}`);
  const workbench = page.getByTestId("resource-workbench");
  await expect(workbench.getByTestId("geographic-mode-draw")).toHaveAttribute("aria-pressed", "true");
  await expect(
    workbench.locator('[data-testid="geographic-composition"] li[data-testid^="geographic-composition-feature-"]'),
  ).toHaveCount(1);

  await page.route(`**/api/resources/${created.id}`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.actions = [];
    await route.fulfill({ response, contentType: "application/vnd.siren+json", body: JSON.stringify(body) });
  });
  await page.goto(`/app/maps/${created.id}`);
  await expect(page.getByTestId("maps-context-title")).toHaveText("Chantier");
  await expect(page.getByTestId("geographic-mode-draw")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("geographic-save-view")).toHaveCount(0);
  await expect(page.getByTestId("geographic-composition")).toBeVisible();
  await expect(page.getByTestId("geographic-tool-marker")).toHaveCount(0);
});
