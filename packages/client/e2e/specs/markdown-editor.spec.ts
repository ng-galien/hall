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

async function createWorkspaceText(
  page: Page,
  title: string,
  content = "Contenu initial du test.",
): Promise<{ id: string; slug: string; title: string }> {
  const created = await page.request.post("/api/resources/texts", {
    data: { title, folderPath: "seed", tags: ["seed", "e2e"], content },
  });
  expect(created.ok()).toBe(true);
  const response = await page.request.get("/api/resources?kind=text");
  expect(response.ok()).toBe(true);
  const representation = (await response.json()) as {
    entities: Array<{ properties: { id: string; slug: string; title: string } }>;
  };
  const resource = representation.entities.map(({ properties }) => properties).find((item) => item.title === title);
  expect(resource).toBeTruthy();
  return resource!;
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

async function openResourceEmbedSearch(editor: Locator): Promise<Locator> {
  await editor.getByTestId("editor-insert-resource-embed").click();
  const dialog = editor.page().getByTestId("resource-embed-search-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function firstPdfResource(page: Page): Promise<{ id: string; title: string }> {
  const response = await page.request.get("/api/resources?kind=document");
  expect(response.ok()).toBe(true);
  const representation = (await response.json()) as {
    entities: Array<{ properties: { id: string; title: string; mediaType: string } }>;
  };
  const resource = representation.entities
    .map(({ properties }) => properties)
    .find(({ mediaType }) => mediaType === "application/pdf");
  expect(resource).toBeTruthy();
  return resource!;
}

async function firstSpreadsheetResource(page: Page): Promise<{ id: string; title: string; sheetId: string }> {
  const response = await page.request.get("/api/resources?kind=spreadsheet");
  expect(response.ok()).toBe(true);
  const representation = (await response.json()) as {
    entities: Array<{ properties: { id: string; title: string } }>;
  };
  const resource = representation.entities.map(({ properties }) => properties)[0];
  expect(resource).toBeTruthy();
  const detailsResponse = await page.request.get(`/api/resources/${resource!.id}`);
  expect(detailsResponse.ok()).toBe(true);
  const details = (await detailsResponse.json()) as {
    properties: { spreadsheet: { workbook: { sheetOrder: string[] } } };
  };
  const sheetId = details.properties.spreadsheet.workbook.sheetOrder[0];
  expect(sheetId).toBeTruthy();
  return { ...resource!, sheetId };
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
  test("keeps asynchronously prepared Lab resources in the editor and rendered Markdown", async ({ appPage: page }) => {
    await openEditorLab(page);

    const resourceResponse = await page.request.get("/api/resources");
    expect(resourceResponse.ok()).toBe(true);
    const resourceRepresentation = (await resourceResponse.json()) as {
      entities: Array<{ properties: { kind: string; mediaType?: string; title: string } }>;
    };
    const availableResources = resourceRepresentation.entities.map(({ properties }) => properties);
    expect(
      availableResources.some(({ kind, mediaType }) => kind === "document" && mediaType?.startsWith("image/")),
      JSON.stringify(availableResources),
    ).toBe(true);
    expect(
      availableResources.some(({ kind, mediaType }) => kind === "document" && mediaType === "application/pdf"),
      JSON.stringify(availableResources),
    ).toBe(true);
    for (const kind of ["remote", "geographic", "spreadsheet"]) {
      expect(
        availableResources.some((resource) => resource.kind === kind),
        `${kind}: ${JSON.stringify(availableResources)}`,
      ).toBe(true);
    }

    const source = markdownSource(page);
    await expect(source).toContainText("::resource-embed[");
    await expect(compactEditor(page).locator("img[alt]").first()).toBeVisible();
    await page.waitForTimeout(500);
    await expect(source).toContainText("::resource-embed[");
    await expect(renderedDocument(page).getByTestId("resource-embed-presentation-map")).toBeVisible();
  });

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
      "editor-insert-resource-embed",
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
    const creationResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/templates/preview-pdf?delivery=url") && response.request().method() === "POST",
    );
    const nativePdfResponse = page.waitForResponse(
      (response) =>
        /\/api\/templates\/preview-pdf\/[0-9a-f-]+$/.test(response.url()) && response.request().method() === "GET",
    );
    await page.getByTestId("editor-pdf-preview").click();
    expect((await creationResponse).status()).toBe(201);
    expect((await nativePdfResponse).status()).toBe(200);
    const viewer = page.getByTestId("editor-pdf-native-viewer");
    await expect(viewer).toBeVisible();
    await expect(viewer.locator("iframe")).toHaveAttribute("src", /\/api\/templates\/preview-pdf\/[0-9a-f-]+$/);
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

  test("inserts the six typed references with their immutable UUIDs", async ({ appPage: page }) => {
    await openEditorLab(page);
    const editor = await openEnrichedEditor(page);
    const source = markdownSource(page);
    const kinds = ["member", "contact", "resource", "councilBusiness", "meeting", "decision"] as const;

    for (const directive of kinds) {
      const dialog = await openReferenceSearch(editor);
      await dialog.getByTestId(`reference-kind-${directive}`).click();
      await dialog.getByTestId("reference-result").first().click();
      await expect(source).toHaveText(new RegExp(`:${directive}\\[[^\\]]+\\]\\{#[0-9a-f-]{36}\\}`));
    }
    const markdown = await source.textContent();
    expect(markdown).not.toContain("/api/");
    expect(markdown).not.toContain("slug=");

    const ids = Object.fromEntries(
      kinds.map((kind) => {
        const id = new RegExp(`:${kind}\\[[^\\]]+\\]\\{#([0-9a-f-]{36})\\}`).exec(markdown ?? "")?.[1];
        expect(id, `${kind} reference id`).toBeTruthy();
        return [kind, id as string];
      }),
    ) as Record<(typeof kinds)[number], string>;
    await closeEnrichedEditor(page);
    const rendered = compactEditor(page);
    await expect(rendered.getByTestId(`editor-resource-reference-${ids.resource}`)).toBeVisible();
    await expect(rendered.getByTestId(`editor-member-reference-${ids.member}`)).toHaveAttribute(
      "href",
      new RegExp(`/app/council-members/${ids.member}$`),
    );
    await expect(rendered.getByTestId(`editor-contact-reference-${ids.contact}`)).toHaveAttribute(
      "href",
      new RegExp(`/app/contacts/${ids.contact}$`),
    );
    await expect(rendered.getByTestId(`editor-councilBusiness-reference-${ids.councilBusiness}`)).toHaveAttribute(
      "href",
      /\/app\/workspace\?.*councilBusiness=/,
    );
    await expect(rendered.getByTestId(`editor-meeting-reference-${ids.meeting}`)).toHaveAttribute(
      "href",
      /\/app\/meetings\//,
    );
    await expect(rendered.getByTestId(`editor-decision-reference-${ids.decision}`)).toHaveAttribute(
      "href",
      /\/app\/workspace\?.*councilBusiness=/,
    );
  });

  test("opens a text resource in the common modal, edits in place, and returns to the snippet", async ({
    appPage: page,
  }) => {
    const resource = await createWorkspaceText(page, "Texte modal E2E");

    await openEditorLab(page);
    const editor = await openEnrichedEditor(page);
    const search = await openReferenceSearch(editor);
    await search.getByTestId("reference-kind-resource").click();
    await search.getByTestId("reference-search-input").fill(resource.title);
    await search.getByTestId("reference-result").first().click();
    await closeEnrichedEditor(page);

    const trigger = compactEditor(page).getByTestId(`editor-resource-reference-${resource.id}`);
    await expect(trigger).toBeVisible();
    const routeBefore = page.url();
    await trigger.click();
    const modal = page.getByTestId("resource-preview");
    await expect(modal).toHaveAttribute("data-resource-mode", "edit");
    const modalEditor = modal.getByTestId("markdown-editor-enriched");
    await expect(modalEditor).toBeVisible();
    await expect(modal.locator('[data-testid="spreadsheet-fullscreen-dialog"]')).toHaveCount(0);
    const updatedContent = "Texte modifié depuis la vue étendue";
    await replaceEditorText(modalEditor, updatedContent);
    await expect
      .poll(() => persistedResourceContent(page, resource.slug), { timeout: 15_000 })
      .toContain(updatedContent);
    await modal.getByTestId("resource-preview-close").click();
    await expect(modal).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(page.url()).toBe(routeBefore);
    await trigger.click();
    await expect(page.getByTestId("markdown-editor-enriched")).toContainText(updatedContent);
  });

  test("inserts a PDF resource block, persists its canonical Markdown and reopens the common modal", async ({
    appPage: page,
  }) => {
    const pdf = await firstPdfResource(page);
    const text = await createWorkspaceText(page, "Inclusion PDF E2E");
    await page.goto(`/app/workspace?path=seed&resource=${encodeURIComponent(text.id)}`);
    await expect(compactEditor(page)).toBeVisible();
    const editor = await openEnrichedEditor(page);
    const search = await openResourceEmbedSearch(editor);
    await search.getByTestId("reference-search-input").fill(pdf.title);
    await search.getByTestId("reference-result").first().click();

    await expect(editor.getByTestId(`editor-resource-embed-${pdf.id}`)).toBeVisible();
    await expect(editor.getByTestId("resource-embed-presentation-document")).toBeVisible();
    await closeEnrichedEditor(page);

    const directive = `::resource-embed[${pdf.title}]{#${pdf.id} presentation="document"}`;
    await expect.poll(() => persistedResourceContent(page, text.slug), { timeout: 15_000 }).toContain(directive);
    await page.reload();

    const block = compactEditor(page).getByTestId(`editor-resource-embed-${pdf.id}`);
    await expect(block).toBeVisible();
    const nativePdfResponse = page.waitForResponse(
      (response) => /\/api\/resources\/[^/]+\/preview$/.test(response.url()) && response.request().method() === "GET",
    );
    await block.click();
    const modal = page.getByTestId("resource-preview");
    const loadedPdf = await nativePdfResponse;
    expect(loadedPdf.status()).toBe(200);
    expect(loadedPdf.headers()["content-type"]).toContain("application/pdf");
    await expect(modal.getByTestId("resource-preview-object")).toHaveAttribute("src", /\/preview$/);
    await modal.getByTestId("resource-preview-close").click();
    await expect(modal).toHaveCount(0);
    await expect(block).toBeFocused();
    await block.press("Enter");
    await expect(page.getByTestId("resource-preview")).toBeVisible();
  });

  test("sends an inserted resource presentation to the authoritative PDF preview", async ({ appPage: page }) => {
    const pdf = await firstPdfResource(page);
    await openEditorLab(page);
    const editor = await openEnrichedEditor(page);
    const search = await openResourceEmbedSearch(editor);
    await search.getByTestId("reference-search-input").fill(pdf.title);
    await search.getByTestId("reference-result").first().click();

    await expect(markdownSource(page)).toContainText(
      `::resource-embed[${pdf.title}]{#${pdf.id} presentation="document"}`,
    );
    await closeEnrichedEditor(page);
    const creationResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/templates/preview-pdf?delivery=url") && response.request().method() === "POST",
    );
    const nativePdfResponse = page.waitForResponse(
      (response) =>
        /\/api\/templates\/preview-pdf\/[0-9a-f-]+$/.test(response.url()) && response.request().method() === "GET",
    );
    await page.getByTestId("editor-pdf-preview").click();
    expect((await creationResponse).status()).toBe(201);
    const loadedPdf = await nativePdfResponse;
    expect(loadedPdf.status()).toBe(200);
    expect(loadedPdf.headers()["content-type"]).toContain("application/pdf");
    await expect(page.getByTestId("editor-pdf-native-viewer").locator("iframe")).toHaveAttribute(
      "src",
      /\/api\/templates\/preview-pdf\/[0-9a-f-]+$/,
    );
  });

  test("includes a bounded spreadsheet range, opens the common editor, and exports it to PDF", async ({
    appPage: page,
  }) => {
    test.setTimeout(60_000);
    const spreadsheet = await firstSpreadsheetResource(page);
    await openEditorLab(page);
    const editor = await openEnrichedEditor(page);
    await writingArea(editor).click();
    await writingArea(editor).press("ControlOrMeta+A");
    await writingArea(editor).press("Backspace");
    const search = await openResourceEmbedSearch(editor);
    await search.getByTestId("reference-search-input").fill(spreadsheet.title);
    await search.getByTestId("reference-result").first().click();

    const options = page.getByTestId("resource-embed-table-options");
    await expect(options).toBeVisible();
    await expect(options.getByTestId("resource-embed-table-sheet")).not.toHaveText("");
    await expect(options.getByTestId("resource-embed-table-range")).toHaveValue(/^[A-Z]+\d+:[A-Z]+\d+$/);
    await options.getByTestId("resource-embed-table-submit").click();

    const block = editor.getByTestId(`editor-resource-embed-${spreadsheet.id}`);
    await expect(block).toBeVisible();
    await expect(editor.getByTestId("resource-embed-presentation-table")).toBeVisible();
    await expect(markdownSource(page)).toHaveText(
      new RegExp(
        `::resource-embed\\[${spreadsheet.title}\\]\\{#${spreadsheet.id} presentation="table" sheet="[^"]+" range="[A-Z]+\\d+:[A-Z]+\\d+"\\}`,
      ),
    );

    const routeBefore = page.url();
    const table = editor.getByTestId("resource-embed-presentation-table");
    const modal = page.getByTestId("resource-preview");
    await table.click();
    await expect(modal).toHaveCount(0);
    await table.hover();
    await expect(editor.getByTestId(`editor-resource-embed-${spreadsheet.id}-info`)).toBeVisible();
    await block.click();
    await expect(modal).toHaveAttribute("data-resource-mode", "edit");
    await expect(modal.getByTestId("spreadsheet-editor")).toBeVisible({ timeout: 15_000 });
    await expect(modal.getByTestId("spreadsheet-fullscreen-dialog")).toHaveCount(0);
    const close = modal.getByTestId("resource-preview-close");
    const closeBounds = await close.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, viewportWidth: window.innerWidth };
    });
    expect(closeBounds.left).toBeGreaterThanOrEqual(0);
    expect(closeBounds.right).toBeLessThanOrEqual(closeBounds.viewportWidth);
    await close.click();
    await expect(modal).toHaveCount(0);
    await expect(block).toBeFocused();
    expect(page.url()).toBe(routeBefore);

    await closeEnrichedEditor(page);
    const creationResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/templates/preview-pdf?delivery=url") && response.request().method() === "POST",
    );
    const nativePdfResponse = page.waitForResponse(
      (response) =>
        /\/api\/templates\/preview-pdf\/[0-9a-f-]+$/.test(response.url()) && response.request().method() === "GET",
    );
    await page.getByTestId("editor-pdf-preview").click();
    expect((await creationResponse).status()).toBe(201);
    const loadedPdf = await nativePdfResponse;
    expect(loadedPdf.status()).toBe(200);
    expect(loadedPdf.headers()["content-type"]).toContain("application/pdf");
    await expect(page.getByTestId("editor-pdf-native-viewer").locator("iframe")).toHaveAttribute(
      "src",
      /\/api\/templates\/preview-pdf\/[0-9a-f-]+$/,
    );
  });

  test("rejects a stored oversized spreadsheet range before rendering cells", async ({ appPage: page }) => {
    const spreadsheet = await firstSpreadsheetResource(page);
    const directive = `::resource-embed[${spreadsheet.title}]{#${spreadsheet.id} presentation="table" sheet="${spreadsheet.sheetId}" range="A1:A999999999"}`;
    const text = await createWorkspaceText(page, "Plage tableur invalide E2E", directive);
    await page.goto(`/app/workspace?path=seed&resource=${encodeURIComponent(text.id)}`);

    const editor = compactEditor(page);
    await expect(editor.getByTestId(`editor-resource-embed-${spreadsheet.id}`)).toBeVisible();
    await expect(editor.locator(".editor-resource-embed-unavailable")).toBeVisible();
    await expect(editor.getByTestId("resource-embed-presentation-table")).toHaveCount(0);
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

    const image = editor.locator(".editor-image-node img").last();
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
