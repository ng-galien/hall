import { readFileSync } from "node:fs";
import { expect, test } from "../fixtures/application";

const parcels = readFileSync(new URL("../fixtures/geographic-layer-parcels.geojson", import.meta.url));

// @verifies-requirement HALL-FR-DOC-320
// @verifies-requirement HALL-FR-DOC-330
// @verifies-requirement HALL-FR-DOC-340
test("a GeoJSON layer uploaded from the Couches menu is linked to the map and drawn on it", async ({
  appPage: page,
}) => {
  const created = await page.request.post("/api/resources", {
    data: { kind: "geographic", name: `Layer map ${crypto.randomUUID()}`, path: "seed" },
  });
  expect(created.ok()).toBeTruthy();
  const map = (await created.json()).properties;
  await page.goto(`/app/workspace?path=seed&resource=${map.id}`);
  await expect(page.getByTestId("resource-workbench")).toBeVisible();
  await page.getByTestId("resource-open-extended").click();
  const dialog = page.getByTestId("resource-preview");
  await expect(dialog).toBeVisible();

  await dialog.getByTestId("geographic-layers-trigger").click();
  await dialog.getByTestId("geographic-add-layer").click();
  const upload = page.getByTestId("geographic-layer-upload-dialog");
  await expect(upload).toBeVisible();

  await upload.getByTestId("geographic-layer-upload-file").setInputFiles({
    name: "lambert.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(
      JSON.stringify({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [700000, 6600000] } }],
      }),
    ),
  });
  await upload.getByTestId("geographic-layer-upload-submit").click();
  await expect(upload.getByTestId("geographic-layer-upload-issue")).toHaveCount(1);
  await expect(upload.getByTestId("geographic-layer-upload-issues")).toBeVisible();

  await upload.getByTestId("geographic-layer-upload-name").fill("");
  await upload.getByTestId("geographic-layer-upload-file").setInputFiles({
    name: "parcelles-essai.geojson",
    mimeType: "application/geo+json",
    buffer: parcels,
  });
  await expect(upload.getByTestId("geographic-layer-upload-name")).toHaveValue("parcelles-essai");
  await upload.getByTestId("geographic-layer-upload-submit").click();
  await expect(upload).toHaveCount(0);

  const overlay = dialog.locator('li[data-testid^="geographic-overlay-"]');
  await expect(overlay).toHaveCount(1);
  await expect(overlay).toHaveAttribute("data-overlay-status", "ready");
  await expect(overlay).toContainText("parcelles-essai");
  await expect(overlay).toContainText("4");

  const saved = (await (await page.request.get(`/api/resources/${map.id}`)).json()).properties;
  expect(saved.overlays).toEqual([
    expect.objectContaining({ name: "parcelles-essai", featureCount: 4, visible: true }),
  ]);
  const layerId = saved.overlays[0].layerId as string;

  await dialog.getByTestId(`geographic-overlay-visible-${layerId}`).click();
  await expect(dialog.getByTestId(`geographic-overlay-visible-${layerId}`)).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(
      async () => (await (await page.request.get(`/api/resources/${map.id}`)).json()).properties.overlays[0].visible,
    )
    .toBe(false);
});
