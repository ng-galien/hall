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
  await page.getByTestId("geographic-mode-draw").click();
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
  await page.mouse.click(...at(0.97, 0.5));
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
  await page.goto(`/app/workspace?path=seed&resource=${map.id}`);
  await page.getByTestId("geographic-mode-draw").click();
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
  await card.getByTestId("geographic-drawn-element-note-create").click();
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
  await page.getByTestId("geographic-mode-draw").click();
  await rows.first().locator(".geographic-composition-feature-select").click();
  await expect(card.getByTestId("editor-writing-area")).toContainText("Chêne à conserver");
  for (const imageId of [inlineDropId, inlinePasteId, photoId, enrichedPasteId]) {
    await expect(card.getByTestId(`editor-image-${imageId}`)).toBeVisible();
  }

  await rows.first().locator(".geographic-composition-feature-delete").click();
  await expect(rows).toHaveCount(0);
  await expect.poll(async () => (await notes()).length, { timeout: 15_000 }).toBe(0);
  const note = await page.request.get(`/api/resources/${noteId}`);
  expect(note.ok()).toBeTruthy();
  expect((await note.json()).properties.path).toBe("seed/Notes cartographiques");
});
