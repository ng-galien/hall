import { crc32 } from "node:zlib";
import { expect, test } from "../fixtures/application";

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

// @verifies-requirement HALL-FR-WSP-370
// @verifies-requirement HALL-FR-DOC-480
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
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const tree = section.getByTestId("business-resource-tree");
  await expect(tree).toBeVisible();

  const chevronBox = await toggle.locator("svg").first().boundingBox();
  const titleBox = await toggle.locator(".collapsible-section-title").boundingBox();
  expect(chevronBox && titleBox).toBeTruthy();
  expect(
    Math.abs(chevronBox!.y + chevronBox!.height / 2 - (titleBox!.y + titleBox!.height / 2)),
    "The chevron is aligned with the title",
  ).toBeLessThanOrEqual(2);
  const restingBackground = await toggle.evaluate((element) => getComputedStyle(element).backgroundColor);
  await toggle.hover();
  await expect
    .poll(() => toggle.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(restingBackground);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(tree).toBeHidden();
  await expect(page.getByTestId("resource-picker-open")).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(tree).toBeVisible();

  const viewer = page.getByTestId("resource-preview");
  await page.getByTestId(`business-document-view-${text.id}`).click();
  await expect(viewer).toBeVisible();
  await expect(viewer).toHaveAttribute("data-resource-mode", "edit");
  await expect(viewer.getByTestId("editor-writing-area").locator("strong")).toHaveText("rendu");
  await expect(viewer.getByTestId("editor-writing-area")).toHaveAttribute("contenteditable", "true");
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
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();

  await page.getByTestId(`business-document-view-${archive.id}`).click();
  await expect(viewer).toBeVisible();
  await expect(viewer.getByTestId("resource-preview-object-unavailable")).toBeVisible();
  const download = page.waitForEvent("download");
  await viewer.getByTestId("resource-preview-download").click();
  expect((await download).suggestedFilename()).toBe("releves.odt");
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();

  await page.getByTestId(`business-document-view-${map.id}`).click();
  await expect(viewer).toBeVisible();
  await expect(viewer).toHaveAttribute("data-resource-mode", "edit");
  await viewer.getByTestId("geographic-mode-draw").click();
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
