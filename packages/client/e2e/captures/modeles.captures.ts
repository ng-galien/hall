import type { Page } from "@playwright/test";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { capture, expect, test, waitForPageEntrance } from "./fixtures";

/** The document templates of Alésia: the list and the meeting notice template with a logo in its header. */
test.use({ seedScenario: "default" });

const blason = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIklEQVR42mNkYPhfz0AEYBxVSF+FjP//ExXGqAqHVjEwhgAAiAgP8WOfu5gAAAAASUVORK5CYII=",
  "base64",
);

async function templates(page: Page) {
  const response = await page.request.get("/api/templates");
  expect(response.ok()).toBeTruthy();
  return ((await response.json()).entities as Array<{ properties: { id: string; documentType: string } }>).map(
    (entity) => entity.properties,
  );
}

// @verifies-requirement HALL-FR-DOC-580
test("modèles de documents : la liste et la convocation avec son logo", async ({ docsPage: page }) => {
  const notice = (await templates(page)).find((entry) => entry.documentType === "meeting-notice")!;
  await page.goto("/app/templates");
  await expect(page.getByTestId(`template-row-${notice.id}`)).toBeVisible();
  await waitForPageEntrance(page);
  await capture(page, "ecrans/modeles-de-documents");

  await page.getByTestId(`template-row-${notice.id}`).click();
  const originalHeader = await page.getByTestId("template-header-source").inputValue();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("template-header-insert-image").click();
  await (await chooser).setFiles({ name: "blason.png", mimeType: "image/png", buffer: blason });
  const headerSource = `![blason.png](data:image/png;base64,${blason.toString("base64")})\n\n${originalHeader}`;
  await expect(page.getByTestId("template-header-source")).toHaveValue(headerSource);
  await waitForPageEntrance(page);
  await capture(page, "ecrans/modele-de-document");
  await page.getByTestId("template-save").click();
  await expect(page.getByTestId("template-saved")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("template-header-source")).toHaveValue(headerSource);
  await page.getByTestId("template-preview").click();
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
    const first = await pdf.getPage(1);
    const operations = await first.getOperatorList();
    expect(
      operations.fnArray.some(
        (operation) => operation === OPS.paintImageXObject || operation === OPS.paintInlineImageXObject,
      ),
      "the uploaded header logo is painted in the actual PDF page",
    ).toBe(true);
    const text = (await first.getTextContent()).items
      .map((item) => ("str" in item ? item.str + (item.hasEOL ? " " : "") : ""))
      .join("")
      .replace(/\s+/g, " ");
    expect(text).toContain("Alésia");
    expect(text).toContain("Convocation au conseil municipal");
  } finally {
    await loading.destroy();
  }
  await expect(page.getByTestId("template-header-source")).toHaveValue(headerSource);
});
