import { readFileSync } from "node:fs";
import { expect, test } from "../fixtures/application";

// @verifies-requirement HALL-FR-WSP-330
// @verifies-requirement HALL-FR-WSP-350
test("incoming URL framing updates the same map and saves the displayed view", async ({ appPage: page }) => {
  await page.route(/^https:\/\/data\.geopf\.fr\/wmts\?/, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#148c5a"/></svg>',
    }),
  );
  const created = await page.request.post("/api/resources", {
    data: { kind: "geographic", name: `Incoming framing ${crypto.randomUUID()}`, path: "seed" },
  });
  expect(created.ok()).toBeTruthy();
  const resource = (await created.json()).properties;
  await page.goto(`/app/maps/${resource.id}?view=4.50,47.54,17`);
  const mapElement = page.locator(".maps-surface .geographic-map");
  await expect(mapElement.locator(".ol-viewport")).toBeVisible();
  await page.getByTestId("geographic-mode-map").click();
  await page.getByTestId("geographic-measures-tab-coordinates").click();
  const center = page.getByTestId("geographic-measure-center-wgs84");
  await expect(center).toContainText("47.540000");
  const viewport = await mapElement.locator(".ol-viewport").elementHandle();
  const navigateFraming = async (view: string) => {
    await page.evaluate((requested) => {
      window.history.pushState(window.history.state, "", `?view=${requested}`);
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    }, view);
  };
  await navigateFraming("4.51,47.55,18");
  await expect(center).toContainText("47.550000");
  await expect(center).toContainText("4.510000");
  expect(await viewport?.evaluate((element) => element.isConnected)).toBe(true);
  // Internal navigation must not loop back to the last incoming framing.
  await page.getByTestId("geographic-zoom-in").click();
  await expect.poll(() => Number(new URL(page.url()).searchParams.get("view")?.split(",")[2])).toBe(19);
  await expect(center).toContainText("47.550000");
  const beforeSave = (await (await page.request.get(`/api/resources/${resource.id}`)).json()).properties;
  expect(beforeSave.version).toBe(resource.version);
  await page.getByTestId("geographic-save-view").click();
  await expect
    .poll(async () => {
      const view = (await (await page.request.get(`/api/resources/${resource.id}`)).json()).properties.document.view;
      return { ...view, center: view.center?.map((coordinate: number) => Number(coordinate.toFixed(6))) };
    })
    .toEqual({ kind: "center", center: [4.51, 47.55], zoom: 19 });
  // Restore an earlier history framing without remounting the map.
  await navigateFraming("4.50,47.54,17");
  await expect(center).toContainText("47.540000");
  expect(await viewport?.evaluate((element) => element.isConnected)).toBe(true);
  await page.screenshot({ path: "/tmp/geographic-map-incoming-view-after-fix.png" });
});

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
  await expect(dialog.getByTestId("geographic-mode-draw")).toHaveAttribute("aria-pressed", "true");
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

// @verifies-requirement HALL-FR-DOC-410
test("the Mesures tab measures with temporary geometries that Escape clears without saving", async ({
  appPage: page,
}) => {
  const created = await page.request.post("/api/resources", {
    data: { kind: "geographic", name: `Measures ${crypto.randomUUID()}`, path: "seed" },
  });
  expect(created.ok()).toBeTruthy();
  const resource = (await created.json()).properties;
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes(`/api/resources/`)) writes.push(request.url());
  });
  await page.goto(`/app/workspace?path=seed&resource=${resource.id}`);
  await page.getByTestId("geographic-mode-map").click();
  const panel = page.getByTestId("geographic-measures");
  await expect(panel).toBeVisible();
  const map = await page.locator(".geographic-map").boundingBox();
  if (!map) throw new Error("The map must be rendered");
  const at = (x: number, y: number) => [map.x + map.width * x, map.y + map.height * y] as const;

  await expect(page.getByTestId("geographic-measure-cursor")).toHaveCount(0);
  await page.getByTestId("geographic-measures-tab-coordinates").click();
  await page.mouse.move(...at(0.6, 0.5));
  await expect(page.getByTestId("geographic-measure-cursor-wgs84")).toHaveText(/\d° [NS], .*\d° [EOW]/);
  await expect(page.getByTestId("geographic-measure-cursor-projected")).toHaveText(/^X .* m, Y .* m$/);

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByTestId("geographic-measure-center-copy-wgs84").click();
  await expect(page.getByTestId("geographic-measure-center-copy-wgs84")).toHaveAttribute("data-copy-outcome", "copied");
  await expect(page.getByTestId("geographic-measure-copy-status")).not.toBeEmpty();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^-?\d+\.\d{6}, -?\d+\.\d{6}$/);

  await page.getByTestId("geographic-measures-tab-measures").click();
  await page.getByTestId("geographic-measure-tool-length").click();
  await page.mouse.click(...at(0.5, 0.3));
  await page.mouse.move(...at(0.7, 0.4), { steps: 4 });
  await page.mouse.dblclick(...at(0.7, 0.4));
  await expect(page.getByTestId("geographic-measure-current-length")).toHaveText(/^[\d\s,.]+ (m|km)$/);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("geographic-measure-current")).toHaveCount(0);
  await expect(page.getByTestId("geographic-mode-map")).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("geographic-measure-tool-area").click();
  for (const [x, y] of [
    [0.5, 0.3],
    [0.7, 0.3],
  ] as const) {
    await page.mouse.move(...at(x, y), { steps: 3 });
    await page.mouse.click(...at(x, y));
  }
  await page.mouse.move(...at(0.6, 0.6), { steps: 3 });
  await page.mouse.dblclick(...at(0.6, 0.6));
  await expect(page.getByTestId("geographic-measure-current-area")).toHaveText(/(m²|ha)/);
  await expect(page.getByTestId("geographic-measure-current-perimeter")).toHaveText(/(m|km)$/);

  const saved = await page.request.get(`/api/resources/${resource.id}`);
  expect((await saved.json()).properties.document.hallLayer.features).toHaveLength(0);
  expect(writes).toEqual([]);
});

// @verifies-requirement HALL-FR-DOC-420
test("a drawn area too small on screen becomes a selectable marker and its geometry again when zooming in", async ({
  appPage: page,
}) => {
  const created = await page.request.post("/api/resources", {
    data: { kind: "geographic", name: `Compact ${crypto.randomUUID()}`, path: "seed" },
  });
  expect(created.ok()).toBeTruthy();
  const resource = (await created.json()).properties;
  await page.goto(`/app/workspace?path=seed&resource=${resource.id}`);
  await expect(page.getByTestId("geographic-mode-draw")).toHaveAttribute("aria-pressed", "true");
  const map = await page.locator(".geographic-map").boundingBox();
  if (!map) throw new Error("The map must be rendered");
  const at = (x: number, y: number) => [map.x + map.width * x, map.y + map.height * y] as const;
  await page.getByTestId("geographic-tool-area").click();
  for (const [x, y] of [
    [0.5, 0.3],
    [0.7, 0.35],
  ] as const) {
    await page.mouse.move(...at(x, y), { steps: 3 });
    await page.mouse.click(...at(x, y));
  }
  await page.mouse.move(...at(0.6, 0.7), { steps: 3 });
  await page.mouse.dblclick(...at(0.6, 0.7));
  const rows = page.locator(
    '[data-testid="geographic-composition"] li[data-testid^="geographic-composition-feature-"]',
  );
  await expect(rows).toHaveCount(1);
  const featureId = ((await rows.first().getAttribute("data-testid")) ?? "").replace(
    "geographic-composition-feature-",
    "",
  );
  await page.getByTestId("geographic-tool-select").click();
  await page.getByTestId(`geographic-composition-feature-fit-${featureId}`).click();
  await page.getByTestId("geographic-drawn-element-card-close").click();
  await expect(page.locator(".geographic-composition-feature-selected")).toHaveCount(0);
  for (let step = 0; step < 6; step += 1) {
    await page.getByTestId("geographic-zoom-out").click();
    await page.waitForTimeout(250);
  }
  const zoomedOut = await page.locator(".geographic-map").boundingBox();
  if (!zoomedOut) throw new Error("The map must be rendered");
  await page.mouse.click(zoomedOut.x + zoomedOut.width / 2, zoomedOut.y + zoomedOut.height / 2);
  await expect(page.getByTestId(`geographic-composition-feature-${featureId}`)).toHaveClass(
    /geographic-composition-feature-selected/,
  );
});

// @verifies-requirement HALL-FR-DOC-430
// @verifies-requirement HALL-FR-DOC-470
test("a drawn element carries a rich-text note that survives a reload and outlives the element", async ({
  appPage: page,
}) => {
  const created = await page.request.post("/api/resources", {
    data: { kind: "geographic", name: `Noted drawing ${crypto.randomUUID()}`, path: "seed" },
  });
  expect(created.ok()).toBeTruthy();
  const map = (await created.json()).properties;
  let injectedConflict = false;
  await page.route("**/api/resources/*/content", async (route) => {
    const payload = route.request().postDataJSON();
    if (!injectedConflict && payload?.kind === "geographic") {
      injectedConflict = true;
      const remote = await route.fetch({
        postData: JSON.stringify({
          ...payload,
          document: { ...payload.document, hallLayer: { ...payload.document.hallLayer, features: [] } },
        }),
      });
      expect(remote.ok()).toBeTruthy();
      await route.fulfill({
        status: 409,
        contentType: "application/problem+json",
        body: JSON.stringify({ code: "conflict", status: 409 }),
      });
    } else await route.continue();
  });
  await page.goto(`/app/workspace?path=seed&resource=${map.id}`);
  await expect(page.getByTestId("geographic-mode-draw")).toHaveAttribute("aria-pressed", "true");
  const box = await page.locator(".geographic-map").boundingBox();
  if (!box) throw new Error("The map must be rendered");
  await page.getByTestId("geographic-tool-marker").click();
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5);
  const rows = page.locator(
    '[data-testid="geographic-composition"] li[data-testid^="geographic-composition-feature-"]',
  );
  await expect(rows).toHaveCount(1);
  const elementId = ((await rows.first().getAttribute("data-testid")) ?? "").replace(
    "geographic-composition-feature-",
    "",
  );
  await page.keyboard.press("Enter");
  await rows.first().locator(".geographic-composition-feature-select").click();
  const card = page.getByTestId("geographic-drawn-element-card");
  await expect(card).toBeVisible();
  await page.getByTestId("geographic-conflict-retry").click();
  await expect(page.getByTestId("geographic-conflict-retry")).toBeHidden();
  await expect(rows).toHaveCount(1);
  const writingArea = card.getByTestId("editor-writing-area");
  await expect(writingArea).toHaveAttribute("contenteditable", "true");
  await writingArea.click();
  await page.keyboard.type("Chêne à conserver");
  const notes = async () =>
    (await (await page.request.get(`/api/resources/${map.id}/feature-notes`)).json()).properties.items as Array<{
      noteId: string;
      key: string;
    }>;
  await expect.poll(async () => (await notes()).map(({ key }) => key)).toEqual([elementId]);
  const [{ noteId }] = await notes();
  const noteContent = async () =>
    (await (await page.request.get(`/api/resources/${noteId}`)).json()).properties.content as string;
  await expect.poll(noteContent, { timeout: 15_000 }).toContain("Chêne à conserver");

  const png = [
    ...Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEElEQVR42mNk+M+ABzDhkAIAEwQCAiV7nNwAAAAASUVORK5CYII=",
      "base64",
    ),
  ];
  const photoTransfer = (name: string) =>
    page.evaluateHandle(
      ({ content, fileName }) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([Uint8Array.from(content)], fileName, { type: "image/png" }));
        return transfer;
      },
      { content: png, fileName: name },
    );
  const nextUpload = () =>
    page.waitForResponse(
      (response) => response.url().endsWith("/api/resources/editor-assets") && response.request().method() === "POST",
    );
  const uploadedId = async (response: Promise<import("@playwright/test").Response>) => {
    const upload = await response;
    expect(upload.status()).toBe(201);
    return (await upload.json()).properties.id as string;
  };
  const dropOn = async (area: import("@playwright/test").Locator, name: string) => {
    const transfer = await photoTransfer(name);
    const areaBox = await area.boundingBox();
    const position = {
      clientX: Math.round((areaBox?.x ?? 0) + 20),
      clientY: Math.round((areaBox?.y ?? 0) + (areaBox?.height ?? 0) - 10),
    };
    await area.dispatchEvent("dragenter", { dataTransfer: transfer, ...position });
    const dropZone = area
      .locator("xpath=ancestor::div[contains(@class,'markdown-editor-canvas')][1]")
      .getByTestId("editor-image-drop-zone");
    await expect(dropZone).toBeVisible();
    const uploaded = nextUpload();
    await area.dispatchEvent("drop", { dataTransfer: transfer, ...position });
    await expect(dropZone).toBeHidden();
    return uploadedId(uploaded);
  };
  const pasteInto = async (area: import("@playwright/test").Locator, name: string) => {
    const uploaded = nextUpload();
    await area.evaluate(
      (element, { content, fileName }) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([Uint8Array.from(content)], fileName, { type: "image/png" }));
        element.dispatchEvent(
          new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }),
        );
      },
      { content: png, fileName: name },
    );
    return uploadedId(uploaded);
  };

  const inlineDropId = await dropOn(writingArea, "chene-fiche.png");
  await expect(card.locator(`[data-resource-id="${inlineDropId}"] img`)).toBeVisible();
  await expect.poll(noteContent, { timeout: 15_000 }).toContain(inlineDropId);
  await writingArea.click();
  await page.keyboard.press("End");
  const inlinePasteId = await pasteInto(writingArea, "chene-colle.png");
  await expect(card.locator(`[data-resource-id="${inlinePasteId}"] img`)).toBeVisible();
  await expect.poll(noteContent, { timeout: 15_000 }).toContain(inlinePasteId);

  await writingArea.click();
  await card.getByTestId("editor-open-enriched").click();
  const enriched = page.getByTestId("markdown-editor-enriched");
  await expect(enriched).toBeVisible();
  const enrichedArea = enriched.getByTestId("editor-writing-area");
  const photoId = await dropOn(enrichedArea, "chene.png");
  await expect(enriched.locator(`[data-resource-id="${photoId}"] img`)).toBeVisible();
  const enrichedPasteId = await pasteInto(enrichedArea, "chene-plein-ecran.png");
  await expect(enriched.locator(`[data-resource-id="${enrichedPasteId}"] img`)).toBeVisible();
  await page.getByTestId("editor-enriched-dialog").getByTestId("dialog-close").click();
  await expect(enriched).toBeHidden();
  await expect(card).toBeVisible();
  await expect.poll(noteContent, { timeout: 15_000 }).toContain(photoId);
  await expect.poll(noteContent, { timeout: 15_000 }).toContain(enrichedPasteId);

  await page.reload();
  await expect(page.getByTestId("geographic-mode-draw")).toHaveAttribute("aria-pressed", "true");
  await rows.first().locator(".geographic-composition-feature-select").click();
  await expect(card.getByTestId("editor-writing-area")).toContainText("Chêne à conserver");
  for (const imageId of [inlineDropId, inlinePasteId, photoId, enrichedPasteId]) {
    await expect(card.getByTestId(`editor-image-${imageId}`)).toBeVisible();
  }

  await page.getByTestId(`geographic-composition-feature-menu-${elementId}`).click();
  await page.getByTestId(`geographic-composition-feature-delete-${elementId}`).click();
  await expect(rows).toHaveCount(0);
  await expect.poll(async () => (await notes()).length, { timeout: 15_000 }).toBe(0);
  const note = await page.request.get(`/api/resources/${noteId}`);
  expect(note.ok()).toBeTruthy();
  expect((await note.json()).properties.path).toBe("seed/Notes cartographiques");
});

// @verifies-requirement HALL-FR-DOC-520
// @verifies-requirement HALL-FR-DOC-450
// @verifies-requirement HALL-FR-DOC-520
test("drawing edit retains rendered base tiles and exterior dimension overlays", async ({ appPage: page }) => {
  await page.setViewportSize({ width: 1800, height: 950 });
  let rejectNewTiles = false;
  let rejectedTileRequests = 0;
  await page.route(/^https:\/\/data\.geopf\.fr\/wmts\?/, async (route) => {
    if (rejectNewTiles) {
      rejectedTileRequests += 1;
      return route.fulfill({ status: 404 });
    }
    return route.fulfill({
      contentType: "image/svg+xml",
      headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#148c5a"/></svg>',
    });
  });
  const snapshot = process.env.HALL_EXTENT_DIAGNOSTIC_SNAPSHOT;
  const owner = snapshot
    ? JSON.parse(readFileSync(snapshot, "utf8")).properties
    : {
        document: {
          hallLayer: {
            features: [
              {
                type: "Feature",
                id: "five-vertex-area",
                properties: {
                  kind: "area",
                  label: "Stationnement usagers",
                  visible: true,
                  style: { fillColor: "#1f7a4a", fillOpacity: 0.2, strokeColor: "#1f7a4a", strokeWidth: 2 },
                },
                geometry: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [4.5, 47.54],
                      [4.50008, 47.54001],
                      [4.50015, 47.5397],
                      [4.50014, 47.53966],
                      [4.50006, 47.53966],
                      [4.5, 47.54],
                    ],
                  ],
                },
              },
            ],
          },
        },
      };
  const original = owner.document.hallLayer.features.find(
    (feature: { properties: { label?: string } }) => feature.properties.label === "Stationnement usagers",
  );
  expect(original.geometry.coordinates[0]).toHaveLength(6);
  const copied = structuredClone(original);
  copied.id = crypto.randomUUID();
  const created = await page.request.post("/api/resources", {
    data: { kind: "geographic", name: `Extent diagnostic ${crypto.randomUUID()}`, path: "seed" },
  });
  expect(created.ok()).toBeTruthy();
  const map = (await created.json()).properties;
  const ring = copied.geometry.coordinates[0] as number[][];
  const center = [0, 1].map(
    (axis) => (Math.min(...ring.map((p) => p[axis]!)) + Math.max(...ring.map((p) => p[axis]!))) / 2,
  );
  const saved = await page.request.put(`/api/resources/${map.id}/content`, {
    data: {
      kind: "geographic",
      expectedVersion: map.version,
      document: {
        ...map.document,
        view: { kind: "center", center, zoom: 20 },
        hallLayer: { type: "FeatureCollection", features: [copied] },
      },
    },
  });
  expect(saved.ok()).toBeTruthy();
  // This fixture note prevents automatic preparation; the protected source map is never addressed by this runtime.
  expect(
    (await page.request.post(`/api/resources/${map.id}/feature-notes`, { data: { elementId: copied.id } })).ok(),
  ).toBeTruthy();
  await page.goto(`/app/maps/${map.id}?view=${center[0]},${center[1]},19`);
  const mapElement = page.locator(".maps-surface .geographic-map");
  await expect.poll(() => mapElement.evaluate((el) => el.querySelector("canvas")?.width === el.clientWidth)).toBe(true);
  // Maps open on Elements, where a click opens the drawing card: the drawing readout belongs to Mesures.
  await page.getByTestId("geographic-mode-map").click();
  const box = await mapElement.boundingBox();
  if (!box) throw new Error("Map must be visible");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId("geographic-measure-drawing-values-approximate-width")).toBeVisible();
  await expect(page.getByTestId("geographic-measure-drawing-values-approximate-length")).toBeVisible();
  await expect(page.getByTestId("geographic-measure-drawing-values")).toContainText(
    /Largeur d’emprise approximative|Approximate extent width/,
  );
  await expect(page.getByTestId("geographic-measure-drawing-values")).toContainText(
    /Longueur d’emprise approximative|Approximate extent length/,
  );
  await expect(page.getByTestId("geographic-measure-drawing-values-area")).toBeVisible();
  const unchanged = (await (await page.request.get(`/api/resources/${map.id}`)).json()).properties.document.hallLayer
    .features[0];
  expect(unchanged.geometry).toEqual(original.geometry);
  const tilePixel = () =>
    mapElement.evaluate((el) => {
      const canvas = el.querySelector(".ol-layer canvas") as HTMLCanvasElement | null;
      return canvas ? Array.from(canvas.getContext("2d")!.getImageData(10, 10, 1, 1).data) : [];
    });
  await expect.poll(tilePixel).toEqual([20, 140, 90, 255]);
  rejectNewTiles = true;
  await page.getByTestId("geographic-zoom-in").click();
  await expect.poll(() => Number(new URL(page.url()).searchParams.get("view")?.split(",")[2])).toBe(20);
  await expect.poll(() => rejectedTileRequests).toBeGreaterThan(0);
  // At the unavailable zoom, the previously loaded parent tiles are still visible.
  await expect.poll(tilePixel).toEqual([20, 140, 90, 255]);
  await page.getByTestId("geographic-mode-draw").click();
  await expect(page.getByTestId("geographic-mode-draw")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId(`geographic-composition-feature-menu-${copied.id}`).click();
  await page.getByTestId(`geographic-composition-feature-modify-${copied.id}`).click();
  await expect(page.getByTestId(`geographic-composition-feature-${copied.id}`)).toHaveAttribute(
    "data-modifying",
    "true",
  );
  const projected = (p: number[]) => [
    (p[0]! * 20037508.342789244) / 180,
    Math.log(Math.tan(((90 + p[1]!) * Math.PI) / 360)) * 6378137,
  ];
  const worldCenter = projected(center),
    vertex = projected(ring[0]!);
  const resolution = 156543.03392804097 / 2 ** 20;
  const viewport = await mapElement.boundingBox();
  if (!viewport) throw new Error("Map must be visible");
  const x = viewport.x + viewport.width / 2 + (vertex[0]! - worldCenter[0]!) / resolution;
  const y = viewport.y + viewport.height / 2 - (vertex[1]! - worldCenter[1]!) / resolution;
  const oldViewport = await mapElement.locator(".ol-viewport").elementHandle();
  const framingBeforeEditing = new URL(page.url()).searchParams.get("view");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y + 8, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/resources/${map.id}`)).json()).properties.document.hallLayer.features[0]
          .geometry,
    )
    .not.toEqual(original.geometry);
  expect(await oldViewport?.evaluate((el) => el.isConnected)).toBe(true);
  expect(new URL(page.url()).searchParams.get("view")).toBe(framingBeforeEditing);
  await expect(page.getByTestId(`geographic-composition-feature-${copied.id}`)).toHaveAttribute(
    "data-modifying",
    "true",
  );
  await expect(page.getByTestId("geographic-drawn-element-card-title")).toHaveText("Stationnement usagers");
  // Cached, actually rendered raster pixels must survive the geometry update; vectors alone cannot pass this.
  await expect.poll(tilePixel).toEqual([20, 140, 90, 255]);
  await page.screenshot({ path: "/tmp/geographic-map-base-tiles-after-fix.png" });
  await page.getByTestId(`geographic-composition-feature-menu-${copied.id}`).click();
  await page.getByTestId(`geographic-composition-feature-measures-${copied.id}`).click();
  await page.getByTestId("geographic-mode-draw").click();
  const close = page.getByTestId("geographic-drawn-element-card-close");
  if (await close.isVisible()) await close.click();
  await page.screenshot({ path: "/tmp/geographic-map-exterior-dimensions-normal.png" });
  rejectNewTiles = false;
  await page.setViewportSize({ width: 1150, height: 950 });
  await expect.poll(() => mapElement.evaluate((el) => el.querySelector("canvas")?.width === el.clientWidth)).toBe(true);
  const narrow = await mapElement.boundingBox();
  if (!narrow) throw new Error("Narrow map must be visible");
  await page.keyboard.down("Alt");
  await page.keyboard.down("Shift");
  await page.mouse.move(narrow.x + narrow.width / 2 + 100, narrow.y + narrow.height / 2);
  await page.mouse.down();
  await page.mouse.move(narrow.x + narrow.width / 2, narrow.y + narrow.height / 2 + 100, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.keyboard.up("Alt");
  await expect.poll(tilePixel).toEqual([20, 140, 90, 255]);
  await page.screenshot({ path: "/tmp/geographic-map-exterior-dimensions-narrow-rotated.png" });
});
