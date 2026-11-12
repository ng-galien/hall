import type { Page } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { expect, openMenuEntry, test } from "../fixtures/application";

test.use({ seedScenario: "default", builtInPdfViewer: true });

async function previewPdfText(page: Page): Promise<string> {
  const frame = page.getByTestId("template-preview-frame");
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("src", /\/api\/templates\/preview-pdf\//);
  const response = await page.request.get((await frame.getAttribute("src"))!);
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-type"]).toContain("application/pdf");
  const loading = getDocument({ data: new Uint8Array(await response.body()), useSystemFonts: true });
  try {
    const pdf = await loading.promise;
    expect(pdf.numPages).toBeGreaterThan(0);
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const content = await (await pdf.getPage(number)).getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? " " : "") : "")).join(""));
    }
    return pages.join(" ").replace(/\s+/g, " ").trim();
  } finally {
    await loading.destroy();
  }
}

// @verifies-requirement HALL-FR-CFG-010
// @verifies-requirement HALL-FR-CFG-020
// @verifies-requirement HALL-FR-CFG-030
test("configuration categories preserve mail settings and expose editable generation templates", async ({
  appPage: page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/app/settings?category=mail");
  const mail = page.getByTestId("settings-mail");
  await mail.getByTestId("settings-mail-outboundEmailReplyToAddress").fill("reply@example.test");
  for (const [field, value] of [
    ["outboundEmailSignatureMarkdown", "Signature UI"],
    ["outboundEmailFooterMarkdown", "Footer UI"],
  ]) {
    const editor = mail.getByTestId(`settings-mail-${field}`).getByTestId("editor-writing-area");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(value!);
  }
  await mail.getByTestId("settings-mail-save").click();
  await expect(mail.getByTestId("settings-mail-saved")).toBeVisible();
  await openMenuEntry(page, "administration-commune");
  await openMenuEntry(page, "administration-mail");
  await expect(mail.getByTestId("settings-mail-outboundEmailReplyToAddress")).toHaveValue("reply@example.test");
  await expect(mail.getByTestId("settings-mail-outboundEmailSignatureMarkdown")).toContainText("Signature UI");
  await page.reload();
  await expect(mail.getByTestId("settings-mail-outboundEmailFooterMarkdown")).toContainText("Footer UI");
  await openMenuEntry(page, "administration-documents");
  const response = await page.request.get("/api/templates");
  const templates = (await response.json()).entities.map(
    (entity: { properties: { id: string; documentType: string } }) => entity.properties,
  );
  for (const type of ["document-print", "meeting-dossier-cover", "meeting-dossier-point", "event-invitation"])
    expect(templates.some((entry: { documentType: string }) => entry.documentType === type)).toBe(true);
  const print = templates.find((entry: { documentType: string }) => entry.documentType === "document-print");
  await page.getByTestId(`template-row-${print.id}`).click();
  await expect(page.getByTestId("template-save")).toBeDisabled();
  await expect(page.getByTestId("template-unsaved")).toHaveCount(0);
  await page.getByTestId("template-stylesheet").fill("h1 { color: #123456; }");
  await page.getByTestId("template-header-source").fill("<div>Configured header</div>");
  await page.getByTestId("template-save").click();
  await expect(page.getByTestId("template-saved")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("template-stylesheet")).toHaveValue("h1 { color: #123456; }");
  await page.getByTestId("template-preview").click();
  const pdfText = await previewPdfText(page);
  expect(pdfText).toContain("Configured header");
  const previewResponse = await page.request.post("/api/templates/preview", { data: { ...print, context: {} } });
  expect(previewResponse.ok()).toBeTruthy();
  const preview = (await previewResponse.json()).properties;
  const documentExcerpt = await page.evaluate((html: string) => {
    const document = new DOMParser().parseFromString(html, "text/html");
    return Array.from(document.querySelectorAll("main h1, main h2, main p, main li"))
      .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
      .find((text) => text.length >= 20)
      ?.slice(0, 80);
  }, preview.html);
  expect(documentExcerpt, "the selected real document contains substantive text").toBeTruthy();
  expect(pdfText).toContain(documentExcerpt!);
});

// @verifies-requirement HALL-FR-CFG-020
test("all default templates preview real Alésia data with saved presentation", async ({ appPage: page }) => {
  const listing = await page.request.get("/api/templates");
  const templates = (await listing.json()).entities.map(
    (entry: { properties: Record<string, unknown> }) => entry.properties,
  );
  expect(templates.map(({ documentType, kind }) => `${documentType}:${kind}`).sort()).toEqual([
    "attendance-sheet:pdf",
    "council-decision:pdf",
    "deliberation-list:pdf",
    "document-print:pdf",
    "event-invitation:message",
    "meeting-dossier-cover:pdf",
    "meeting-dossier-point:pdf",
    "meeting-notice-message:message",
    "meeting-notice:pdf",
    "minutes:pdf",
    "proxy-form:pdf",
  ]);
  for (const template of templates) {
    const response = await page.request.post("/api/templates/preview", { data: { ...template, context: {} } });
    expect(response.ok(), JSON.stringify(await response.json())).toBeTruthy();
    const preview = (await response.json()).properties;
    expect(preview.sourceLabel, String(template.documentType)).toBeTruthy();
    expect(preview.diagnostics, String(template.documentType)).toEqual([]);
    expect(preview.html.length, String(template.documentType)).toBeGreaterThan(1000);
    expect(preview.html).not.toContain("Contenu d’exemple");
    expect(preview.html, String(template.documentType)).not.toContain("Commune non renseignée");
    expect(preview.html, String(template.documentType)).not.toContain("nom non renseigné");
    if (template.documentType === "council-decision") expect(preview.html).toContain("<h1>Commune de Alésia</h1>");
    if (template.kind === "pdf") {
      expect(template.headerHtml).toBeTruthy();
      expect(template.footerHtml).toBeTruthy();
    } else expect(preview.html).toContain("Démonstration Hall");
  }
  await page.goto(
    `/app/templates/${templates.find((entry: { documentType: string }) => entry.documentType === "minutes").id}`,
  );
  await page.getByTestId("template-preview").click();
  await expect(page.getByTestId("template-preview-source")).toContainText("Preview data: council meeting no.");
  const pdfText = await previewPdfText(page);
  expect(pdfText).toContain("Alésia");
  expect(pdfText).toContain("Procès-verbal");
});
