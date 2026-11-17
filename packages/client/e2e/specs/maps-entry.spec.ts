import type { APIRequestContext, Page } from "@playwright/test";
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

/** The line of a map in the open list of maps. */
function mapLine(page: Page, id: string) {
  return page.getByTestId("maps-list").locator(`li[data-resource-id="${id}"]`);
}

/** Opens the list from the field on the map, reduces it with the query and clicks the line of the map. */
async function chooseMap(page: Page, query: string, id: string) {
  await page.getByTestId("maps-search").click();
  await page.getByTestId("maps-search").fill(query);
  await mapLine(page, id).getByTestId("maps-entry").click();
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
  // On arrival the list is closed; the field on the map opens it over the map.
  await expect(page.getByTestId("maps-finder")).toHaveAttribute("data-open", "false");
  await expect(page.getByTestId("maps-list")).toHaveCount(0);
  await expect(page.getByTestId("maps-context-empty")).toBeVisible();
  await page.getByTestId("maps-search").fill(root);
  await expect(page.getByTestId("maps-list").getByTestId("maps-entry")).toHaveCount(6);

  await page.goto(`/app/maps/${roads.id}?view=4.442,47.562,15`);
  await expect(page.getByTestId("screen-header-title")).toHaveText("Routes");
  await expect(page).toHaveURL(new RegExp(`/maps/${roads.id}\\?view=4\\.442000,47\\.562000,15$`));
  await expect(page.getByTestId("geographic-resource-map")).toBeVisible();
  await expect(page.getByTestId("geographic-mode-draw")).toBeEnabled();
  await expect(page.getByTestId("geographic-save-view")).toBeVisible();
  await expect(page.getByTestId("maps-context-business")).toHaveAttribute("data-business-id", business.id);

  await chooseMap(page, "ponts", bridges.id);
  await expect(page.getByTestId("screen-header-title")).toHaveText("Ponts");
  await expect(page).toHaveURL(new RegExp(`/maps/${bridges.id}\\?view=4\\.442000,47\\.562000,15$`));
  await expect(page.getByTestId("maps-list")).toHaveCount(0);
  await expect(page.getByTestId("maps-search")).toHaveValue("");

  const map = await page.locator(".maps-surface .geographic-map").boundingBox();
  if (!map) throw new Error("The map must be rendered");
  await page.mouse.move(map.x + map.width / 2, map.y + map.height / 2);
  await page.mouse.down();
  await page.mouse.move(map.x + map.width / 2 - 60, map.y + map.height / 2 - 40, { steps: 5 });
  await page.mouse.up();
  await expect(page).not.toHaveURL(/view=4\.442000,47\.562000,15$/);
  expect(await mapVersion(page.request, bridges.id)).toBe(bridges.version);
  expect(await mapVersion(page.request, roads.id)).toBe(roads.version);

  await chooseMap(page, "lointaine", distant.id);
  await expect(page.getByTestId("screen-header-title")).toHaveText("Lointaine");
  await expect(page).toHaveURL(new RegExp(`/maps/${distant.id}\\?view=2\\.30`));

  await chooseMap(page, "ponts", bridges.id);
  await expect(page.getByTestId("screen-header-title")).toHaveText("Ponts");
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

  await page.getByTestId("resource-open-in-maps").click();
  await expect(page).toHaveURL(new RegExp(`/maps/${roads.id}\\?view=`));
  await expect(page.getByTestId("screen-header-title")).toHaveText("Routes");
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
  await expect(page.getByTestId("screen-header-title")).toHaveText("Chantier");
  await expect(page.getByTestId("geographic-composition")).toHaveCount(0);
  await page.getByTestId("geographic-mode-draw").click();
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
  await expect(workbench.getByTestId("geographic-mode-draw")).toHaveAttribute("aria-pressed", "false");
  await workbench.getByTestId("geographic-mode-draw").click();
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
  await expect(page.getByTestId("screen-header-title")).toHaveText("Chantier");
  await expect(page.getByTestId("geographic-mode-draw")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("geographic-save-view")).toHaveCount(0);
  await page.getByTestId("geographic-mode-draw").click();
  await expect(page.getByTestId("geographic-composition")).toBeVisible();
  await expect(page.getByTestId("geographic-tool-marker")).toHaveCount(0);
});

/** Four maps under a new folder: two with a folder only, one with a business, one at the root of the folder. */
async function listedMaps(page: Page) {
  const root = `Liste ${Date.now()}`;
  const businessResponse = await page.request.post("/api/council-business", {
    data: { path: `${root}/Affaires`, name: "Restauration du lavoir", reportName: "Rapport", reportContent: "" },
  });
  expect(businessResponse.status()).toBe(201);
  const business = (await businessResponse.json()).properties as { id: string };
  const features = [area(4.44, 47.56, 0.004)];
  const zone = await createMap(page.request, { name: "Zone artisanale", path: root, features });
  const washhouse = await createMap(page.request, {
    name: "Lavoir",
    path: `${root}/Patrimoine`,
    councilBusinessId: business.id,
    features,
  });
  const lock = await createMap(page.request, { name: "Écluse", path: `${root}/Canal`, features });
  const troughs = await createMap(page.request, { name: "Abreuvoirs", path: `${root}/Population/Fontaines`, features });
  return { root, business, zone, washhouse, lock, troughs };
}

// @verifies-requirement HALL-FR-WSP-320
test("the list of maps opens over the map from the field, in alphabetical order, each map with its business or its folder", async ({
  appPage: page,
}) => {
  const { root, zone, washhouse, lock, troughs } = await listedMaps(page);
  await page.goto("/app/maps");
  await expect(page).toHaveURL(/\/app\/maps\?view=/);
  const finder = page.getByTestId("maps-finder");
  const search = page.getByTestId("maps-search");
  const list = page.getByTestId("maps-list");
  await expect(finder).toHaveAttribute("data-open", "false");
  await expect(list).toHaveCount(0);
  // The field stands on the map.
  await expect(page.getByTestId("maps-surface").getByTestId("maps-search")).toBeVisible();

  // The arrow opens the list; the folder path reduces it to the four maps, in alphabetical order.
  await search.focus();
  await page.keyboard.press("ArrowDown");
  await expect(finder).toHaveAttribute("data-open", "true");
  await expect(search).toHaveAttribute("aria-expanded", "true");
  await search.fill(root.toLowerCase());
  const lines = list.locator("li[data-resource-id]");
  await expect(lines).toHaveCount(4);
  expect(await lines.evaluateAll((items) => items.map((item) => item.getAttribute("data-resource-id")))).toEqual([
    troughs.id,
    lock.id,
    washhouse.id,
    zone.id,
  ]);
  await expect(mapLine(page, troughs.id).getByTestId("maps-entry")).toContainText("Abreuvoirs");
  // A map without business shows the path of its folder; a map with a business shows its business.
  const place = (id: string) => mapLine(page, id).locator(".maps-finder-place");
  await expect(place(troughs.id)).toHaveAttribute("data-place", "folder");
  await expect(place(troughs.id)).toHaveText(`${root} › Population › Fontaines`);
  await expect(place(lock.id)).toHaveText(`${root} › Canal`);
  await expect(place(zone.id)).toHaveText(root);
  await expect(place(washhouse.id)).toHaveAttribute("data-place", "business");
  await expect(place(washhouse.id)).toHaveText("Restauration du lavoir");
  await expect(place(washhouse.id)).not.toContainText(root);
  await page.screenshot({ path: test.info().outputPath("maps-list-open.png") });

  // Typing reduces the list by name, folder path or business, without accents or case.
  for (const [query, expected] of [
    ["ECLUSE", [lock.id]],
    ["fontaines", [troughs.id]],
    ["restauration", [washhouse.id]],
  ] as const) {
    await search.fill(query);
    await expect(lines).toHaveCount(expected.length);
    expect(await lines.evaluateAll((items) => items.map((item) => item.getAttribute("data-resource-id")))).toEqual([
      ...expected,
    ]);
  }
  await search.fill(`${root} sans carte`);
  await expect(page.getByTestId("maps-list-empty")).toBeVisible();
  await expect(lines).toHaveCount(0);

  // The arrows move the designated line, Enter opens it; the list closes, the field is emptied and keeps the focus.
  await search.fill(root);
  await expect(lines).toHaveCount(4);
  const designated = async () => {
    const active = await search.getAttribute("aria-activedescendant");
    return active
      ? page.locator(`[id="${active}"]`).evaluate((element) => element.closest("li")?.dataset.resourceId)
      : null;
  };
  await expect.poll(designated).toBe(troughs.id);
  await page.keyboard.press("ArrowDown");
  await expect.poll(designated).toBe(lock.id);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect.poll(designated).toBe(zone.id);
  await page.keyboard.press("ArrowUp");
  await expect.poll(designated).toBe(washhouse.id);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/maps/${washhouse.id}\\?view=`));
  await expect(page.getByTestId("screen-header-title")).toHaveText("Lavoir");
  await expect(list).toHaveCount(0);
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();

  // The opened map is marked in the list and designated when it opens.
  await search.click();
  await expect(list).toBeVisible();
  await expect(mapLine(page, washhouse.id).getByTestId("maps-entry")).toHaveAttribute("aria-current", "page");
  await expect(mapLine(page, lock.id).getByTestId("maps-entry")).not.toHaveAttribute("aria-current", "page");
  await expect.poll(designated).toBe(washhouse.id);

  // Escape, a click outside and the back command close the list without changing the map.
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(finder).toHaveAttribute("data-open", "false");
  await search.click();
  await expect(list).toBeVisible();
  await page.getByTestId("screen-header-title").click();
  await expect(list).toHaveCount(0);
  await search.click();
  await search.fill("ecluse");
  await expect(lines).toHaveCount(1);
  await page.goBack();
  await expect(list).toHaveCount(0);
  await expect(search).toHaveValue("");
  await expect(page).toHaveURL(new RegExp(`/maps/${washhouse.id}\\?view=`));
  await expect(page.getByTestId("screen-header-title")).toHaveText("Lavoir");
});

/** Rectangles of the field, the map commands and the open list, read in the page. */
async function finderLayout(page: Page) {
  return page.evaluate(() => {
    const box = (element: Element | null) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    };
    const input = document.querySelector<HTMLInputElement>("[data-testid=maps-search]")!;
    const style = getComputedStyle(input);
    const context = document.createElement("canvas").getContext("2d")!;
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const placeholderRoom =
      input.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
    const commands = [
      ...document.querySelectorAll(
        ".geographic-top-tools [data-testid=geographic-mode-draw], .geographic-top-tools [data-testid=geographic-mode-map], .geographic-top-tools [data-testid=geographic-layers-trigger]",
      ),
    ].map((element) => ({
      id: element.getAttribute("data-testid"),
      box: box(element)!,
      clipped: element.scrollWidth > element.clientWidth + 1,
    }));
    /** A colour as red, green, blue, painted on a canvas so that every CSS colour notation is read. */
    const rgb = (color: string) => {
      const paint = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
      paint.fillStyle = color;
      paint.fillRect(0, 0, 1, 1);
      return [...paint.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    };
    const luminance = (color: string) => {
      const [r, g, b] = rgb(color).map((channel) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const contrast = (foreground: string, background: string) => {
      const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (high! + 0.05) / (low! + 0.05);
    };
    const popup = document.querySelector("[data-testid=maps-list]");
    const entries = [...document.querySelectorAll("[data-testid=maps-list] li[data-resource-id]")];
    const popupBackground = popup ? getComputedStyle(popup).backgroundColor : null;
    return {
      viewport: window.innerWidth,
      stage: box(document.querySelector(".maps-surface")),
      tools: box(document.querySelector(".geographic-top-tools")),
      field: box(input),
      placeholderFits: context.measureText(input.placeholder).width <= placeholderRoom + 1,
      commands,
      list: box(popup),
      entries: entries.map((entry) => {
        const title = entry.querySelector(".list-row-title") ?? entry.querySelector("[data-testid=maps-entry]")!;
        const center = box(entry)!;
        const hit = document.elementFromPoint(
          (center.left + center.right) / 2,
          (center.top + Math.min(center.bottom, window.innerHeight)) / 2,
        );
        return {
          box: center,
          onTop: Boolean(hit && entry.contains(hit)),
          contrast: popupBackground ? contrast(getComputedStyle(title).color, popupBackground) : 0,
        };
      }),
    };
  });
}

function overlaps(a: { left: number; top: number; right: number; bottom: number }, b: typeof a) {
  return a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
}

// @verifies-requirement HALL-FR-WSP-320
test("the field, the map commands and the list of maps hold without overlap from 320 pixels to a wide screen, light and dark", async ({
  appPage: page,
}) => {
  test.setTimeout(120_000);
  const { root, washhouse } = await listedMaps(page);
  for (const viewport of [
    { width: 320, height: 700 },
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`/app/maps/${washhouse.id}`);
    await expect(page.getByTestId("geographic-resource-map")).toBeVisible();
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      const label = `${viewport.width} px, ${colorScheme}`;
      await page.getByTestId("maps-search").click();
      await page.getByTestId("maps-search").fill(root);
      await expect(page.getByTestId("maps-list").locator("li[data-resource-id]")).toHaveCount(4);
      await page.screenshot({ path: test.info().outputPath(`maps-list-${viewport.width}-${colorScheme}.png`) });
      const open = await finderLayout(page);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("maps-list")).toHaveCount(0);
      const closed = await finderLayout(page);

      const { field, stage, commands } = closed;
      if (!field || !stage) throw new Error(`${label}: the field and the map must be rendered`);
      expect(closed.placeholderFits, `${label}: « Rechercher une carte » is read whole`).toBe(true);
      expect(field.left, `${label}: field inside the map`).toBeGreaterThanOrEqual(stage.left - 0.5);
      expect(field.right, `${label}: field inside the map`).toBeLessThanOrEqual(stage.right + 0.5);
      expect(commands.map((command) => command.id)).toEqual([
        "geographic-mode-draw",
        "geographic-mode-map",
        "geographic-layers-trigger",
      ]);
      for (const command of commands) {
        expect(overlaps(command.box, field), `${label}: ${command.id} over the field`).toBe(false);
        expect(command.clipped, `${label}: ${command.id} clipped`).toBe(false);
        expect(command.box.left, `${label}: ${command.id} inside the map`).toBeGreaterThanOrEqual(stage.left - 0.5);
        expect(command.box.right, `${label}: ${command.id} inside the map`).toBeLessThanOrEqual(stage.right + 0.5);
      }
      for (const [index, command] of commands.entries())
        for (const other of commands.slice(index + 1))
          expect(overlaps(command.box, other.box), `${label}: ${command.id} over ${other.id}`).toBe(false);
      // In a map up to 760 pixels wide the field takes the first line and the commands the second.
      if (stage.right - stage.left <= 760)
        for (const command of commands)
          expect(command.box.top, `${label}: ${command.id} under the field`).toBeGreaterThanOrEqual(field.bottom - 0.5);

      const { list, entries } = open;
      if (!list) throw new Error(`${label}: the list must be rendered`);
      expect(list.left, `${label}: list inside the screen`).toBeGreaterThanOrEqual(-0.5);
      expect(list.right, `${label}: list inside the screen`).toBeLessThanOrEqual(open.viewport + 0.5);
      expect(list.top, `${label}: list under the field`).toBeGreaterThanOrEqual(open.field!.bottom - 0.5);
      expect(entries.length).toBe(4);
      for (const [index, entry] of entries.entries()) {
        expect(entry.onTop, `${label}: line ${index + 1} of the list over the map`).toBe(true);
        expect(entry.contrast, `${label}: contrast of the name of line ${index + 1}`).toBeGreaterThanOrEqual(4.5);
        if (index)
          expect(entry.box.top, `${label}: line ${index + 1} under the previous one`).toBeGreaterThanOrEqual(
            entries[index - 1]!.box.bottom - 0.5,
          );
      }
    }
  }
  await page.emulateMedia({ colorScheme: null });
});
