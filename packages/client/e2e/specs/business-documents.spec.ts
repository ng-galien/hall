import { crc32 } from "node:zlib";
import type { Locator } from "@playwright/test";
import { expect, historySettled, runItemCommand, test } from "../fixtures/application";
import { pdfTextRuns } from "../fixtures/pdfText";

test.use({ builtInPdfViewer: true });

const minimalPdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
    "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n" +
    "trailer<</Size 4/Root 1 0 R>>\nstartxref\n170\n%%EOF\n",
);

/** Smallest OpenDocument text the server accepts: a stored zip whose first entry is its mimetype. */
function minimalOdt(): Buffer {
  const name = Buffer.from("mimetype");
  const data = Buffer.from("application/vnd.oasis.opendocument.text");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(10, 4);
  local.writeUInt32LE(crc32(data), 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(10, 6);
  central.writeUInt32LE(crc32(data), 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}

/** The header of the full screen view holds on one row: the place, the title, the commands, then the cross, last. */
async function expectHeaderOnOneRow(viewer: Locator) {
  await viewer.evaluate((element) =>
    Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined))),
  );
  const row = await viewer.evaluate((dialog) => {
    const box = (selector: string) => dialog.querySelector(selector)!.getBoundingClientRect();
    const close = box('[data-testid="resource-preview-close"]');
    const middle = (rect: DOMRect) => rect.top + rect.height / 2;
    const controls = [...dialog.querySelectorAll(".resource-preview-shell-header :is(button, a)")]
      .map((control) => control.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.top < close.bottom && rect.bottom > close.top);
    return {
      middles: [box(".workspace-breadcrumb"), box("#resource-preview-title"), close].map(middle),
      lastRight: Math.max(...controls.map((rect) => rect.right)),
      closeRight: close.right,
    };
  });
  expect(Math.max(...row.middles) - Math.min(...row.middles), "place, title and cross on one row").toBeLessThanOrEqual(
    6,
  );
  expect(row.lastRight, "the cross is the last control of the row").toBeLessThanOrEqual(row.closeRight + 0.5);
}

// @verifies-requirement HALL-FR-WSP-370
// @verifies-requirement HALL-FR-DOC-480
// @verifies-requirement HALL-FR-LAY-100
test("the business documents section folds by its header and opens each document in the shared viewer", async ({
  appPage: page,
}) => {
  const created = await page.request.post("/api/council-business", {
    data: { path: "seed", name: `Documents ${crypto.randomUUID()}`, reportName: "Report", reportContent: "" },
  });
  expect(created.ok()).toBeTruthy();
  const business = (await created.json()).properties as { id: string };
  const textResponse = await page.request.post("/api/resources", {
    data: {
      kind: "text",
      path: "seed",
      name: "Note de présentation",
      councilBusinessId: business.id,
      content: "Texte **rendu** dans la visionneuse.",
    },
  });
  expect(textResponse.ok()).toBeTruthy();
  const text = (await textResponse.json()).properties as { id: string };
  const upload = async (name: string, mimeType: string, buffer: Buffer) => {
    const response = await page.request.post("/api/resources/documents", {
      multipart: { path: "seed", councilBusinessId: business.id, file: { name, mimeType, buffer } },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()).properties as { id: string };
  };
  const pdf = await upload("plan.pdf", "application/pdf", minimalPdf);
  const mapResponse = await page.request.post("/api/resources", {
    data: { kind: "geographic", path: "seed", name: "Réservoirs", councilBusinessId: business.id },
  });
  expect(mapResponse.ok()).toBeTruthy();
  const map = (await mapResponse.json()).properties as { id: string };
  const archive = await upload("releves.odt", "application/vnd.oasis.opendocument.text", minimalOdt());

  await page.goto(`/app/workspace?path=seed&councilBusiness=${business.id}`);
  const section = page.getByTestId("business-category-documents");
  const toggle = page.getByTestId("business-category-documents-toggle");
  await expect(page.getByTestId("business-category-documents-count")).toHaveText("4");
  const tree = section.getByTestId("business-resource-tree");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(tree).toBeHidden();
  await expect(page.getByTestId("attachment-picker-open")).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(tree).toBeVisible();

  const squareBox = await toggle.locator(".disclosure-badge").boundingBox();
  const titleBox = await toggle.locator(".section-header-title-text").boundingBox();
  expect(squareBox && titleBox).toBeTruthy();
  expect(
    Math.abs(squareBox!.y + squareBox!.height / 2 - (titleBox!.y + titleBox!.height / 2)),
    "The folding square is aligned with the title",
  ).toBeLessThanOrEqual(2);
  await page.mouse.move(0, 0);
  await expect.poll(() => toggle.evaluate((element) => element.matches(":hover"))).toBe(false);
  await toggle.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
  );
  const restingBackground = await toggle.evaluate((element) => getComputedStyle(element).backgroundColor);
  await toggle.hover();
  await expect
    .poll(() => toggle.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(restingBackground);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(tree).toBeHidden();
  await expect(page.getByTestId("attachment-picker-open")).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(tree).toBeVisible();

  const viewer = page.getByTestId("resource-preview");
  await page.getByTestId(`business-document-view-${text.id}`).click();
  await expect(viewer).toBeVisible();
  await expect(viewer).toHaveAttribute("data-resource-mode", "edit");
  await expect(viewer.getByTestId("editor-writing-area").locator("strong")).toHaveText("rendu");
  await expect(viewer.getByTestId("editor-writing-area")).toHaveAttribute("contenteditable", "true");
  // The dialog writes the place, the title, each command and the cross once, on one row.
  await expect(viewer.getByTestId("resource-preview-close")).toHaveCount(1);
  await expect(viewer.getByTestId("workspace-breadcrumb-close")).toHaveCount(0);
  await expectHeaderOnOneRow(viewer);
  await expect(viewer.getByTestId("resource-autosave-toggle")).toHaveCount(1);
  await expect(viewer.getByTestId("resource-changes-trigger")).toHaveCount(1);
  await expect(viewer.getByTestId("workspace-workbench-title")).toHaveCount(1);
  await expect(viewer.locator(".workspace-breadcrumb .workspace-crumb-current")).toHaveCount(0);
  const viewerBox = await viewer.boundingBox();
  const viewport = page.viewportSize();
  expect(viewerBox!.width).toBeGreaterThan(viewport!.width * 0.9);
  expect(viewerBox!.height).toBeGreaterThan(viewport!.height * 0.9);
  await viewer.getByTestId("resource-preview-close").click();
  await expect(viewer).toBeHidden();

  await page.getByTestId(`business-document-view-${pdf.id}`).click();
  await expect(viewer).toBeVisible();
  await expect(viewer.getByTestId("resource-preview-object")).toHaveAttribute("src", /.+/);
  await expect(viewer.getByTestId("resource-preview-download")).toBeVisible();
  await expect(viewer.getByTestId("resource-preview-close")).toHaveCount(1);
  await expectHeaderOnOneRow(viewer);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(viewer).toBeHidden();

  await page.getByTestId(`business-document-view-${archive.id}`).click();
  await expect(viewer).toBeVisible();
  await expect(viewer.getByTestId("resource-preview-object-unavailable")).toBeVisible();
  const download = page.waitForEvent("download");
  await runItemCommand(page, "resource-preview-download", viewer);
  expect((await download).suggestedFilename()).toBe("releves.odt");
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();

  await page.getByTestId(`business-document-view-${map.id}`).click();
  await expect(viewer).toBeVisible();
  await expect(viewer).toHaveAttribute("data-resource-mode", "edit");
  await expect(viewer.getByTestId("geographic-mode-draw")).toHaveAttribute("aria-pressed", "false");
  await viewer.getByTestId("geographic-mode-draw").click();
  await expect(viewer.getByTestId("geographic-mode-draw")).toHaveAttribute("aria-pressed", "true");
  await viewer.getByTestId("geographic-tool-marker").click();
  const mapBox = await viewer.locator(".geographic-map").boundingBox();
  if (!mapBox) throw new Error("The map must be rendered in the viewer");
  await page.mouse.click(mapBox.x + mapBox.width * 0.6, mapBox.y + mapBox.height * 0.5);
  await expect(
    viewer.locator('[data-testid="geographic-composition"] li[data-testid^="geographic-composition-feature-"]'),
  ).toHaveCount(1);
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/resources/${map.id}`)).json()).properties.document?.hallLayer?.features
          ?.length ?? 0,
      { timeout: 15_000 },
    )
    .toBe(1);
  await viewer.getByTestId("resource-preview-close").click();
  await expect(viewer).toBeHidden();
});

async function created(response: Awaited<ReturnType<import("@playwright/test").APIRequestContext["post"]>>) {
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).properties as { id: string; folderPath: string; path: string; name: string };
}

async function rowCommand(page: import("@playwright/test").Page, actions: string, command: string) {
  await page.getByTestId(actions).click();
  await page.getByRole("menu").getByTestId(`${command}-menu`).click();
}

// @verifies-requirement HALL-FR-WSP-510
// @verifies-requirement HALL-FR-WSP-260
test("the documents of a business are the tree of its folder and its associations filed elsewhere, filed from there", async ({
  appPage: page,
}) => {
  const marker = crypto.randomUUID().slice(0, 8);
  const business = await created(
    await page.request.post("/api/council-business", {
      data: { path: "", name: `Affaire ${marker}`, reportName: "Rapport", reportContent: "" },
    }),
  );
  const root = `Affaire ${marker}`;
  const post = (data: Record<string, unknown>) => page.request.post("/api/resources", { data });
  const empty = await created(await post({ kind: "folder", path: root, name: "Vide" }));
  await created(await post({ kind: "folder", path: root, name: "Pièces" }));
  const plan = await created(await post({ kind: "text", path: `${root}/Pièces`, name: "Plan", content: "" }));
  const elsewhere = `Ailleurs ${marker}`;
  await created(await post({ kind: "folder", path: "", name: elsewhere }));
  const letter = await created(
    await post({ kind: "text", path: elsewhere, name: "Courrier", content: "", councilBusinessId: business.id }),
  );
  const annex = await created(
    await post({ kind: "text", path: elsewhere, name: "Annexe", content: "", councilBusinessId: business.id }),
  );
  const atRoot = await created(
    await post({ kind: "text", path: "", name: `Racine ${marker}`, content: "", councilBusinessId: business.id }),
  );
  const resourcePath = async (id: string) =>
    ((await (await page.request.get(`/api/resources/${id}`)).json()).properties as { path: string }).path;
  const members = async () =>
    (
      ((await (await page.request.get(`/api/council-business/resource-items?councilBusinessId=${business.id}`)).json())
        .entities ?? []) as Array<{ properties: { id: string } }>
    ).map((entry) => entry.properties.id);

  await page.goto(`/app/workspace?${new URLSearchParams({ path: root, councilBusiness: business.id })}`);
  await page.getByTestId("business-category-documents-toggle").click();
  const tree = page.getByTestId("business-resource-tree");
  await expect(tree).toBeVisible();
  // The whole folder: an empty sub-folder and a document filed without association, each under its own name.
  await expect(tree.getByTestId("business-document-folder-Vide-open")).toHaveText("Vide");
  const pieces = tree.getByTestId(`business-document-folder-${encodeURIComponent("Pièces")}`);
  await expect(pieces.getByTestId(`business-document-folder-${encodeURIComponent("Pièces")}-open`)).toHaveText(
    "Pièces",
  );
  await expect(pieces.getByTestId(`business-attached-resource-${plan.id}`)).toBeVisible();
  await expect(tree.getByTestId("business-document-folder-..")).toHaveCount(0);
  // The associated documents filed elsewhere, apart, with the place of their folder.
  await expect(tree.getByTestId("business-documents-elsewhere")).toBeVisible();
  await expect(tree.getByTestId(`business-document-location-${letter.id}`)).toHaveText(elsewhere);
  await expect(tree.getByTestId(`business-document-location-${atRoot.id}`)).toHaveText("Documents");
  await expect(tree.getByTestId(`business-document-location-${plan.id}`)).toHaveCount(0);

  await tree
    .getByTestId("business-documents-create-folder")
    .or(page.getByTestId("business-documents-create-folder"))
    .first()
    .click();
  await page.getByTestId("business-documents-create-folder-dialog-name").fill("Nouveau");
  await page.getByTestId("business-documents-create-folder-dialog-submit").click();
  await expect(tree.getByTestId("business-document-folder-Nouveau")).toBeVisible();

  await rowCommand(page, `business-folder-actions-${empty.id}`, `business-folder-create-${empty.id}`);
  await page.getByTestId("business-folder-create-dialog-name").fill("Sous");
  await page.getByTestId("business-folder-create-dialog-submit").click();
  await expect(tree.getByTestId(`business-document-folder-${encodeURIComponent("Vide/Sous")}`)).toBeVisible();

  await rowCommand(page, `business-document-actions-${plan.id}`, `business-document-rename-${plan.id}`);
  await page.getByTestId(`business-document-rename-${plan.id}-dialog-name`).fill("Plan renommé");
  await page.getByTestId(`business-document-rename-${plan.id}-dialog-submit`).click();
  await expect(tree.getByTestId(`business-attached-resource-${plan.id}-open`)).toHaveText("Plan renommé");

  await rowCommand(page, `business-document-actions-${plan.id}`, `business-document-move-${plan.id}`);
  const move = page.getByTestId("move-to-dialog");
  await move.getByTestId(`move-to-folder-${root}/Vide`).click();
  await expect(move).toHaveCount(0);
  await expect.poll(() => resourcePath(plan.id)).toBe(`${root}/Vide`);
  await expect(
    tree.getByTestId("business-document-folder-Vide").getByTestId(`business-attached-resource-${plan.id}`),
  ).toBeVisible();

  await rowCommand(page, `business-document-actions-${letter.id}`, `business-document-file-${letter.id}`);
  await expect.poll(() => resourcePath(letter.id)).toBe(root);
  await expect(tree.getByTestId(`business-document-location-${letter.id}`)).toHaveCount(0);
  await expect(tree.getByTestId(`business-attached-resource-${letter.id}`)).toBeVisible();

  await rowCommand(page, `business-document-actions-${annex.id}`, `business-document-dissociate-${annex.id}`);
  await expect(tree.getByTestId(`business-attached-resource-${annex.id}`)).toHaveCount(0);
  expect(await members()).not.toContain(annex.id);
  expect(await resourcePath(annex.id)).toBe(elsewhere);

  // A document taken out of the folder of the business leaves the business.
  expect(await members()).toContain(letter.id);
  await rowCommand(page, `business-document-actions-${letter.id}`, `business-document-move-${letter.id}`);
  await move.getByTestId(`move-to-folder-${elsewhere}`).click();
  await expect(move).toHaveCount(0);
  await expect.poll(() => resourcePath(letter.id)).toBe(elsewhere);
  await expect.poll(members).not.toContain(letter.id);
  await expect(tree.getByTestId(`business-attached-resource-${letter.id}`)).toHaveCount(0);
  await expect(page.locator('[role="alert"]:visible')).toHaveCount(0);
});

// @verifies-requirement HALL-FR-LAY-100
// @verifies-requirement HALL-FR-DOC-480
test("the full screen view of a document carries the commands of the Documents screen on one header row", async ({
  appPage: page,
}) => {
  const marker = crypto.randomUUID().slice(0, 8);
  const post = (data: Record<string, unknown>) => page.request.post("/api/resources", { data });
  const folder = `Plein écran ${marker}`;
  await created(await post({ kind: "folder", path: "", name: folder }));
  await created(await post({ kind: "folder", path: folder, name: "Classement" }));
  const text = await created(await post({ kind: "text", path: folder, name: "Note", content: "Texte." }));
  const map = await created(await post({ kind: "geographic", path: folder, name: "Plan du bourg" }));
  const resource = async (id: string) =>
    (await page.request.get(`/api/resources/${id}`)).json() as Promise<{
      properties: { name: string; path: string };
    }>;

  await page.goto(`/app/workspace?${new URLSearchParams({ path: folder, resource: text.id })}`);
  await runItemCommand(page, "resource-open-extended");
  const viewer = page.getByTestId("resource-preview");
  await expect(viewer).toBeVisible();
  await expectHeaderOnOneRow(viewer);
  // The date is read in the tooltip of the automatic saving, not on a line of its own.
  const autosave = viewer.getByTestId("resource-autosave-toggle");
  await expect(autosave).toHaveAttribute("aria-label", /(Updated|Created) on/);
  await autosave.hover();
  await expect(page.getByRole("tooltip", { name: /(Updated|Created) on/ })).toBeVisible();
  for (const command of ["copy-object-reference", "resource-move-to", "resource-preview-pdf-preview"]) {
    const direct = viewer.getByTestId(command);
    if (!(await direct.isVisible())) {
      await viewer.getByTestId("item-commands-more").click();
      await expect(page.getByRole("menu").getByTestId(command)).toBeVisible();
      await page.keyboard.press("Escape");
    }
  }

  await runItemCommand(page, "workspace-workbench-rename", viewer);
  const title = viewer.getByTestId("workspace-workbench-title-input");
  await title.fill("Note renommée");
  await title.press("Enter");
  await expect(viewer.getByTestId("workspace-workbench-title")).toHaveText("Note renommée");
  await expect.poll(async () => (await resource(text.id)).properties.name).toBe("Note renommée");

  await runItemCommand(page, "resource-move-to", viewer);
  const move = page.getByTestId("move-to-dialog");
  await move.getByTestId(`move-to-folder-${folder}/Classement`).click();
  await expect(move).toHaveCount(0);
  await expect.poll(async () => (await resource(text.id)).properties.path).toBe(`${folder}/Classement`);
  await expect(viewer).toBeVisible();

  await runItemCommand(page, "resource-preview-delete", viewer);
  await page.getByTestId("resource-delete-confirm").click();
  await expect(viewer).toHaveCount(0);
  await expect.poll(async () => (await page.request.get(`/api/resources/${text.id}`)).status()).toBe(404);

  // « Ouvrir dans Cartes » is an icon of the row, with the tooltip of the application.
  await page.goto(`/app/workspace?${new URLSearchParams({ path: folder, resource: map.id })}`);
  await runItemCommand(page, "resource-open-extended");
  await expect(viewer).toBeVisible();
  await expectHeaderOnOneRow(viewer);
  const openInMaps = viewer.getByTestId("resource-open-in-maps");
  await expect(openInMaps).toHaveText("");
  await openInMaps.hover();
  await expect(page.getByRole("tooltip", { name: await openInMaps.getAttribute("aria-label") })).toBeVisible();
  await openInMaps.click();
  await expect(viewer).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/app/maps/${map.id}`));
});

// @verifies-requirement HALL-FR-DOC-600
test("a spreadsheet and a map print from their full screen view as a PDF in the viewer, the map alone or with its elements", async ({
  appPage: page,
}) => {
  test.setTimeout(120_000);
  const marker = crypto.randomUUID().slice(0, 8);
  const post = (data: Record<string, unknown>) => page.request.post("/api/resources", { data });
  const folder = `Impression ${marker}`;
  await created(await post({ kind: "folder", path: "", name: folder }));
  const sheet = await created(
    await post({
      kind: "spreadsheet",
      path: folder,
      name: `Tableau ${marker}`,
      document: {
        schemaVersion: 2,
        workbook: {
          id: "budget",
          name: `Tableau ${marker}`,
          appVersion: "0.25.1",
          locale: "enUS",
          styles: {},
          sheetOrder: ["lignes"],
          sheets: {
            lignes: {
              id: "lignes",
              name: "Lignes",
              rowCount: 20,
              columnCount: 8,
              cellData: { 0: { 0: { v: "Poste" }, 1: { v: "Montant" } } },
              rowData: {},
              columnData: {},
              mergeData: [],
              showGridlines: 1,
            },
          },
        },
      },
    }),
  );
  const map = await created(await post({ kind: "geographic", path: folder, name: `Carte ${marker}` }));
  const viewer = page.getByTestId("resource-preview");
  const printedText = async () => {
    const frame = page.getByTestId("resource-preview-print-native-viewer").locator("iframe, object").first();
    await expect(frame).toBeVisible({ timeout: 30_000 });
    const address = (await frame.getAttribute("src")) ?? (await frame.getAttribute("data"));
    const pdf = await page.request.get(address!.split("#")[0]!);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    return (await pdfTextRuns(await pdf.body()))
      .flat()
      .map((run) => run.text)
      .join(" ");
  };

  await page.goto(`/app/workspace?${new URLSearchParams({ path: folder, resource: sheet.id })}`);
  await runItemCommand(page, "resource-open-extended");
  await expect(viewer).toBeVisible();
  await runItemCommand(page, "resource-preview-print", viewer);
  await expect(page.getByTestId("resource-preview-print-dialog")).toBeVisible();
  const printedSheet = await printedText();
  expect(printedSheet).toContain(`Tableau ${marker}`);
  expect(printedSheet).toContain("Montant");
  await page.getByTestId("resource-preview-print-close").click();
  await page.getByTestId("resource-preview-close").click();
  await expect(viewer).toHaveCount(0);

  for (const choice of ["map-only", "with-elements"]) {
    // The PDF window and the full screen view closed before give their history entries back first.
    await historySettled(page);
    await page.goto(`/app/workspace?${new URLSearchParams({ path: folder, resource: map.id })}`);
    await runItemCommand(page, "resource-open-extended");
    await expect(viewer).toBeVisible();
    await viewer.getByTestId("resource-preview-print-choices").click();
    await page.getByRole("menu").getByTestId(`resource-preview-print-${choice}`).click();
    // The server draws the map from the background layers of the map service, each read within twelve seconds.
    await expect(page.getByTestId("resource-preview-print-dialog")).toBeVisible({ timeout: 30_000 });
    expect(await printedText()).toContain(`Carte ${marker}`);
    await page.getByTestId("resource-preview-print-close").click();
    await expect(page.getByTestId("resource-preview-print-dialog")).toHaveCount(0);
    await page.getByTestId("resource-preview-close").click();
    await expect(viewer).toHaveCount(0);
  }
});

// @verifies-requirement HALL-FR-SRC-030
test("a document inserted in a text shows its current name after a rename, from one reading of that document", async ({
  appPage: page,
}) => {
  const marker = crypto.randomUUID().slice(0, 8);
  const post = (data: Record<string, unknown>) => page.request.post("/api/resources", { data });
  const folder = `Inclusion ${marker}`;
  await created(await post({ kind: "folder", path: "", name: folder }));
  const included = await created(await post({ kind: "text", path: folder, name: "Ancien nom", content: "Pièce." }));
  const text = await created(
    await post({
      kind: "text",
      path: folder,
      name: "Note",
      content: `Avant.\n\n::resource-embed[Ancien nom]{#${included.id} presentation="text"}\n\nAprès.`,
    }),
  );
  const renamed = await page.request.patch(`/api/resources/${included.id}/location`, {
    data: { path: folder, name: "Nom courant" },
  });
  expect(renamed.ok(), await renamed.text()).toBeTruthy();
  const readings: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === `/api/resources/${included.id}`) readings.push(url.href);
  });

  await page.goto(`/app/workspace?${new URLSearchParams({ path: folder, resource: text.id })}`);
  const embed = page.locator(`[data-testid$="resource-embed-${included.id}"]`).first();
  await expect(embed).toHaveAttribute("aria-label", /Nom courant/);
  await expect(page.getByTestId("resource-workbench")).not.toContainText("Ancien nom");
  await page.waitForLoadState("networkidle");
  expect(readings, "one complete reading of the inserted document").toHaveLength(1);
});

// @verifies-requirement HALL-FR-WSP-510
test("a content saved in another session reaches the open business and folder without rereading the catalog or the business list", async ({
  appPage: page,
}) => {
  const marker = crypto.randomUUID().slice(0, 8);
  const root = `Affaire suivie ${marker}`;
  const business = (await created(
    await page.request.post("/api/council-business", {
      data: { path: "", name: root, reportName: "Rapport", reportContent: "Rapport initial." },
    }),
  )) as unknown as { id: string; reportResourceId: string };
  const subject = (await created(
    await page.request.post(`/api/council-business/${business.id}/prepared-subjects`, {
      data: { kind: "openQuestion", name: "Sujet suivi", content: "Texte initial du sujet." },
    }),
  )) as unknown as { id: string; textResourceId: string };
  const piece = await created(
    await page.request.post("/api/resources", {
      data: { kind: "text", path: root, name: "Pièce suivie", content: "Pièce initiale." },
    }),
  );
  const save = async (id: string, content: string) => {
    const current = (await (await page.request.get(`/api/resources/${id}`)).json()).properties as { version: number };
    const response = await page.request.put(`/api/resources/${id}/content`, {
      data: { kind: "text", expectedVersion: current.version, content },
    });
    expect(response.status(), await response.text()).toBe(200);
  };
  const wholeRereads: string[] = [];
  const folderReads: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() !== "GET") return;
    if (url.pathname === "/api/resources/catalog" || url.pathname === "/api/council-business/workspace-items")
      wholeRereads.push(url.pathname);
    if (url.pathname === "/api/resources" && url.searchParams.get("path") === root) folderReads.push(url.href);
  });

  await page.goto(`/app/workspace?${new URLSearchParams({ path: "", councilBusiness: business.id })}`);
  await expect(page.getByTestId("business-report-editor")).toContainText("Rapport initial.");
  await page.getByTestId(`business-subject-${subject.id}-open`).click();
  const subjectText = page.getByTestId(`business-inline-resource-${subject.textResourceId}`);
  await expect(subjectText).toContainText("Texte initial du sujet.");
  await page.waitForLoadState("networkidle");
  wholeRereads.length = 0;

  await save(business.reportResourceId, "Rapport modifié ailleurs.");
  await expect(page.getByTestId("business-report-editor")).toContainText("Rapport modifié ailleurs.");
  await save(subject.textResourceId, "Texte du sujet modifié ailleurs.");
  await expect(subjectText).toContainText("Texte du sujet modifié ailleurs.");
  await page.waitForLoadState("networkidle");
  expect(wholeRereads, "no reread of the catalog or of the business list").toEqual([]);

  await page.goto(`/app/workspace?${new URLSearchParams({ path: root })}`);
  await expect(page.getByTestId(`workspace-resource-title-${piece.id}`)).toBeVisible();
  await page.waitForLoadState("networkidle");
  wholeRereads.length = 0;
  folderReads.length = 0;
  await save(piece.id, "Pièce modifiée ailleurs.");
  await expect
    .poll(() => folderReads.length, { message: "the folder of the saved piece is read again" })
    .toBeGreaterThan(0);
  await page.waitForLoadState("networkidle");
  expect(wholeRereads, "no reread of the catalog or of the business list").toEqual([]);
  await page.getByTestId(`workspace-resource-title-${piece.id}`).click();
  await expect(page.getByTestId("resource-workbench")).toContainText("Pièce modifiée ailleurs.");
});

// @verifies-requirement HALL-FR-WSP-370
test("the Documents screen offers on a business the actions of that business, with requests that do not grow with the businesses listed", async ({
  appPage: page,
}) => {
  const marker = crypto.randomUUID().slice(0, 8);
  test.setTimeout(120_000);
  const folders = { few: `Peu d'affaires ${marker}`, many: `Beaucoup d'affaires ${marker}` };
  const businesses: Record<keyof typeof folders, string[]> = { few: [], many: [] };
  for (const [size, count] of [
    ["few", 2],
    ["many", 12],
  ] as const) {
    await created(
      await page.request.post("/api/resources", { data: { kind: "folder", path: "", name: folders[size] } }),
    );
    for (let index = 0; index < count; index += 1) {
      const business = await created(
        await page.request.post("/api/council-business", {
          data: { path: folders[size], name: `Affaire ${index + 1}`, reportName: "Rapport", reportContent: "" },
        }),
      );
      businesses[size].push(business.id);
    }
  }
  let reads: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname.startsWith("/api/council-business"))
      reads.push(url.pathname + url.search);
  });
  const readsOpening = async (folder: string, first: string) => {
    await page.goto("/app/");
    await page.waitForLoadState("networkidle");
    reads = [];
    await page.goto(`/app/workspace?${new URLSearchParams({ path: folder })}`);
    await expect(page.getByTestId(`workspace-business-${first}`)).toBeVisible();
    await page.waitForLoadState("networkidle");
    return reads;
  };
  const few = await readsOpening(folders.few, businesses.few[0]!);
  const many = await readsOpening(folders.many, businesses.many[0]!);
  const perBusiness = /^\/api\/council-business\/[0-9a-f-]{36}/;
  expect(
    [...few, ...many].filter((read) => perBusiness.test(read)),
    "no read of one business at a time",
  ).toEqual([]);
  expect(many.length, `reads for 12 businesses against ${few.length} for 2`).toBeLessThanOrEqual(few.length);

  // The commands of a business row follow the actions of the business read on its own.
  const single = (await (await page.request.get(`/api/council-business/${businesses.many[5]}`)).json()) as {
    actions?: Array<{ name: string }>;
  };
  const actions = new Set((single.actions ?? []).map((action) => action.name));
  await page.getByTestId(`workspace-business-${businesses.many[5]}`).click({ button: "right" });
  const menu = page.getByRole("menu");
  for (const [item, action] of [
    ["workspace-tree-delete-business", "council-business.delete"],
    ["workspace-tree-export-bundle", "council-business.export-bundle"],
    ["workspace-tree-attach-document", "council-business.associate-resource"],
  ] as const)
    await expect(menu.getByTestId(item), item).toHaveCount(actions.has(action) ? 1 : 0);
  expect(actions.has("council-business.associate-resource")).toBe(true);
});
