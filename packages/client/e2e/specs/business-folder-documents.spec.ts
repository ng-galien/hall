import type { Locator, Page, Response } from "@playwright/test";
import { expect, historySettled, test } from "../fixtures/application";

/* A document created from a business placed in a sub-folder goes into the folder of the business and joins it. */

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEElEQVR42mNk+M+ABzDhkAIAEwQCAiV7nNwAAAAASUVORK5CYII=",
  "base64",
);

const minimalPdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
    "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n" +
    "trailer<</Size 4/Root 1 0 R>>\nstartxref\n170\n%%EOF\n",
);

interface Business {
  id: string;
  parent: string;
  folder: string;
}

/** A business two folders below the root: its documents belong in `parent/name`, not in `parent`. */
async function businessInSubFolder(page: Page, label: string): Promise<Business> {
  const marker = crypto.randomUUID().slice(0, 8);
  const parent = `Voirie ${marker}/Routes`;
  const name = `Coupe de bois ${label}`;
  const created = await page.request.post("/api/council-business", {
    data: { path: parent, name, reportName: "Rapport", reportContent: "" },
  });
  expect(created.status(), await created.text()).toBe(201);
  return { id: (await created.json()).properties.id, parent, folder: `${parent}/${name}` };
}

async function resourcePath(page: Page, id: string) {
  const response = await page.request.get(`/api/resources/${id}`);
  expect(response.ok()).toBeTruthy();
  return ((await response.json()).properties as { path: string }).path;
}

async function businessResourceIds(page: Page, businessId: string) {
  const response = await page.request.get(`/api/council-business/resource-items?councilBusinessId=${businessId}`);
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return ((body.entities ?? []) as Array<{ properties: { id: string } }>).map((entry) => entry.properties.id);
}

function created(page: Page, suffix: string) {
  return page.waitForResponse(
    (response: Response) => response.request().method() === "POST" && response.url().endsWith(suffix),
  );
}

async function createText(page: Page, name: string) {
  await page.getByTestId("attachment-picker-create-text").click();
  await page.getByTestId("workspace-create-name").fill(name);
  const response = created(page, "/api/resources");
  await page.getByTestId("workspace-create-submit").click();
  const answer = await response;
  expect(answer.status()).toBe(201);
  return ((await answer.json()).properties as { id: string }).id;
}

async function importFile(page: Page, trigger: Locator, file: { name: string; mimeType: string; buffer: Buffer }) {
  const response = created(page, "/api/resources/documents");
  const chooser = page.waitForEvent("filechooser");
  await trigger.click();
  await (await chooser).setFiles(file);
  const answer = await response;
  expect(answer.ok(), await answer.text()).toBeTruthy();
  return ((await answer.json()).properties as { id: string }).id;
}

/** Each document is in the folder of the business, among its documents, and under the business unfolded in the explorer. */
async function expectInBusinessFolder(page: Page, business: Business, ids: string[]) {
  for (const id of ids) expect(await resourcePath(page, id), `path of ${id}`).toBe(business.folder);
  await expect.poll(() => businessResourceIds(page, business.id)).toEqual(expect.arrayContaining(ids));
  await page.goto(`/app/workspace?path=${encodeURIComponent(business.parent)}`);
  const expand = page.getByTestId(`workspace-business-expand-${business.id}`);
  await expect(expand).toBeVisible();
  if ((await expand.getAttribute("aria-expanded")) !== "true") await expand.click();
  const row = page.getByTestId(`workspace-business-${business.id}`);
  for (const id of ids) await expect(row.getByTestId(`workspace-resource-title-${id}`)).toBeVisible();
}

test.describe("documents created from a business in a sub-folder, on a computer", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // @verifies-requirement HALL-FR-WSP-460
  test("a text and an imported file created from « Joindre » of the business page or from the menu of its row go into its folder", async ({
    appPage: page,
  }) => {
    test.setTimeout(90_000);
    const business = await businessInSubFolder(page, "ordinateur");
    const ids: string[] = [];

    await page.goto(`/app/workspace?path=${encodeURIComponent(business.parent)}&councilBusiness=${business.id}`);
    await page.getByTestId("business-category-documents-toggle").click();
    await page.getByTestId("attachment-picker-open").click();
    ids.push(await createText(page, "Note de la page"));
    await page.getByTestId("resource-preview-close").click();
    await historySettled(page);
    await page.getByTestId("attachment-picker-open").click();
    ids.push(
      await importFile(page, page.getByTestId("attachment-picker-create-file"), {
        name: "Plan de la page.pdf",
        mimeType: "application/pdf",
        buffer: minimalPdf,
      }),
    );

    await page.goto(`/app/workspace?path=${encodeURIComponent(business.parent)}`);
    const row = page.getByTestId(`workspace-business-${business.id}`);
    await expect(row).toHaveAttribute("data-folder-import-enabled", "true");
    await row.click({ button: "right" });
    await page.getByTestId("workspace-tree-attach-document").click();
    ids.push(await createText(page, "Note de la ligne"));
    await page.goto(`/app/workspace?path=${encodeURIComponent(business.parent)}`);
    await expect(row).toHaveAttribute("data-folder-import-enabled", "true");
    await row.click({ button: "right" });
    await page.getByTestId("workspace-tree-attach-document").click();
    ids.push(
      await importFile(page, page.getByTestId("attachment-picker-create-file"), {
        name: "Plan de la ligne.pdf",
        mimeType: "application/pdf",
        buffer: minimalPdf,
      }),
    );

    await expectInBusinessFolder(page, business, ids);
  });
});

test.describe("documents created from a business in a sub-folder, on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  // @verifies-requirement HALL-FR-WSP-460
  test("a photo taken from « Joindre » of the business page or from the menu of its row goes into its folder", async ({
    appPage: page,
  }) => {
    test.setTimeout(90_000);
    const business = await businessInSubFolder(page, "téléphone");
    const ids: string[] = [];

    await page.goto(`/app/workspace?path=${encodeURIComponent(business.parent)}&councilBusiness=${business.id}`);
    await page.getByTestId("attachment-picker-open").click();
    ids.push(
      await importFile(page, page.getByTestId("attachment-picker-create-takePhoto"), {
        name: "image.png",
        mimeType: "image/png",
        buffer: png,
      }),
    );

    const capabilities = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/council-business" && response.request().method() === "GET",
    );
    await page.goto(`/app/workspace?path=${encodeURIComponent(business.parent)}`);
    const row = page.getByTestId(`workspace-business-${business.id}`);
    await expect(row).toBeVisible();
    await capabilities;
    await row.click({ button: "right" });
    await page.getByTestId("workspace-tree-attach-document").click();
    ids.push(
      await importFile(page, page.getByTestId("attachment-picker-create-choosePhoto"), {
        name: "image.png",
        mimeType: "image/png",
        buffer: png,
      }),
    );

    for (const id of ids) expect(await resourcePath(page, id), `path of ${id}`).toBe(business.folder);
    await expect.poll(() => businessResourceIds(page, business.id)).toEqual(expect.arrayContaining(ids));
  });
});

for (const device of [
  { label: "computer", use: { viewport: { width: 1440, height: 900 } }, photo: false },
  { label: "phone", use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, photo: true },
] as const) {
  test.describe(`a business opened by its address on a ${device.label}`, () => {
    test.use(device.use);

    // @verifies-requirement HALL-FR-WSP-460
    test(`a text, a file${device.photo ? " and a photo" : ""} created from « Joindre » go into the folder of the business`, async ({
      appPage: page,
    }) => {
      test.setTimeout(90_000);
      const business = await businessInSubFolder(page, `adresse ${device.label}`);
      const ids: string[] = [];
      const open = async () => {
        await page.goto(`/app/workspace?councilBusiness=${business.id}`);
        await expect(page.getByTestId("council-business-workbench")).toBeVisible();
        if (!device.photo) {
          const toggle = page.getByTestId("business-category-documents-toggle");
          if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
        }
        await page.getByTestId("attachment-picker-open").click();
      };

      await open();
      ids.push(await createText(page, `Note par l’adresse ${device.label}`));
      await open();
      ids.push(
        await importFile(page, page.getByTestId("attachment-picker-create-file"), {
          name: `Plan par l’adresse ${device.label}.pdf`,
          mimeType: "application/pdf",
          buffer: minimalPdf,
        }),
      );
      if (device.photo) {
        await open();
        ids.push(
          await importFile(page, page.getByTestId("attachment-picker-create-takePhoto"), {
            name: "image.png",
            mimeType: "image/png",
            buffer: png,
          }),
        );
      }

      for (const id of ids) expect(await resourcePath(page, id), `path of ${id}`).toBe(business.folder);
      await expect.poll(() => businessResourceIds(page, business.id)).toEqual(expect.arrayContaining(ids));
    });
  });
}
