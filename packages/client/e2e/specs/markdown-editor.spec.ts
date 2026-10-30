import { resourceKinds } from "@hall/api-contract";
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
  return editor.getByTestId("editor-writing-area");
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
  await writingArea(compactEditor(page)).click();
  await compactEditor(page).getByTestId("editor-open-enriched").click();
  const editor = enrichedEditor(page);
  await expect(editor).toBeVisible();
  return editor;
}

async function openCompactFormattingMenu(page: Page): Promise<void> {
  const compact = compactEditor(page);
  await writingArea(compact).click();
  await compact.getByTestId("editor-formatting-menu").click();
  await expect(page.getByTestId("editor-formatting-bold")).toBeVisible();
}

async function closeEnrichedEditor(page: Page): Promise<void> {
  await page.getByTestId("editor-enriched-dialog").getByTestId("dialog-close").click();
  await expect(enrichedEditor(page)).toBeHidden();
}

async function openWorkspaceText(page: Page): Promise<{ id: string; slug: string; name: string }> {
  const resource = await createWorkspaceText(page, `Editor lifecycle ${crypto.randomUUID()}`);
  await page.goto(`/app/workspace?path=seed&resource=${encodeURIComponent(resource.id)}`);
  await expect(compactEditor(page)).toBeVisible();
  return resource;
}

async function createWorkspaceText(
  page: Page,
  name: string,
  content = "Contenu initial du test.",
): Promise<{ id: string; slug: string; name: string }> {
  const created = await page.request.post("/api/resources", {
    data: { kind: "text", name, path: "seed", content },
  });
  expect(created.ok()).toBe(true);
  const representation = (await created.json()) as {
    properties: { id: string; slug: string; name: string };
  };
  expect(representation.properties.name).toBe(name);
  return representation.properties;
}

async function persistedResourceContent(page: Page, slug: string): Promise<string> {
  const response = await page.request.get(`/api/resources/${slug}`);
  expect(response.ok()).toBe(true);
  const representation = (await response.json()) as { properties: { content: string } };
  return representation.properties.content;
}

async function replaceEditorText(editor: Locator, value: string): Promise<void> {
  const area = writingArea(editor);
  await area.click();
  await area.press("ControlOrMeta+A");
  if (value === "") await area.press("Backspace");
  else await area.pressSequentially(value);
}

async function openReferenceSearch(editor: Locator): Promise<Locator> {
  if (await editor.evaluate((element) => element.classList.contains("markdown-editor-compact"))) {
    await writingArea(editor).click();
    await expect(editor.locator('[role="toolbar"]')).toHaveAttribute("data-visible", "true");
  }
  await editor.getByTestId("editor-insert-reference").click();
  const dialog = editor.page().getByTestId("reference-search-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openResourceEmbedSearch(editor: Locator): Promise<Locator> {
  await editor.getByTestId("editor-insert-reference").click();
  const dialog = editor.page().getByTestId("reference-search-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function firstPdfResource(page: Page): Promise<{ id: string; name: string }> {
  const response = await page.request.get("/api/resources/search?kinds=document");
  expect(response.ok()).toBe(true);
  const representation = (await response.json()) as {
    properties: { items: Array<{ id: string; name: string; binary: { mediaType: string } }> };
  };
  const resource = representation.properties.items.find(({ binary }) => binary.mediaType === "application/pdf");
  expect(resource).toBeTruthy();
  return resource!;
}

async function firstSpreadsheetResource(page: Page): Promise<{ id: string; name: string; sheetId: string }> {
  const response = await page.request.get("/api/resources/search?kinds=spreadsheet");
  expect(response.ok()).toBe(true);
  const representation = (await response.json()) as {
    properties: { items: Array<{ id: string; name: string }> };
  };
  const resource = representation.properties.items[0];
  expect(resource).toBeTruthy();
  const detailsResponse = await page.request.get(`/api/resources/${resource!.id}`);
  expect(detailsResponse.ok()).toBe(true);
  const details = (await detailsResponse.json()) as {
    properties: { document: { workbook: { sheetOrder: string[] } } };
  };
  const sheetId = details.properties.document.workbook.sheetOrder[0];
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

    const resourceResponse = await page.request.get(
      "/api/resources/search?kinds=document,remote,geographic,spreadsheet,legalReference",
    );
    expect(resourceResponse.ok()).toBe(true);
    const resourceRepresentation = (await resourceResponse.json()) as {
      properties: {
        items: Array<{ kind: string; binary?: { mediaType: string }; name: string }>;
      };
    };
    const availableResources = resourceRepresentation.properties.items;
    expect(
      availableResources.some(({ kind, binary }) => kind === "document" && binary?.mediaType.startsWith("image/")),
      JSON.stringify(availableResources),
    ).toBe(true);
    expect(
      availableResources.some(({ kind, binary }) => kind === "document" && binary?.mediaType === "application/pdf"),
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

  // @verifies-requirement HALL-FR-DOC-270
  test("exposes the same editing commands through compact and fullscreen controls", async ({ appPage: page }) => {
    await openEditorLab(page);

    const compact = compactEditor(page);
    await writingArea(compact).click();
    await expect(compact.getByTestId("editor-insert-reference")).toHaveCount(1);
    for (const testId of ["editor-formatting-menu", "editor-insert-reference", "editor-open-enriched"]) {
      await expect(compact.getByTestId(testId)).toBeVisible();
    }
    for (const testId of ["editor-bold", "editor-underline", "editor-insert-table", "editor-link"]) {
      await expect(compact.getByTestId(testId)).toHaveCount(0);
    }
    await openCompactFormattingMenu(page);
    for (const testId of [
      "editor-formatting-bold",
      "editor-formatting-italic",
      "editor-formatting-underline",
      "editor-formatting-code",
      "editor-formatting-bullet-list",
      "editor-formatting-numbered-list",
      "editor-formatting-checklist",
      "editor-formatting-indent",
      "editor-formatting-outdent",
      "editor-formatting-link",
      "editor-formatting-insert-table",
    ]) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
    await page.keyboard.press("Escape");

    const enriched = await openEnrichedEditor(page);
    for (const testId of [
      "editor-undo",
      "editor-redo",
      "editor-bold",
      "editor-italic",
      "editor-underline",
      "editor-code",
      "editor-bullet-list",
      "editor-numbered-list",
      "editor-link",
      "editor-insert-table",
      "editor-insert-reference",
    ]) {
      await expect(enriched.getByTestId(testId)).toBeVisible();
    }
    for (const testId of ["editor-insert-image", "editor-upload-image"]) {
      await expect(enriched.getByTestId(testId)).toHaveCount(0);
    }
  });

  // @verifies-requirement HALL-FR-DOC-270
  test("keeps the compact overlay visible while one of its controls has keyboard focus", async ({ appPage: page }) => {
    await openEditorLab(page);
    const compact = compactEditor(page);
    const toolbar = compact.locator('[role="toolbar"]');
    await writingArea(compact).click();
    await expect(toolbar).toHaveAttribute("data-visible", "true");
    await compact.getByTestId("editor-open-enriched").focus();
    await expect(compact.getByTestId("editor-open-enriched")).toBeFocused();
    await page.waitForTimeout(2_600);
    await expect(toolbar).toHaveAttribute("data-visible", "true");
    await expect(compact.getByTestId("editor-open-enriched")).toBeVisible();
  });

  test("selects an existing image and exposes its contextual controls in compact mode", async ({ appPage: page }) => {
    await openEditorLab(page);
    const compact = compactEditor(page);
    const image = compact.getByTestId(/^editor-image-[0-9a-f-]{36}$/).first();
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
    await page.getByTestId("editor-pdf-preview-with-documents").click();
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
    await editor.getByTestId("editor-underline").click();
    await expect(source).toContainText("++Control mark++");
    await expect(renderedDocument(page).locator("u")).toHaveText("Control mark");
    await writingArea(editor).press("ControlOrMeta+A");
    await editor.getByTestId("editor-underline").click();
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

    await editor.getByTestId("editor-table-header").first().click();
    await editor.getByTestId("editor-table-column-menu").click();
    await page.getByTestId("editor-table-align-center").click();
    await expect(markdownSource(page)).toContainText(/:--+:/);

    await editor.getByTestId("editor-table-header").first().click();
    await editor.getByTestId("editor-table-column-menu").click();
    await page.getByTestId("editor-table-widen-column").click();
    await expect(markdownSource(page)).toContainText(/colwidth=["']\d+["']/);

    const firstHeader = editor.getByTestId("editor-table-header").first();
    await firstHeader.click();
    await editor
      .getByTestId("editor-table-header")
      .nth(1)
      .click({ modifiers: ["Shift"] });
    await editor.getByTestId("editor-table-merge").click();
    await expect(table.getByRole("row").first().getByRole("columnheader")).toHaveCount(3);
    await expect(markdownSource(page)).toContainText(/colspan=["']2["']/);
    await editor.getByTestId("editor-table-split").click();
    await expect(table.getByRole("row").first().getByRole("columnheader")).toHaveCount(4);
    await closeEnrichedEditor(page);
    await expect(compactEditor(page).getByRole("table").filter({ hasText: "Tilleuls" })).toBeVisible();
    await expect(compactEditor(page)).toContainText("Tilleuls");
    await expect(renderedDocument(page).getByRole("table").filter({ hasText: "Tilleuls" })).toBeVisible();
    await openEnrichedEditor(page);
    await expect(enrichedEditor(page).getByRole("table").filter({ hasText: "Tilleuls" })).toBeVisible();
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
    await expect(compactEditor(page).getByRole("table").filter({ hasText: "Harmonie" })).toContainText("1800");
  });

  test.describe("typed references from an existing decision", () => {
    test.use({ seedScenario: "default" });

    test("inserts the five non-resource typed references with their immutable UUIDs", async ({ appPage: page }) => {
      const decisionResponse = await page.request.get("/api/council-decisions");
      expect(decisionResponse.ok()).toBe(true);
      const decisionId = (await decisionResponse.json()).entities[0]?.properties.id;
      expect(decisionId).toBeTruthy();
      await openEditorLab(page);
      const editor = await openEnrichedEditor(page);
      const source = markdownSource(page);
      const kinds = ["member", "contact", "councilBusiness", "meeting", "decision"] as const;

      for (const directive of kinds) {
        const dialog = await openReferenceSearch(editor);
        await dialog.getByTestId("reference-search-add-filter").click();
        await dialog.getByTestId("reference-search-filter-category-type").click();
        await dialog.getByTestId(`reference-search-filter-type-${directive}`).click();
        const results = dialog.getByTestId("reference-search-result");
        await (directive === "decision"
          ? results.and(page.locator(`[data-reference-id="${decisionId}"]`))
          : results.first()
        ).click();
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
        new RegExp(`/app/council-decisions/${ids.decision}$`),
      );
    });
  });

  // @verifies-requirement HALL-FR-DOC-480
  test("opens a text resource in the common modal with the user's rights and returns to the snippet", async ({
    appPage: page,
  }) => {
    const resource = await createWorkspaceText(page, "Texte modal E2E");

    await openEditorLab(page);
    const editor = await openEnrichedEditor(page);
    const search = await openReferenceSearch(editor);
    await search.getByTestId("reference-search-input").fill(resource.name);
    await search.getByTestId("reference-search-result").first().click();
    await closeEnrichedEditor(page);

    const trigger = compactEditor(page).getByTestId(`editor-resource-embed-${resource.id}`);
    await expect(trigger).toBeVisible();
    const routeBefore = page.url();
    await trigger.click();
    const modal = page.getByTestId("resource-preview");
    await expect(modal).toHaveAttribute("data-resource-mode", "edit");
    await expect(modal.getByTestId("editor-writing-area")).toContainText("Contenu initial du test.");
    await expect(modal.locator('[data-testid="spreadsheet-fullscreen-dialog"]')).toHaveCount(0);
    await modal.getByTestId("resource-preview-close").click();
    await expect(modal).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(page.url()).toBe(routeBefore);
    await trigger.click();
    await expect(page.getByTestId("resource-preview")).toHaveAttribute("data-resource-mode", "edit");
  });

  test("inserts an inline PDF reference, persists its canonical Markdown and reopens the common modal", async ({
    appPage: page,
  }) => {
    const pdf = await firstPdfResource(page);
    const text = await createWorkspaceText(page, "Inclusion PDF E2E");
    await page.goto(`/app/workspace?path=seed&resource=${encodeURIComponent(text.id)}`);
    await expect(compactEditor(page)).toBeVisible();
    const editor = await openEnrichedEditor(page);
    const search = await openResourceEmbedSearch(editor);
    await search.getByTestId("reference-search-input").fill(pdf.name);
    await search.getByTestId("reference-search-result").first().click();

    await expect(editor.getByTestId(`editor-resource-reference-${pdf.id}`)).toBeVisible();
    await expect(editor.getByTestId(`editor-resource-embed-${pdf.id}`)).toHaveCount(0);
    await closeEnrichedEditor(page);

    const directive = `:resource[${pdf.name}]{#${pdf.id}}`;
    await expect.poll(() => persistedResourceContent(page, text.slug), { timeout: 15_000 }).toContain(directive);
    await page.reload();

    const reference = compactEditor(page).getByTestId(`editor-resource-reference-${pdf.id}`);
    await expect(reference).toBeVisible();
    const nativePdfResponse = page.waitForResponse(
      (response) => /\/api\/resources\/[^/]+\/preview$/.test(response.url()) && response.request().method() === "GET",
    );
    await reference.click();
    const modal = page.getByTestId("resource-preview");
    const loadedPdf = await nativePdfResponse;
    expect(loadedPdf.status()).toBe(200);
    expect(loadedPdf.headers()["content-type"]).toContain("application/pdf");
    await expect(modal.getByTestId("resource-preview-object")).toHaveAttribute("src", /\/preview$/);
    await modal.getByTestId("resource-preview-close").click();
    await expect(modal).toHaveCount(0);
    await expect(reference).toBeFocused();
    await reference.press("Enter");
    await expect(page.getByTestId("resource-preview")).toBeVisible();
  });

  test("sends an inserted inline resource reference to the authoritative PDF preview", async ({ appPage: page }) => {
    const pdf = await firstPdfResource(page);
    await openEditorLab(page);
    const editor = await openEnrichedEditor(page);
    const search = await openResourceEmbedSearch(editor);
    await search.getByTestId("reference-search-input").fill(pdf.name);
    await search.getByTestId("reference-search-result").first().click();

    await expect(markdownSource(page)).toContainText(`:resource[${pdf.name}]{#${pdf.id}}`);
    const preview = await page.request.post("/api/templates/preview", {
      data: { kind: "pdf", bodyMarkdown: await markdownSource(page).innerText() },
    });
    expect(preview.status()).toBe(200);
    const diagnostics = (await preview.json()).properties.diagnostics as Array<{ code: string; severity: string }>;
    expect(
      diagnostics.filter((entry) => entry.severity === "error"),
      JSON.stringify(diagnostics),
    ).toEqual([]);
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
    await page.getByTestId("editor-pdf-preview-with-documents").click();
    expect((await creationResponse).status()).toBe(201);
    const loadedPdf = await nativePdfResponse;
    expect(loadedPdf.status()).toBe(200);
    expect(loadedPdf.headers()["content-type"]).toContain("application/pdf");
    await expect(page.getByTestId("editor-pdf-native-viewer").locator("iframe")).toHaveAttribute(
      "src",
      /\/api\/templates\/preview-pdf\/[0-9a-f-]+$/,
    );
  });

  test("includes a bounded spreadsheet range, opens its preview with the user's rights, and exports it to PDF", async ({
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
    await search.getByTestId("reference-search-input").fill(spreadsheet.name);
    await search.getByTestId("reference-search-result").first().click();

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
        `::resource-embed\\[${spreadsheet.name}\\]\\{#${spreadsheet.id} presentation="table" sheet="[^"]+" range="[A-Z]+\\d+:[A-Z]+\\d+"\\}`,
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
    await expect(modal.getByTestId("spreadsheet-grid")).toHaveAttribute("aria-readonly", "false", {
      timeout: 15_000,
    });
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
    await page.getByTestId("editor-pdf-preview-with-documents").click();
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
    const directive = `::resource-embed[${spreadsheet.name}]{#${spreadsheet.id} presentation="table" sheet="${spreadsheet.sheetId}" range="A1:A999999999"}`;
    const text = await createWorkspaceText(page, "Plage tableur invalide E2E", directive);
    await page.goto(`/app/workspace?path=seed&resource=${encodeURIComponent(text.id)}`);

    const editor = compactEditor(page);
    await expect(editor.getByTestId(`editor-resource-embed-${spreadsheet.id}`)).toBeVisible();
    await expect(editor.locator(".editor-resource-embed-unavailable")).toBeVisible();
    await expect(editor.getByTestId("resource-embed-presentation-table")).toHaveCount(0);
  });

  test("inserts a seeded image and resizes it without distortion or render drift", async ({ appPage: page }) => {
    await openEditorLab(page);
    const editor = await openEnrichedEditor(page);
    const search = await openReferenceSearch(editor);
    await search.getByTestId("reference-search-input").fill("Plan du plateau de Cornu");
    const imageOption = search.getByTestId("reference-search-result").first();
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
    await expect(renderedDocument(page).locator(`img[alt="${imageAlt}"]`).last()).toBeVisible();

    await editor.getByTestId("editor-image-open").click();
    const viewer = page.getByTestId("resource-preview");
    await expect(viewer).toBeVisible();
    await expect(viewer.locator("object")).toHaveAttribute("type", "image/png");
    await viewer.getByTestId("resource-preview-close").click();
  });

  test("imports, autosaves, reloads and purges an editor asset from a real workbench", async ({ appPage: page }) => {
    const resource = await openWorkspaceText(page);
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
      properties: { id: string; title: string; owner: { kind: string; id: string } };
    };
    const assetId = representation.properties.id;
    expect(representation.properties).toMatchObject({
      owner: { kind: "textResourceContent" },
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
    const compactImage = compactEditor(page).getByTestId(`editor-image-${assetId}`);
    await expect(compactImage).toBeVisible();
    await compactImage.click();
    await expect(compactEditor(page).getByTestId("editor-image-width")).toBeVisible();

    await page.keyboard.press("Backspace");
    await expect(compactImage).toHaveCount(0);
    await expect.poll(() => persistedResourceContent(page, resource.slug), { timeout: 15_000 }).not.toContain(assetId);
    await expect
      .poll(async () => (await page.request.get(`/api/resources/editor-assets/${assetId}`)).status())
      .toBe(404);
  });

  test("imports an image by drag and drop in a fullscreen workbench", async ({ appPage: page }) => {
    const resource = await openWorkspaceText(page);
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
    const compactImage = compactEditor(page).getByTestId(`editor-image-${representation.properties.id}`);
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

test("preserves nested lists and checklists across editor modes and reload", async ({ appPage: page }) => {
  const resource = await createWorkspaceText(page, `Lists ${crypto.randomUUID()}`, "- First\n- Second");
  await page.goto(`/app/workspace?path=seed&resource=${resource.id}`);
  const compact = compactEditor(page);
  await writingArea(compact).click();
  await writingArea(compact).press("ControlOrMeta+End");
  await writingArea(compact).press("ArrowUp");
  await openCompactFormattingMenu(page);
  await page.getByTestId("editor-formatting-indent").click();
  await expect
    .poll(async () => (await (await page.request.get(`/api/resources/${resource.id}`)).json()).properties.content)
    .toMatch(/\n\s{2,}- Second/);
  await openCompactFormattingMenu(page);
  await page.getByTestId("editor-formatting-outdent").click();
  await expect
    .poll(async () => (await (await page.request.get(`/api/resources/${resource.id}`)).json()).properties.content)
    .toMatch(/\n- Second/);
  await openCompactFormattingMenu(page);
  await page.getByTestId("editor-formatting-checklist").click();
  const assertChecklistAlignment = async (editor: Locator) => {
    const item = editor.getByTestId("editor-task-item").last();
    await expect(item).toHaveCSS("display", "flex");
    const layout = await item.evaluate((element) => {
      const checkbox = element.querySelector("input")!.getBoundingClientRect();
      const text = element.querySelector("p")!.getBoundingClientRect();
      return {
        checkboxRight: checkbox.right,
        textLeft: text.left,
        checkboxY: checkbox.y + checkbox.height / 2,
        textTop: text.top,
        textBottom: text.bottom,
      };
    });
    expect(layout.textLeft).toBeGreaterThan(layout.checkboxRight);
    expect(layout.checkboxY).toBeGreaterThanOrEqual(layout.textTop);
    expect(layout.checkboxY).toBeLessThanOrEqual(layout.textBottom);
  };
  await assertChecklistAlignment(compact);
  await compact
    .getByTestId("editor-task-item")
    .last()
    .click({ position: { x: 7, y: 8 } });
  await expect(compact.getByTestId("editor-task-item").last()).toHaveAttribute("data-checked", "true");
  const enriched = await openEnrichedEditor(page);
  await assertChecklistAlignment(enriched);
  await expect(enriched.getByTestId("editor-task-item").last()).toHaveAttribute("data-checked", "true");
  await closeEnrichedEditor(page);
  await expect
    .poll(async () => (await (await page.request.get(`/api/resources/${resource.id}`)).json()).properties.content)
    .toContain("[x] Second");
  await page.reload();
  await expect(compactEditor(page).getByTestId("editor-task-item").last()).toHaveAttribute("data-checked", "true");
});

// @verifies-requirement HALL-FR-SRC-010
// @verifies-requirement HALL-FR-SRC-020
// @verifies-requirement HALL-FR-SRC-030
test("HALL-FR-SRC shared title search, filters and inline selection", async ({ appPage: page }) => {
  await page.evaluate(() => localStorage.setItem("mairie.locale", "fr"));
  const resource = await createWorkspaceText(
    page,
    "Travaux de l’école — rapport préparatoire",
    "InvisibleContentMarker",
  );
  await openEditorLab(page);
  const editor = compactEditor(page);
  const dialog = await openReferenceSearch(editor);
  const input = dialog.getByTestId("reference-search-input");
  await input.fill(resource.name);
  const selected = dialog
    .getByTestId("reference-search-result")
    .and(page.locator(`[data-reference-id="${resource.id}"]`));
  await expect(selected).toBeVisible();
  await input.fill("InvisibleContentMarker");
  await expect(dialog.getByTestId("reference-search-empty")).toBeVisible();
  await input.fill("");
  await dialog.getByTestId("reference-search-add-filter").click();
  await dialog.getByTestId("reference-search-filter-category-type").click();
  await dialog.getByTestId("reference-search-filter-type-text").click();
  await expect(dialog.getByTestId("reference-search-remove-type-text")).toBeVisible();
  await input.fill(resource.name);
  await expect(selected).toBeVisible();
  await page.screenshot({ path: "/tmp/hall-shared-search.png" });
  await dialog.getByTestId("dialog-close").click();
  await replaceEditorText(editor, `@${resource.name.split(" ")[0]}`);
  const inline = page.getByTestId("editor-mention-panel");
  await expect(inline).toBeVisible();
  await writingArea(editor).press("End");
  await writingArea(editor).pressSequentially(" #");
  await expect(inline.getByTestId("editor-mention-input")).toBeHidden();
  await expect(inline.getByTestId("editor-mention-filter-category-type")).toHaveCount(0);
  await expect(inline.getByTestId("editor-mention-filter-type-member")).toBeVisible();
  await expect(writingArea(editor)).toBeFocused();
  const hashCenter = await writingArea(editor).evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const offset = node.textContent?.lastIndexOf("#") ?? -1;
      if (offset < 0) continue;
      const range = document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, offset + 1);
      const rect = range.getBoundingClientRect();
      return (rect.top + rect.bottom) / 2;
    }
    throw new Error("Missing filter anchor");
  });
  const expectCentered = async () => {
    await expect
      .poll(async () => {
        const rect = await inline.locator('[data-active="true"]').boundingBox();
        return rect ? Math.abs(rect.y + rect.height / 2 - hashCenter) : Infinity;
      })
      .toBeLessThan(3);
  };
  await expectCentered();
  await writingArea(editor).press("ArrowDown");
  await expectCentered();
  await expect(writingArea(editor)).toBeFocused();
  const activeBefore = await inline.locator('[data-active="true"]').getAttribute("data-testid");
  await inline.getByTestId("editor-mention-filters").hover();
  await page.mouse.wheel(0, 80);
  await expect(inline.locator('[data-active="true"]')).not.toHaveAttribute("data-testid", activeBefore!);
  await expectCentered();
  await writingArea(editor).press("ArrowUp");
  await expectCentered();
  await page.screenshot({ path: "/tmp/hall-search-inline-categories.png" });
  await inline.getByTestId("editor-mention-filter-type-text").click();
  await expect(inline.getByTestId("editor-mention-remove-type-text")).toBeVisible();

  await inline.getByTestId("editor-mention-input").fill(resource.name);
  const inlineResult = inline
    .getByTestId("editor-mention-result")
    .and(page.locator(`[data-reference-id="${resource.id}"]`));
  await expect(inlineResult).toBeVisible();
  await inlineResult.click();
  await expect(inline).toBeHidden();
  await expect(page.getByTestId("reference-search-dialog")).toBeHidden();
  await expect(editor.getByTestId(`editor-resource-embed-${resource.id}`)).toHaveCount(1);
  await expect(writingArea(editor)).toContainText("InvisibleContentMarker");
});

// @verifies-requirement HALL-FR-SRC-020
// @verifies-requirement HALL-FR-SRC-030
test("HALL-FR-SRC paginates all admissible titles and ignores an obsolete response", async ({ appPage: page }) => {
  for (let index = 1; index <= 35; index++)
    await createWorkspaceText(page, `Devis programme scolaire — lot ${String(index).padStart(2, "0")}`);
  const target = await createWorkspaceText(page, "Réfection toiture mairie");
  await openEditorLab(page);
  const dialog = await openReferenceSearch(compactEditor(page));
  const input = dialog.getByTestId("reference-search-input");
  const rows = dialog.getByTestId("reference-search-result");
  await input.fill("programme scolaire");
  await expect(dialog.getByTestId("reference-search-count")).toHaveText("35");
  await expect(rows).toHaveCount(30);
  await dialog.getByTestId("reference-search-more").click();
  await expect(rows).toHaveCount(35);
  await dialog.getByTestId("reference-search-add-filter").click();
  await dialog.getByTestId("reference-search-filter-category-type").click();
  await dialog.getByTestId("reference-search-filter-type-text").click();
  await dialog.getByTestId("reference-search-edit-type-text").click();
  await dialog.getByTestId("reference-search-filter-type-geographic").click();
  await expect(dialog.getByTestId("reference-search-empty")).toBeVisible();
  await dialog.getByTestId("reference-search-remove-type-geographic").click();
  await input.fill("toiture mairie");
  await expect(rows).toHaveCount(1);
  let release!: () => void, arrived!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const intercepted = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route("**/api/resources/search?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("query") !== "programme scolaire") return route.continue();
    const response = await route.fetch();
    arrived();
    await gate;
    await route.fulfill({ response });
  });
  await input.fill("programme scolaire");
  await intercepted;
  await input.fill("toiture mairie");
  await expect(rows).toHaveCount(1);
  await expect(rows).toHaveAttribute("data-reference-id", target.id);
  const oldResponse = page.waitForResponse(
    (response) => new URL(response.url()).searchParams.get("query") === "programme scolaire",
  );
  release();
  await oldResponse;
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  await expect(rows).toHaveCount(1);
  await expect(rows).toHaveAttribute("data-reference-id", target.id);
  await input.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(compactEditor(page).getByTestId(`editor-resource-embed-${target.id}`)).toHaveCount(1);
});

// @verifies-requirement HALL-FR-SRC-030
test("HALL-FR-SRC inline reopens after every dismissal and keyboard insertion", async ({ appPage: page }) => {
  await openEditorLab(page);
  const editor = compactEditor(page);
  const area = writingArea(editor);
  const panel = page.getByTestId("editor-mention-panel");
  for (let attempt = 0; attempt < 3; attempt++) {
    await replaceEditorText(editor, "@");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("editor-mention-result").first()).toBeEnabled();
    await expect(area).toBeFocused();
    await area.press("Escape");
    await expect(panel).toBeHidden();
  }
  await replaceEditorText(editor, "@");
  await expect(panel.getByTestId("editor-mention-result").first()).toBeEnabled();
  await area.press("ArrowDown");
  const selectedId = await panel.getByTestId("editor-mention-result").nth(1).getAttribute("data-reference-id");
  const selectedKind = await panel.getByTestId("editor-mention-result").nth(1).getAttribute("data-resource-kind");
  await area.press("Enter");
  await expect(panel).toBeHidden();
  await expect(editor.getByTestId(`editor-${selectedKind}-reference-${selectedId}`)).toHaveCount(1);
  await area.pressSequentially(" @");
  await expect(panel).toBeVisible();
});

// @verifies-requirement HALL-FR-SRC-030
test("HALL-FR-SRC inline survives repeated triggers and Tab navigation", async ({ appPage: page }) => {
  await openEditorLab(page);
  const editor = compactEditor(page),
    area = writingArea(editor);
  const panel = page.getByTestId("editor-mention-panel");
  await replaceEditorText(editor, "@");
  await expect(panel).toBeVisible();
  await area.pressSequentially("@");
  await expect(panel).toBeVisible();
  await area.press("Backspace");
  await expect(panel).toBeVisible();
  await area.press("Tab");
  await area.click();
  await area.press("End");
  await area.pressSequentially(" @");
  await expect(panel).toBeVisible();
  await expect(area).toBeFocused();
  await area.press("Escape");
  await expect(panel).toBeHidden();
});

// @verifies-requirement HALL-FR-SRC-030
test("HALL-FR-SRC PDF insertion uses the same inline reference from keyboard and dialog", async ({ appPage: page }) => {
  const pdf = await firstPdfResource(page);
  await openEditorLab(page);
  const editor = compactEditor(page),
    area = writingArea(editor);
  await replaceEditorText(editor, `Consulter @${pdf.name}`);
  const panel = page.getByTestId("editor-mention-panel");
  await panel
    .getByTestId("editor-mention-result")
    .and(page.locator(`[data-reference-id="${pdf.id}"]`))
    .click();
  const references = editor.getByTestId(`editor-resource-reference-${pdf.id}`);
  await expect(references).toHaveCount(1);
  await expect(editor.getByTestId(`editor-resource-embed-${pdf.id}`)).toHaveCount(0);
  await expect(area).toContainText(`Consulter ${pdf.name}`);
  const inlineClass = await references.first().getAttribute("class");
  const dialog = await openReferenceSearch(editor);
  await dialog.getByTestId("reference-search-input").fill(pdf.name);
  await dialog
    .getByTestId("reference-search-result")
    .and(page.locator(`[data-reference-id="${pdf.id}"]`))
    .click();
  await expect(references).toHaveCount(2);
  await expect(references.nth(1)).toHaveAttribute("class", inlineClass!);
  await expect(editor.getByTestId(`editor-resource-embed-${pdf.id}`)).toHaveCount(0);
  const sameParagraph = await references.evaluateAll(
    (nodes) => nodes.length === 2 && nodes[0].closest("p") === nodes[1].closest("p"),
  );
  expect(sameParagraph).toBe(true);
});

// @verifies-requirement HALL-FR-SRC-030
test("HALL-FR-SRC inline references with and without icons align with surrounding text", async ({ appPage: page }) => {
  const pdf = await firstPdfResource(page);
  await openEditorLab(page);
  const editor = compactEditor(page);
  await replaceEditorText(editor, "");
  const dialog = await openReferenceSearch(editor);
  await dialog.getByTestId("reference-search-add-filter").click();
  await dialog.getByTestId("reference-search-filter-category-type").click();
  await dialog.getByTestId("reference-search-filter-type-contact").click();
  const contact = dialog.getByTestId("reference-search-result").first();
  const contactId = await contact.getAttribute("data-reference-id");
  await contact.click();
  const area = writingArea(editor);
  await area.press("End");
  await area.pressSequentially(" test");
  await area.press("Enter");
  await area.pressSequentially(`@${pdf.name}`);
  await page
    .getByTestId("editor-mention-result")
    .and(page.locator(`[data-reference-id="${pdf.id}"]`))
    .click();
  await area.press("End");
  await area.pressSequentially(" test");

  const groups = await Promise.all(
    resourceKinds
      .filter((kind) => kind !== "folder")
      .map(async (kind) => {
        const response = await page.request.get(`/api/resources/search?kinds=${kind}&limit=20`);
        expect(response.ok()).toBe(true);
        return (await response.json()).properties.items;
      }),
  );
  const resources = groups.flat() as Array<{
    id: string;
    name: string;
    kind: string;
    binary?: { mediaType: string };
  }>;
  const examples = [
    ...new Map(
      resources
        .filter((resource) => resource.kind !== "folder")
        .map((resource) => [`${resource.kind}:${resource.binary?.mediaType ?? ""}`, resource]),
    ).values(),
  ].filter((resource) => resource.id !== pdf.id);
  expect(examples.some((resource) => resource.kind === "geographic")).toBe(true);
  expect(examples.some((resource) => resource.kind === "remote")).toBe(true);
  await area.press("Enter");
  await area.evaluate((element, entries) => {
    const container = document.createElement("div");
    for (const entry of entries) {
      const paragraph = document.createElement("p");
      const reference = document.createElement("span");
      reference.setAttribute("data-reference", "");
      reference.setAttribute("data-kind", "resource");
      reference.setAttribute("data-id", entry.id);
      reference.setAttribute("data-label", entry.name);
      reference.textContent = entry.name;
      paragraph.append(reference, " test");
      container.append(paragraph);
    }
    const transfer = new DataTransfer();
    transfer.setData("text/html", container.innerHTML);
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
  }, examples);

  const assertAlignment = async (surface: Locator) => {
    for (const testId of [
      `editor-contact-reference-${contactId}`,
      `editor-resource-reference-${pdf.id}`,
      ...examples.map((resource) => `editor-resource-reference-${resource.id}`),
    ]) {
      const reference = surface.getByTestId(testId);
      await expect(reference).toBeVisible();
      const offset = await reference.evaluate((element) => {
        const textRect = (node: Node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          return range.getBoundingClientRect();
        };
        const inside = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const label = inside.nextNode();
        const paragraph = element.closest("p");
        if (!label || !paragraph) throw new Error("Missing inline reference paragraph");
        const outside = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
        let sibling = outside.nextNode();
        while (sibling && (element.contains(sibling) || !sibling.textContent?.includes("test")))
          sibling = outside.nextNode();
        if (!sibling) throw new Error("Missing surrounding text");
        return Math.abs(textRect(label).bottom - textRect(sibling).bottom);
      });
      expect(offset, `${testId} text baseline offset`).toBeLessThanOrEqual(1);
    }
  };
  await assertAlignment(editor);
  await editor.screenshot({ path: "/tmp/hall-inline-reference-alignment.png" });
  await assertAlignment(renderedDocument(page));
  await assertAlignment(await openEnrichedEditor(page));
});

// @verifies-requirement HALL-FR-SRC-030
test("HALL-FR-SRC a web reference opens the shared web preview instead of its address form", async ({
  appPage: page,
}) => {
  const response = await page.request.get("/api/resources/search?kinds=remote");
  expect(response.ok()).toBe(true);
  const summary = (await response.json()).properties.items[0];
  expect(summary).toBeTruthy();
  const detailResponse = await page.request.get(`/api/resources/${summary.id}`);
  expect(detailResponse.ok()).toBe(true);
  const resource = (await detailResponse.json()).properties;
  expect(resource.target.kind).toBe("url");
  let releasePage!: () => void;
  const pageReady = new Promise<void>((resolve) => {
    releasePage = resolve;
  });
  await page.route(resource.target.url, async (route) => {
    await pageReady;
    await route.fulfill({
      contentType: "text/html",
      body: '<html><body><main data-testid="external-site-content">Contenu de la page distante</main></body></html>',
    });
  });
  await openEditorLab(page);
  const editor = compactEditor(page);
  await expect(editor.getByTestId(`editor-resource-reference-${resource.id}`)).toBeVisible();
  await editor.getByTestId(`editor-resource-reference-${resource.id}`).click();
  const preview = page.getByTestId("resource-preview");
  await expect(preview).toHaveAttribute("data-resource-mode", "edit");
  await expect(preview.getByTestId("resource-presentation-remote-edit")).toHaveCount(0);
  await expect(preview.getByTestId("remote-resource-frame")).toHaveAttribute("src", resource.target.url);
  const content = preview.getByTestId("remote-resource-content");
  try {
    await expect(content).toHaveAttribute("aria-busy", "true");
    await expect(content.getByTestId("loading-indicator")).toBeVisible();
  } finally {
    releasePage();
  }
  await expect(
    preview.getByTestId("remote-resource-frame").contentFrame().getByTestId("external-site-content"),
  ).toBeVisible();
  await expect(content).toHaveAttribute("aria-busy", "false");
  await expect(content.getByTestId("loading-indicator")).toHaveCount(0);
  await expect(preview.getByTestId("remote-resource-open")).toHaveAttribute("href", resource.target.url);
  for (const viewport of [
    { width: 1400, height: 950 },
    { width: 1100, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(async () => {
        const modalBox = await preview.boundingBox();
        const frameBox = await preview.getByTestId("remote-resource-frame").boundingBox();
        if (!modalBox || !frameBox) return Number.POSITIVE_INFINITY;
        return Math.abs(modalBox.y + modalBox.height - frameBox.y - frameBox.height);
      })
      .toBeLessThanOrEqual(2);
    await expect(preview.getByTestId("resource-preview-close")).toBeInViewport();
  }
  await preview.getByTestId("resource-preview-close").click();
  await expect(preview).toBeHidden();
  await expect(page).toHaveURL(/\/app\/editor-lab$/);
  await expect(editor.getByTestId(`editor-resource-reference-${resource.id}`)).toBeVisible();
});
