import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";

const pngFixture = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEElEQVR42mNk+M+ABzDhkAIAEwQCAiV7nNwAAAAASUVORK5CYII=",
  "base64",
);

function compactEditor(page: Page): Locator {
  return page.getByTestId("markdown-editor-compact").first();
}

function enrichedEditor(page: Page): Locator {
  return page.getByTestId("markdown-editor-enriched");
}

function writingArea(editor: Locator): Locator {
  return editor.locator('[contenteditable="true"]');
}

function markdownSource(page: Page): Locator {
  return page.getByTestId("editor-lab-markdown-source");
}

function renderedDocument(page: Page): Locator {
  return page.getByTestId("editor-lab-rendered-document");
}

async function openEditorLab(page: Page): Promise<void> {
  await page.goto("/app/editor-lab");
  await expect(page.getByTestId("editor-lab-page")).toBeVisible();
  await expect(compactEditor(page)).toBeVisible();
}

async function openEnrichedEditor(page: Page): Promise<Locator> {
  await compactEditor(page).getByTestId("editor-open-enriched").click();
  const editor = enrichedEditor(page);
  await expect(editor).toBeVisible();
  return editor;
}

async function closeEnrichedEditor(page: Page): Promise<void> {
  await page
    .locator('[data-slot="dialog-content"]')
    .filter({ has: enrichedEditor(page) })
    .locator('[data-slot="dialog-close"]')
    .click();
  await expect(enrichedEditor(page)).toBeHidden();
}

async function openWorkspaceText(page: Page, resourceIndex = 0): Promise<{ id: string; slug: string; title: string }> {
  const response = await page.request.get("/api/resources?kind=text");
  expect(response.ok()).toBe(true);
  const representation = (await response.json()) as {
    entities: Array<{ properties: { id: string; slug: string; title: string; folderPath: string; content: string } }>;
  };
  const resources = representation.entities.map(({ properties }) => properties);
  const tableResource = resources.find(({ content }) => content.includes("\n|"));
  const ordered = tableResource ? [tableResource, ...resources.filter(({ id }) => id !== tableResource.id)] : resources;
  const resource = ordered[resourceIndex];
  expect(resource).toBeTruthy();
  await page.goto(
    `/app/workspace?path=${encodeURIComponent(resource?.folderPath ?? "")}&resource=${encodeURIComponent(resource?.id ?? "")}`,
  );
  await expect(compactEditor(page)).toBeVisible();
  return resource;
}

async function persistedResourceContent(page: Page, slug: string): Promise<string> {
  const response = await page.request.get(`/api/resources/${slug}`);
  expect(response.ok()).toBe(true);
  const representation = (await response.json()) as { properties: { resource?: { content?: string } } };
  return representation.properties.resource?.content ?? "";
}

async function replaceEditorText(editor: Locator, value: string): Promise<void> {
  const area = writingArea(editor);
  await area.click();
  await area.press("ControlOrMeta+A");
  await area.pressSequentially(value);
}

async function openReferenceSearch(editor: Locator): Promise<Locator> {
  await editor.getByTestId("editor-insert-reference").click();
  const dialog = editor.page().getByTestId("reference-search-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function dropEditorFile(
  page: Page,
  editor: Locator,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  const transfer = await page.evaluateHandle(
    ({ content, name, mimeType }) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([Uint8Array.from(content)], name, { type: mimeType }));
      return dataTransfer;
    },
    { content: [...file.buffer], name: file.name, mimeType: file.mimeType },
  );
  const box = await writingArea(editor).boundingBox();
  expect(box).not.toBeNull();
  await writingArea(editor).dispatchEvent("drop", {
    dataTransfer: transfer,
    clientX: Math.round((box?.x ?? 0) + 30),
    clientY: Math.round((box?.y ?? 0) + 30),
  });
}

test.describe("Markdown editor", () => {
  test("keeps the compact toolbar strict and reserves rich insertions for fullscreen", async ({ appPage: page }) => {
    await openEditorLab(page);

    const compact = compactEditor(page);
    const compactButtons = compact.locator('[role="toolbar"]').getByRole("button");
    await expect(compactButtons).toHaveCount(6);
    for (const testId of [
      "editor-bold",
      "editor-italic",
      "editor-code",
      "editor-bullet-list",
      "editor-insert-reference",
      "editor-open-enriched",
    ]) {
      await expect(compact.getByTestId(testId)).toBeVisible();
    }
    for (const testId of ["editor-underline", "editor-insert-table", "editor-link", "editor-insert-image"]) {
      await expect(compact.getByTestId(testId)).toHaveCount(0);
    }

    const enriched = await openEnrichedEditor(page);
    for (const testId of [
      "editor-undo",
      "editor-redo",
      "editor-bold",
      "editor-italic",
      "editor-code",
      "editor-bullet-list",
      "editor-numbered-list",
      "editor-link",
      "editor-insert-table",
      "editor-insert-reference",
    ]) {
      await expect(enriched.getByTestId(testId)).toBeVisible();
    }
    for (const testId of ["editor-underline", "editor-insert-image", "editor-upload-image"]) {
      await expect(enriched.getByTestId(testId)).toHaveCount(0);
    }
  });

  test("selects an existing image and exposes its contextual controls in compact mode", async ({ appPage: page }) => {
    await openEditorLab(page);
    const compact = compactEditor(page);
    const image = compact.locator("img[alt]").first();
    await expect(image).toBeVisible();
    const imageName = await image.getAttribute("alt");
    expect(imageName).toBeTruthy();
    await image.click();

    const controls = compact.getByTestId("editor-image-controls");
    await expect(controls).toBeVisible();
    await expect(controls).not.toContainText("%");
    await expect(compact.getByTestId("editor-image-alt")).toHaveCount(0);
    await expect(compact.getByTestId("editor-image-align-left")).toBeVisible();
    await expect(compact.getByTestId("editor-image-align-center")).toBeVisible();
    await expect(compact.getByTestId("editor-image-width")).toBeVisible();
    const imageBox = await image.boundingBox();
    const controlsBox = await controls.boundingBox();
    expect(imageBox).not.toBeNull();
    expect(controlsBox).not.toBeNull();
    expect(controlsBox?.x).toBeGreaterThanOrEqual(imageBox?.x ?? 0);
    expect(controlsBox?.y).toBeGreaterThanOrEqual(imageBox?.y ?? 0);
    expect((controlsBox?.width ?? Infinity) / (imageBox?.width ?? 1)).toBeLessThan(0.5);
    const openImage = compact.getByTestId("editor-image-open");
    await expect(openImage).toBeVisible();
    await openImage.click();
    await expect(page.getByTestId("resource-preview")).toBeVisible();
    await expect(page.getByTestId("resource-preview-object")).toHaveAttribute("type", "image/png");
  });

  test("opens the authoritative PDF for the current Markdown in the Hall viewer", async ({ appPage: page }) => {
    await openEditorLab(page);
    const responsePromise = page.waitForResponse(
      (response) => response.url().endsWith("/api/templates/preview-pdf") && response.request().method() === "POST",
    );
    await page.getByTestId("editor-pdf-preview").click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
    const viewer = page.getByTestId("editor-pdf-native-viewer");
    await expect(viewer).toBeVisible();
    await expect(viewer.locator("object")).toHaveAttribute("data", /^blob:/);
  });

  test("synchronizes text, blocks, marks, undo and redo with Markdown and rendering", async ({ appPage: page }) => {
    await openEditorLab(page);
    const editor = await openEnrichedEditor(page);
    const source = markdownSource(page);

    await replaceEditorText(editor, "Control mark");
    await writingArea(editor).press("ControlOrMeta+A");
    await editor.getByTestId("editor-bold").click();
    await expect(editor.getByTestId("editor-bold")).toHaveAttribute("aria-pressed", "true");
    await expect(source).toContainText("**Control mark**");
    await editor.getByTestId("editor-undo").click();
    await expect(source).not.toContainText("**Control mark**");
    await editor.getByTestId("editor-redo").click();
    await expect(source).toContainText("**Control mark**");

    await writingArea(editor).press("ControlOrMeta+A");
    await editor.getByTestId("editor-bold").click();
    await writingArea(editor).press("ControlOrMeta+A");
    await editor.getByTestId("editor-italic").click();
    await expect(source).toContainText("*Control mark*");
    await writingArea(editor).press("ControlOrMeta+A");
    await editor.getByTestId("editor-italic").click();
    await writingArea(editor).press("ControlOrMeta+A");
    await editor.getByTestId("editor-code").click();
    await expect(editor.getByTestId("editor-code")).toHaveAttribute("aria-pressed", "true");
    await expect(source).toContainText("`Control mark`");
    const renderedCode = renderedDocument(page).getByText("Control mark");
    await expect(renderedCode).toHaveJSProperty("tagName", "CODE");
    await expect(renderedCode).toBeVisible();

    await writingArea(editor).press("ControlOrMeta+A");
    await editor.getByTestId("editor-block-style").click();
    await page.getByTestId("editor-block-h2").click();
    await expect(source).toContainText("## `Control mark`");
    await closeEnrichedEditor(page);
    await expect(compactEditor(page)).toContainText("Control mark");
    await openEnrichedEditor(page);
    await expect(enrichedEditor(page)).toContainText("Control mark");
    await expect(markdownSource(page)).toContainText("## `Control mark`");
  });

  test("creates and edits a GFM table and preserves its structure across both modes", async ({ appPage: page }) => {
    await openEditorLab(page);
    const editor = await openEnrichedEditor(page);
    const area = writingArea(editor);
    await replaceEditorText(editor, "Control table");
    await area.press("End");
    await editor.getByTestId("editor-insert-table").click();

    const table = editor.getByRole("table");
    await expect(table).toBeVisible();
    await area.pressSequentially("Association");
    await area.press("Tab");
    await area.pressSequentially("Montant");
    await area.press("Tab");
    await area.pressSequentially("Objet");
    await area.press("Tab");
    await area.pressSequentially("Tilleuls");
    await area.press("Tab");
    await area.pressSequentially("2400");
    await editor.getByTestId("editor-table-add-column").click();
    await expect(table.getByRole("row").first().getByRole("columnheader")).toHaveCount(4);
    await editor.getByTestId("editor-table-add-row").click();
    await expect(table.getByRole("row")).toHaveCount(4);

    await table.getByRole("columnheader").first().click();
    await editor.getByTestId("editor-table-column-menu").click();
    await page.getByTestId("editor-table-align-center").click();
    await expect(markdownSource(page)).toContainText(/:--+:/);

    await table.getByRole("columnheader").first().click();
    await editor.getByTestId("editor-table-column-menu").click();
    await page.getByTestId("editor-table-widen-column").click();
    await expect(markdownSource(page)).toContainText(/colwidth=["']\d+["']/);

    const firstHeader = table.getByRole("columnheader").first();
    await firstHeader.click();
    await table
      .getByRole("columnheader")
      .nth(1)
      .click({ modifiers: ["Shift"] });
    await editor.getByTestId("editor-table-merge").click();
    await expect(table.getByRole("row").first().getByRole("columnheader")).toHaveCount(3);
    await expect(markdownSource(page)).toContainText(/colspan=["']2["']/);
    await editor.getByTestId("editor-table-split").click();
    await expect(table.getByRole("row").first().getByRole("columnheader")).toHaveCount(4);
    await closeEnrichedEditor(page);
    await expect(compactEditor(page).getByRole("table")).toBeVisible();
    await expect(compactEditor(page)).toContainText("Tilleuls");
    await expect(renderedDocument(page).getByRole("table")).toBeVisible();
    await openEnrichedEditor(page);
    await expect(enrichedEditor(page).getByRole("table")).toBeVisible();
  });

  test("converts tabular Excel or Word clipboard content into an editable table", async ({ appPage: page }) => {
    await openEditorLab(page);
    const editor = await openEnrichedEditor(page);
    const area = writingArea(editor);
    await replaceEditorText(editor, "Collage bureautique");
    await area.press("End");
    await area.press("Enter");
    await area.evaluate((element) => {
      const transfer = new DataTransfer();
      transfer.setData(
        "text/html",
        "<table><thead><tr><th>Association</th><th>Montant</th></tr></thead><tbody><tr><td>Harmonie</td><td>1800</td></tr></tbody></table>",
      );
      transfer.setData("text/plain", "Association\tMontant\nHarmonie\t1800");
      element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
    });

    await expect(editor.getByRole("table")).toContainText("Harmonie");
    await expect(markdownSource(page)).toContainText("| Harmonie");
    await closeEnrichedEditor(page);
    await expect(compactEditor(page).getByRole("table")).toContainText("1800");
  });

  test("inserts the five typed references with their immutable UUIDs", async ({ appPage: page }) => {
    await openEditorLab(page);
    const editor = await openEnrichedEditor(page);
    const source = markdownSource(page);
    const kinds = ["member", "resource", "councilBusiness", "meeting", "decision"] as const;

    for (const directive of kinds) {
      const dialog = await openReferenceSearch(editor);
      await dialog.getByTestId(`reference-kind-${directive}`).click();
      await dialog.getByTestId("reference-result").first().click();
      await expect(source).toHaveText(new RegExp(`:${directive}\\[[^\\]]+\\]\\{#[0-9a-f-]{36}\\}`));
    }
    const markdown = await source.textContent();
    expect(markdown).not.toContain("/api/");
    expect(markdown).not.toContain("slug=");
  });

  test("inserts and selects an archived image and resizes it without distortion or render drift", async ({
    appPage: page,
  }) => {
    await openEditorLab(page);
    const editor = await openEnrichedEditor(page);
    const search = await openReferenceSearch(editor);
    await search.getByTestId("reference-search-input").fill("image");
    const imageOption = search.getByTestId("reference-result").first();
    await expect(imageOption).toBeVisible();
    await imageOption.click();

    const image = editor.locator(".editor-image-node img").first();
    const slider = editor.getByTestId("editor-image-width");
    await expect(editor.getByTestId("editor-image-alt")).toHaveCount(0);
    await expect(image).toBeVisible();
    await expect(slider).toHaveAttribute("aria-valuenow", "100");
    await editor.getByTestId("editor-image-align-center").click();

    const before = await image.evaluate((element) => {
      const image = element as HTMLImageElement;
      const rect = image.getBoundingClientRect();
      return { rendered: rect.width / rect.height, natural: image.naturalWidth / image.naturalHeight };
    });
    await slider.press("ArrowLeft");
    await slider.press("ArrowLeft");
    await expect(slider).toHaveAttribute("aria-valuenow", "90");
    const after = await image.evaluate((element) => {
      const image = element as HTMLImageElement;
      const rect = image.getBoundingClientRect();
      return rect.width / rect.height;
    });
    expect(Math.abs(before.rendered - before.natural)).toBeLessThan(0.02);
    expect(Math.abs(after - before.natural)).toBeLessThan(0.02);

    const source = markdownSource(page);
    await expect(source).toContainText(/::image\[[^\]]+\]\{#[0-9a-f-]{36} align="center" width="90"\}/);
    const resourceId = /#([0-9a-f-]{36})/.exec((await source.textContent()) ?? "")?.[1];
    expect(resourceId).toBeTruthy();
    await expect(editor).not.toContainText(resourceId ?? "Missing UUID");
    const imageAlt = await image.getAttribute("alt");
    expect(imageAlt).toBeTruthy();
    await expect(renderedDocument(page).locator(`img[alt="${imageAlt}"]`)).toBeVisible();

    await editor.getByTestId("editor-image-open").click();
    const viewer = page.getByTestId("resource-preview");
    await expect(viewer).toBeVisible();
    await expect(viewer.locator("object")).toHaveAttribute("type", "image/png");
    await viewer.getByTestId("resource-preview-close").click();
  });

  test("imports, autosaves, reloads and purges an editor asset from a real workbench", async ({ appPage: page }) => {
    const resource = await openWorkspaceText(page, 1);
    const editor = await openEnrichedEditor(page);

    await dropEditorFile(page, editor, {
      name: "animation.gif",
      mimeType: "image/gif",
      buffer: Buffer.from("GIF89a"),
    });
    await expect(page.getByRole("alert")).toBeVisible();

    const uploadPromise = page.waitForResponse(
      (response) => response.url().endsWith("/api/resources/editor-assets") && response.request().method() === "POST",
    );
    await dropEditorFile(page, editor, {
      name: "codex-clipboard-12345678-1234-1234-1234-123456789abc.png",
      mimeType: "image/png",
      buffer: pngFixture,
    });
    const uploaded = await uploadPromise;
    expect(uploaded.status()).toBe(201);
    const representation = (await uploaded.json()) as {
      properties: { id: string; title: string; usage: string; editorOwner: { kind: string; id: string } };
    };
    const assetId = representation.properties.id;
    expect(representation.properties).toMatchObject({
      usage: "editorAsset",
      editorOwner: { kind: "textResourceContent" },
    });
    expect(representation.properties.title).not.toContain("codex-clipboard");
    await expect(editor.locator(`[data-resource-id="${assetId}"] img`)).toHaveAttribute(
      "alt",
      representation.properties.title,
    );
    await expect(editor).not.toContainText(assetId);
    await closeEnrichedEditor(page);
    await expect.poll(() => persistedResourceContent(page, resource.slug), { timeout: 15_000 }).toContain(assetId);

    await page.reload();
    const compactAsset = compactEditor(page).locator(`[data-resource-id="${assetId}"]`);
    const compactImage = compactAsset.locator("img");
    await expect(compactImage).toBeVisible();
    await compactImage.click();
    await expect(compactEditor(page).getByTestId("editor-image-width")).toBeVisible();

    await page.keyboard.press("Backspace");
    await expect(compactImage).toHaveCount(0);
    await expect.poll(() => persistedResourceContent(page, resource.slug), { timeout: 15_000 }).not.toContain(assetId);
    await expect.poll(async () => (await page.request.get(`/api/resources/${assetId}`)).status()).toBe(404);
  });

  test("imports an image by drag and drop in a fullscreen workbench", async ({ appPage: page }) => {
    const resource = await openWorkspaceText(page, 2);
    const editor = await openEnrichedEditor(page);
    const uploadPromise = page.waitForResponse(
      (response) => response.url().endsWith("/api/resources/editor-assets") && response.request().method() === "POST",
    );
    await dropEditorFile(page, editor, {
      name: "landscape-plan.png",
      mimeType: "image/png",
      buffer: pngFixture,
    });
    const uploaded = await uploadPromise;
    expect(uploaded.status()).toBe(201);
    const representation = (await uploaded.json()) as { properties: { id: string; title: string } };
    await expect(editor.locator(`[data-resource-id="${representation.properties.id}"] img`)).toHaveAttribute(
      "alt",
      representation.properties.title,
    );
    await closeEnrichedEditor(page);
    await expect
      .poll(() => persistedResourceContent(page, resource.slug), { timeout: 15_000 })
      .toContain(representation.properties.title);
    await page.reload();
    await expect(compactEditor(page).getByTestId("editor-insert-image")).toHaveCount(0);
    const compactImage = compactEditor(page).locator(`[data-resource-id="${representation.properties.id}"] img`);
    await expect(compactImage).toBeVisible();
    await compactImage.click();
    await expect(compactEditor(page).getByTestId("editor-image-width")).toBeVisible();
  });

  test("autosaves text from fullscreen mode and restores it after reload", async ({ appPage: page }) => {
    const resource = await openWorkspaceText(page);
    const marker = `Autosaved marker ${Date.now()}`;
    const editor = await openEnrichedEditor(page);
    const area = writingArea(editor);
    await area.click();
    await area.press("ControlOrMeta+End");
    await area.press("Enter");
    await area.pressSequentially(marker);
    await closeEnrichedEditor(page);
    await expect(compactEditor(page)).toContainText(marker);
    await expect.poll(() => persistedResourceContent(page, resource.slug), { timeout: 15_000 }).toContain(marker);

    await page.reload();
    await expect(compactEditor(page)).toContainText(marker);
  });
});
