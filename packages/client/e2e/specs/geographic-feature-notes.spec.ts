import { readFileSync } from "node:fs";
import { expect, type Page, test } from "../fixtures/application";

const parcels = readFileSync(new URL("../fixtures/geographic-layer-cadastre.geojson", import.meta.url));

async function openMapDialog(page: Page, mapId: string) {
  await page.goto(`/app/workspace?path=seed&resource=${mapId}`);
  await expect(page.getByTestId("resource-workbench")).toBeVisible();
  await page.getByTestId("resource-open-extended").click();
  const dialog = page.getByTestId("resource-preview");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("geographic-layers-trigger").click();
  await expect(dialog.locator('li[data-testid^="geographic-overlay-"]')).toHaveAttribute(
    "data-overlay-status",
    "ready",
  );
  await dialog.getByTestId("geographic-layers-trigger").click();
  return dialog;
}

async function clickMapCentre(page: Page, dialog: ReturnType<Page["getByTestId"]>) {
  const map = await dialog.locator(".geographic-map").boundingBox();
  if (!map) throw new Error("The map must be rendered");
  await page.mouse.click(map.x + map.width / 2, map.y + map.height / 2);
}

// @verifies-requirement HALL-FR-DOC-270
// @verifies-requirement HALL-FR-DOC-380
// @verifies-requirement HALL-FR-DOC-390
// @verifies-requirement HALL-FR-DOC-400
test("a parcel clicked on the map opens its card, receives a note and shows it again after a reload", async ({
  appPage: page,
}) => {
  const created = await page.request.post("/api/resources", {
    data: { kind: "geographic", name: `Parcel notes ${crypto.randomUUID()}`, path: "seed" },
  });
  expect(created.ok()).toBeTruthy();
  const map = (await created.json()).properties;
  const imported = await page.request.post("/api/resources/geographic-layers/import", {
    multipart: {
      name: "Parcelles d'essai",
      path: "seed",
      geographicResourceId: map.id,
      file: { name: "parcelles.geojson", mimeType: "application/geo+json", buffer: parcels },
    },
  });
  expect(imported.status()).toBe(201);
  const framed = await page.request.put(`/api/resources/${map.id}/content`, {
    data: {
      kind: "geographic",
      expectedVersion: map.version,
      document: { ...map.document, view: { kind: "center", center: [4.5035, 47.501], zoom: 17 } },
    },
  });
  expect(framed.ok()).toBeTruthy();

  let dialog = await openMapDialog(page, map.id);
  await clickMapCentre(page, dialog);
  const card = dialog.getByTestId("geographic-feature-card");
  await expect(card).toBeVisible();
  await expect(card.getByTestId("geographic-feature-card-title")).toHaveText("Parcel A 2");
  await expect(card.getByTestId("geographic-feature-card-properties")).toContainText("999990000A0002");
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await clickMapCentre(page, dialog);
  await expect(card).toBeVisible();
  await card.getByTestId("geographic-feature-note-create").click();
  const writingArea = card.getByTestId("editor-writing-area");
  await expect(writingArea).toHaveAttribute("contenteditable", "true");
  await writingArea.click();
  await page.keyboard.type("Bail agricole jusqu’en 2030");
  await expect(writingArea).toBeFocused();
  await page.keyboard.press("Escape");

  const notes = async () => {
    const layer = (await imported.json()).properties;
    const listed = await page.request.get(`/api/resources/${layer.id}/feature-notes`);
    return (await listed.json()).properties.items as Array<{ noteId: string }>;
  };
  await expect.poll(async () => (await notes()).length).toBe(1);
  const [{ noteId }] = await notes();
  await expect
    .poll(async () => (await (await page.request.get(`/api/resources/${noteId}`)).json()).properties.content)
    .toContain("Bail agricole jusqu’en 2030");
  await expect(dialog).toBeVisible();
  await expect(card).toBeVisible();
  await expect(writingArea).toBeFocused();

  await page.reload();
  dialog = await openMapDialog(page, map.id);
  await clickMapCentre(page, dialog);
  await expect(dialog.getByTestId("geographic-feature-card")).toBeVisible();
  await expect(dialog.getByTestId("geographic-feature-card").getByTestId("editor-writing-area")).toContainText(
    "Bail agricole jusqu’en 2030",
  );

  await dialog.getByTestId("geographic-layers-trigger").click();
  await dialog.getByTestId("geographic-import-municipal-property").click();
  const municipalDialog = page.getByTestId("municipal-property-import-dialog");
  await municipalDialog.getByTestId("municipal-property-import-label").fill("Liste du secrétariat");
  await municipalDialog.getByTestId("municipal-property-import-list").fill("999990000A0002\nchemin rural");
  await municipalDialog.getByTestId("municipal-property-import-submit").click();
  await expect(municipalDialog.getByTestId("municipal-property-import-result")).toContainText("1");
  await municipalDialog.getByTestId("municipal-property-import-close").click();
  const layerId = (await imported.json()).properties.id as string;
  const filter = dialog.getByTestId(`geographic-overlay-municipal-only-${layerId}`);
  await expect(filter).toHaveAttribute("aria-pressed", "false");
  await dialog.getByTestId("geographic-layers-trigger").click();
  await expect(dialog.getByTestId("geographic-feature-card-municipal")).toContainText("Liste du secrétariat");
  await dialog.getByTestId("geographic-feature-card-municipal-only").click();
  await dialog.getByTestId("geographic-layers-trigger").click();
  await expect(filter).toHaveAttribute("aria-pressed", "true");
  await dialog.getByTestId("geographic-layers-trigger").click();

  await dialog.getByTestId("geographic-feature-card-close").click();
  await expect(dialog.getByTestId("geographic-feature-card")).toHaveCount(0);
});

// @verifies-requirement HALL-FR-DOC-430
test("a reader clicks a drawing and reads its card, measures and note without editing actions", async ({
  appPage: page,
}) => {
  const [longitude, latitude, size] = [4.50, 47.54, 0.004];
  const created = await page.request.post("/api/resources", {
    data: { kind: "geographic", name: `Read drawing ${crypto.randomUUID()}`, path: "seed" },
  });
  expect(created.ok()).toBeTruthy();
  const map = (await created.json()).properties as { id: string };
  const representation = await (await page.request.get(`/api/resources/${map.id}`)).json();
  const update = (representation.actions as Array<{ name: string; href: string; method: string }>).find(
    (action) => action.name === "resource.update-content",
  );
  if (!update) throw new Error("The administrator must be able to update the map");
  const drawingId = crypto.randomUUID();
  const centre = [longitude + size / 2, latitude + size / 2] as const;
  const saved = await page.request.fetch(update.href, {
    method: update.method,
    data: {
      kind: "geographic",
      expectedVersion: representation.properties.version,
      document: {
        ...representation.properties.document,
        view: { kind: "center", center: centre, zoom: 16 },
        hallLayer: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              id: drawingId,
              properties: {
                kind: "area",
                visible: true,
                label: "Verger communal",
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
            },
          ],
        },
      },
    },
  });
  expect(saved.ok()).toBeTruthy();
  const note = await page.request.post(`/api/resources/${map.id}/feature-notes`, { data: { elementId: drawingId } });
  expect(note.status()).toBe(201);
  const noteId = (await note.json()).properties.noteId as string;
  const written = await page.request.put(`/api/resources/${noteId}/content`, {
    data: { kind: "text", expectedVersion: 1, content: "Pommiers plantés en **2019**." },
  });
  expect(written.ok()).toBeTruthy();

  for (const id of [map.id, noteId]) {
    await page.route(`**/api/resources/${id}`, async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.actions = [];
      await route.fulfill({ response, contentType: "application/vnd.siren+json", body: JSON.stringify(body) });
    });
  }

  const readCard = async (mapSelector: string) => {
    const box = await page.locator(mapSelector).boundingBox();
    if (!box) throw new Error("The map must be rendered");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const card = page.getByTestId("geographic-drawn-element-card");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("geographic-drawn-element-card-title")).toHaveText("Verger communal");
    await expect(card.getByTestId("geographic-drawn-element-card-measures")).toBeVisible();
    await expect(card.getByTestId("geographic-drawn-element-card-note").locator("strong")).toHaveText("2019");
    await expect(card.locator('[contenteditable="true"]')).toHaveCount(0);
    await expect(card.getByTestId("geographic-drawn-element-card-modify")).toHaveCount(0);
    await expect(card.getByTestId("geographic-drawn-element-note-create")).toHaveCount(0);
    await card.getByTestId("geographic-drawn-element-card-close").click();
    await expect(card).toBeHidden();
  };

  await page.goto(`/app/workspace?path=seed&resource=${map.id}`);
  await expect(page.getByTestId("geographic-mode-draw")).toBeDisabled();
  await readCard(".workspace-bench .geographic-map");
  await page.goto(`/app/maps/${map.id}?view=${centre[0]},${centre[1]},16`);
  await expect(page.getByTestId("geographic-mode-draw")).toBeDisabled();
  await readCard(".maps-surface .geographic-map");
});
