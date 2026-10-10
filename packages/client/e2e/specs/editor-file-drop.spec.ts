import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";

const minimalPdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
    "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n" +
    "trailer<</Size 4/Root 1 0 R>>\nstartxref\n170\n%%EOF\n",
);
const docx = readFileSync(new URL("../../../server/src/__tests__/fixtures/document-preview.docx", import.meta.url));
const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface DroppedFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

async function dropFiles(page: Page, editor: Locator, files: DroppedFile[]): Promise<void> {
  const area = editor.getByTestId("editor-writing-area");
  const transfer = await page.evaluateHandle(
    (entries) => {
      const dataTransfer = new DataTransfer();
      for (const { content, name, mimeType } of entries)
        dataTransfer.items.add(new File([Uint8Array.from(content)], name, { type: mimeType }));
      return dataTransfer;
    },
    files.map(({ buffer, name, mimeType }) => ({ content: [...buffer], name, mimeType })),
  );
  await area.dispatchEvent("dragenter", { dataTransfer: transfer });
  await expect(editor.getByTestId("editor-image-drop-zone")).toHaveAttribute("data-documents", "true");
  const box = await area.boundingBox();
  expect(box).not.toBeNull();
  await area.dispatchEvent("drop", {
    dataTransfer: transfer,
    clientX: Math.round((box?.x ?? 0) + 30),
    clientY: Math.round((box?.y ?? 0) + 20),
  });
}

async function reportContent(page: Page, reportResourceId: string): Promise<string> {
  const response = await page.request.get(`/api/resources/${reportResourceId}`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { properties: { content: string } }).properties.content;
}

// @verifies-requirement HALL-FR-DOC-500
test("files dropped on the business report editor become cited documents of the business", async ({
  appPage: page,
}) => {
  const created = await page.request.post("/api/council-business", {
    data: { path: "seed", name: `Dépôt ${crypto.randomUUID()}`, reportName: "Report", reportContent: "Rapport." },
  });
  expect(created.ok()).toBeTruthy();
  const business = (await created.json()).properties as { id: string; reportResourceId: string };

  await page.goto(`/app/workspace?path=seed&councilBusiness=${business.id}`);
  const compact = page.getByTestId("business-report-editor").getByTestId("markdown-editor-compact");
  await expect(compact).toBeVisible();
  await expect(page.getByTestId("business-documents-empty")).toBeVisible();

  await dropFiles(page, compact, [
    { name: "plan.pdf", mimeType: "application/pdf", buffer: minimalPdf },
    { name: "notes.md", mimeType: "text/markdown", buffer: Buffer.from("# Notes") },
    { name: "deliberation.docx", mimeType: docxType, buffer: docx },
  ]);

  const status = compact.getByTestId("editor-image-status");
  await expect(status).toHaveAttribute("data-status", "documentRefused");
  await expect(status).toContainText("notes.md");
  await expect(status).toContainText(".pdf");
  const references = compact.locator(".editor-reference-wrapper");
  await expect(references).toHaveText(["plan.pdf", "deliberation.docx"]);
  await expect(page.getByTestId("business-category-documents-count")).toHaveText("2");
  const tree = page.getByTestId("business-resource-tree");
  await expect(tree).toContainText("plan.pdf");
  await expect(tree).toContainText("deliberation.docx");
  await expect
    .poll(() => reportContent(page, business.reportResourceId), { timeout: 15_000 })
    .toMatch(/:resource\[plan\.pdf\]\{#[0-9a-f-]{36}\} :resource\[deliberation\.docx\]\{#[0-9a-f-]{36}\}/);

  await compact.getByTestId("editor-writing-area").click();
  await compact.getByTestId("editor-open-enriched").click();
  const enriched = page.getByTestId("markdown-editor-enriched");
  await expect(enriched).toBeVisible();
  await dropFiles(page, enriched, [{ name: "annexe.pdf", mimeType: "application/pdf", buffer: minimalPdf }]);
  await expect(enriched.locator(".editor-reference-wrapper").filter({ hasText: "annexe.pdf" })).toHaveCount(1);
  await expect(page.getByTestId("business-category-documents-count")).toHaveText("3");
});

// @verifies-requirement HALL-FR-DOC-510
test("a csv dropped on the business report editor becomes a table of the text, the rest attached", async ({
  appPage: page,
}) => {
  const created = await page.request.post("/api/council-business", {
    data: { path: "seed", name: `Tableau ${crypto.randomUUID()}`, reportName: "Report", reportContent: "Rapport." },
  });
  expect(created.ok()).toBeTruthy();
  const business = (await created.json()).properties as { id: string; reportResourceId: string };
  await page.goto(`/app/workspace?path=seed&councilBusiness=${business.id}`);
  const compact = page.getByTestId("business-report-editor").getByTestId("markdown-editor-compact");
  await expect(compact).toBeVisible();

  const smallCsv = "Commune;Montant\nAlésia;1200\nGergovie;850\n";
  await dropFiles(page, compact, [{ name: "subventions.csv", mimeType: "text/csv", buffer: Buffer.from(smallCsv) }]);
  await page.getByTestId("editor-spreadsheet-drop-table").click();
  const table = compact.locator("table").first();
  await expect(table.locator("tr")).toHaveCount(3);
  await expect(table).toContainText("Alésia");
  await expect(table).toContainText("850");
  await expect(page.getByTestId("business-documents-empty")).toBeVisible();
  await expect
    .poll(() => reportContent(page, business.reportResourceId), { timeout: 15_000 })
    .toMatch(/\|\s*Gergovie\s*\|\s*850\s*\|/);

  const largeCsv = ["Ligne;Valeur", ...Array.from({ length: 105 }, (_, index) => `L${index + 1};${index + 1}`)].join(
    "\n",
  );
  await dropFiles(page, compact, [{ name: "releves.csv", mimeType: "text/csv", buffer: Buffer.from(largeCsv) }]);
  await page.getByTestId("editor-spreadsheet-drop-table").click();
  const status = compact.getByTestId("editor-image-status");
  await expect(status).toHaveAttribute("data-status", "tableTruncated");
  await expect(status).toContainText("100");
  await expect(status).toContainText("105");
  await expect(compact.locator(".editor-reference-wrapper")).toHaveText(["releves"]);
  await expect(page.getByTestId("business-category-documents-count")).toHaveText("1");
  await expect
    .poll(() => reportContent(page, business.reportResourceId), { timeout: 15_000 })
    .toMatch(/\|\s*L100\s*\|\s*100\s*\|[\s\S]*:resource\[releves\]\{#[0-9a-f-]{36}\}/);
  expect(await reportContent(page, business.reportResourceId)).not.toContain("L101");
});
