import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";

interface SirenAction {
  name: string;
  href: string;
  method: string;
}

function viewportCursor(page: Page, mapSelector: string) {
  return () => page.locator(`${mapSelector} .ol-viewport`).evaluate((element) => getComputedStyle(element).cursor);
}

async function savedRing(request: APIRequestContext, mapId: string): Promise<number[][]> {
  const representation = await (await request.get(`/api/resources/${mapId}`)).json();
  return representation.properties.document.hallLayer.features[0]?.geometry.coordinates[0] ?? [];
}

// @verifies-requirement HALL-FR-DOC-440
// @verifies-requirement HALL-FR-DOC-450
test("cursors follow the tool state and a click selects a drawing before its shape is modified", async ({
  appPage: page,
}) => {
  const created = await page.request.post("/api/resources", {
    data: { kind: "geographic", name: `Cursors ${crypto.randomUUID()}`, path: "seed" },
  });
  expect(created.ok()).toBeTruthy();
  const resource = (await created.json()).properties;
  await page.goto(`/app/workspace?path=seed&resource=${resource.id}`);
  const cursor = viewportCursor(page, ".geographic-map");
  const box = await page.locator(".geographic-map").boundingBox();
  if (!box) throw new Error("The map must be rendered");
  const [freeLeft, freeRight] = [box.x + 270, box.x + box.width - 390];
  const visibleBottom = Math.min(box.y + box.height, page.viewportSize()?.height ?? box.y + box.height) - 8;
  expect(freeRight - freeLeft).toBeGreaterThan(200);
  /** Visible map area between the left panels and the drawing card, which both stand over the map. */
  const at = (x: number, y: number) =>
    [freeLeft + (freeRight - freeLeft) * x, box.y + (visibleBottom - box.y) * y] as const;

  await page.mouse.move(...at(0.9, 0.85));
  await expect.poll(cursor).toBe("default");
  await page.getByTestId("geographic-mode-map").click();
  await page.getByTestId("geographic-measure-tool-length").click();
  await page.mouse.move(...at(0.8, 0.8), { steps: 2 });
  await expect.poll(cursor).toBe("crosshair");
  await page.getByTestId("geographic-measure-tool-none").click();
  await page.mouse.move(...at(0.9, 0.85), { steps: 2 });
  await expect.poll(cursor).toBe("default");

  await page.getByTestId("geographic-mode-draw").click();
  await page.getByTestId("geographic-tool-area").click();
  await page.mouse.move(...at(0.4, 0.3), { steps: 2 });
  await expect.poll(cursor).toBe("crosshair");
  for (const [x, y] of [
    [0.4, 0.3],
    [0.6, 0.3],
  ] as const) {
    await page.mouse.move(...at(x, y), { steps: 3 });
    await page.mouse.click(...at(x, y));
  }
  await page.mouse.move(...at(0.5, 0.6), { steps: 3 });
  await expect.poll(cursor).toBe("crosshair");
  await page.mouse.dblclick(...at(0.5, 0.6));
  const rows = page.locator(
    '[data-testid="geographic-composition"] li[data-testid^="geographic-composition-feature-"]',
  );
  await expect(rows).toHaveCount(1);
  const featureId = ((await rows.first().getAttribute("data-testid")) ?? "").replace(
    "geographic-composition-feature-",
    "",
  );
  const row = page.getByTestId(`geographic-composition-feature-${featureId}`);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("geographic-tool-select")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => savedRing(page.request, resource.id)).toHaveLength(4);
  const original = await savedRing(page.request, resource.id);

  await page.mouse.move(...at(0.9, 0.85), { steps: 2 });
  await expect.poll(cursor).toBe("default");
  await page.mouse.move(...at(0.5, 0.4), { steps: 3 });
  await expect.poll(cursor).toBe("pointer");

  await page.mouse.click(...at(0.5, 0.4));
  const card = page.getByTestId("geographic-drawn-element-card");
  await expect(card).toBeVisible();
  await expect(row).toHaveClass(/geographic-composition-feature-selected/);
  await expect(row).toHaveAttribute("data-modifying", "false");
  // The card is resized with its handle.
  const cardBox = (await card.boundingBox())!;
  await page.mouse.move(cardBox.x + cardBox.width - 3, cardBox.y + cardBox.height - 3);
  await page.mouse.down();
  await page.mouse.move(cardBox.x + cardBox.width - 3, cardBox.y + cardBox.height - 43, { steps: 4 });
  await page.mouse.up();
  const resizedCard = (await card.boundingBox())!;
  expect(resizedCard.height).toBeLessThan(cardBox.height - 20);
  await page.mouse.move(...at(0.6, 0.3), { steps: 3 });
  await expect.poll(cursor).toBe("pointer");

  await row.getByTestId(`geographic-composition-feature-menu-${featureId}`).click();
  await expect(page.getByTestId(`geographic-composition-feature-modify-${featureId}`)).toHaveAttribute(
    "data-state",
    "off",
  );
  await page.getByTestId(`geographic-composition-feature-modify-${featureId}`).click();
  await expect(card.getByTestId("geographic-drawn-element-shape")).toHaveAttribute("data-modifying", "true");
  await expect(row).toHaveAttribute("data-modifying", "true");
  // The card offers the same actions menu as the row, reflecting the same modification state.
  await card.getByTestId("geographic-drawn-element-card-menu").click();
  await expect(page.getByTestId("geographic-drawn-element-card-modify")).toHaveAttribute("data-state", "on");
  await expect(page.getByTestId("geographic-drawn-element-card-visible")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.move(...at(0.5, 0.4), { steps: 3 });
  await expect.poll(cursor).toBe("move");
  await page.mouse.move(...at(0.6, 0.3), { steps: 3 });
  await expect.poll(cursor).toBe("move");
  await page.mouse.down();
  await page.mouse.move(...at(0.7, 0.2), { steps: 6 });
  await expect.poll(cursor).toBe("move");
  await page.mouse.up();
  await expect
    .poll(async () => JSON.stringify(await savedRing(page.request, resource.id)))
    .not.toBe(JSON.stringify(original));
  const modified = await savedRing(page.request, resource.id);
  expect(modified).toHaveLength(4);
  expect(
    modified.filter((vertex) => original.some((before) => JSON.stringify(before) === JSON.stringify(vertex))),
  ).toHaveLength(3);

  await page.keyboard.press("Escape");
  await expect(card).toBeVisible();
  await expect(card.getByTestId("geographic-drawn-element-shape")).toHaveAttribute("data-modifying", "false");
  await expect(row).toHaveAttribute("data-modifying", "false");
  await expect(row).toHaveClass(/geographic-composition-feature-selected/);
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await expect(page.locator(".geographic-composition-feature-selected")).toHaveCount(0);

  const saveView = page.getByTestId("geographic-save-view");
  await expect(saveView).toBeDisabled();
  await page.mouse.dblclick(...at(0.5, 0.4));
  await expect(row).toHaveAttribute("data-modifying", "false");
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();

  await row.locator(".geographic-composition-feature-select").click();
  await expect(card).toBeVisible();
  await expect(row).toHaveAttribute("data-modifying", "false");
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();

  const beforePan = await savedRing(page.request, resource.id);
  await page.mouse.move(...at(0.9, 0.85), { steps: 2 });
  await page.mouse.down();
  await page.mouse.move(...at(0.8, 0.75), { steps: 6 });
  await expect.poll(cursor).toBe("grabbing");
  await page.mouse.up();
  await expect.poll(cursor).toBe("default");
  await expect(saveView).toBeEnabled();
  await page.waitForTimeout(2_000);
  expect(await savedRing(page.request, resource.id)).toEqual(beforePan);

  await page.getByTestId("geographic-mode-map").click();
  await page.mouse.move(...at(0.9, 0.85), { steps: 2 });
  await expect.poll(cursor).toBe("default");
});

// @verifies-requirement HALL-FR-DOC-450
test("in Cartes a click selects a drawing and the shape modification is a separate state", async ({
  appPage: page,
}) => {
  const [longitude, latitude, size] = [4.5, 47.54, 0.004];
  const created = await page.request.post("/api/resources", {
    data: { kind: "geographic", name: `Cartes selection ${crypto.randomUUID()}`, path: "seed" },
  });
  expect(created.ok()).toBeTruthy();
  const resource = (await created.json()).properties;
  const representation = await (await page.request.get(`/api/resources/${resource.id}`)).json();
  const update = (representation.actions as SirenAction[]).find((action) => action.name === "resource.update-content");
  if (!update) throw new Error("The administrator must be able to update the map");
  const featureId = crypto.randomUUID();
  const updated = await page.request.fetch(update.href, {
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
              id: featureId,
              properties: {
                kind: "area",
                visible: true,
                label: "Parcelle étudiée",
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
  expect(updated.ok()).toBeTruthy();

  const centre = `${longitude + size / 2},${latitude + size / 2}`;
  await page.goto(`/app/maps/${resource.id}?view=${centre},16`);
  const mapSelector = ".maps-surface .geographic-map";
  const cursor = viewportCursor(page, mapSelector);
  const box = await page.locator(mapSelector).boundingBox();
  if (!box) throw new Error("The map must be rendered");
  const middle = [box.x + box.width / 2, box.y + box.height / 2] as const;

  await page.mouse.move(...middle, { steps: 2 });
  await expect.poll(cursor).toBe("pointer");
  await expect(page.getByTestId("geographic-mode-draw")).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(middle[0] + 1, middle[1] + 1, { steps: 2 });
  await expect.poll(cursor).toBe("pointer");

  await page.mouse.click(...middle);
  const card = page.getByTestId("geographic-drawn-element-card");
  const row = page.getByTestId(`geographic-composition-feature-${featureId}`);
  await expect(card).toBeVisible();
  await expect(row).toHaveClass(/geographic-composition-feature-selected/);
  await expect(row).toHaveAttribute("data-modifying", "false");

  await row.getByTestId(`geographic-composition-feature-menu-${featureId}`).click();
  await page.getByTestId(`geographic-composition-feature-modify-${featureId}`).click();
  await expect(row).toHaveAttribute("data-modifying", "true");
  // Automatic note editors cover the map centre; target the visible lower portion of this same area.
  const visibleShape = [middle[0], box.y + box.height * 0.72] as const;
  await page.mouse.move(...visibleShape, { steps: 2 });
  await expect.poll(cursor).toBe("move");

  await page.keyboard.press("Escape");
  await expect(row).toHaveAttribute("data-modifying", "false");
  await expect(card).toBeVisible();
  await page.mouse.move(visibleShape[0] + 1, visibleShape[1] + 1, { steps: 2 });
  await expect.poll(cursor).toBe("pointer");
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await expect(row).not.toHaveClass(/geographic-composition-feature-selected/);

  await page.getByTestId("geographic-tool-marker").click();
  await page.mouse.move(middle[0] - 3, middle[1] - 3, { steps: 2 });
  await expect.poll(cursor).toBe("crosshair");
});
