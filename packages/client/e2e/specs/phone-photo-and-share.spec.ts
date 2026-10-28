import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";

/* A photo taken on the phone becomes an imported file of a folder, a council business or a map drawing, and Share
   hands a PDF to the device's share sheet. Chromium offers no share sheet under test: the page records the call. */

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

const photoName = /^Photo of \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.png$/;

async function resourceProperties(page: Page, id: string) {
  const response = await page.request.get(`/api/resources/${id}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()).properties as { id: string; kind: string; name: string; path: string };
}

async function takePhoto(page: Page, trigger: Locator) {
  const chooser = page.waitForEvent("filechooser");
  await trigger.click();
  await (await chooser).setFiles({ name: "image.png", mimeType: "image/png", buffer: png });
}

async function selectedResourceId(page: Page) {
  await expect(page).toHaveURL(/[?&]resource=[^&]+/);
  return new URL(page.url()).searchParams.get("resource")!;
}

async function expectCreationInHistory(page: Page) {
  await page.getByTestId("resource-changes-trigger").first().click();
  await expect(page.getByTestId("resource-changes-panel").getByTestId("resource-changes-item")).toHaveCount(1);
  await page.keyboard.press("Escape");
}

test.describe("Photos and sharing on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  // @verifies-requirement HALL-FR-WSP-460
  test("a photo taken or chosen on the phone becomes a file of the folder, the business and the drawing", async ({
    appPage: page,
  }) => {
    test.setTimeout(90_000);
    const marker = crypto.randomUUID().slice(0, 8);

    await page.goto("/app/workspace?path=seed");
    await expect(page.getByTestId("workspace-camera-input")).toHaveAttribute("capture", "environment");
    await expect(page.getByTestId("workspace-photo-input")).not.toHaveAttribute("capture");
    await page.getByTestId("workspace-create-menu").click();
    await takePhoto(page, page.getByTestId("workspace-create-takePhoto"));
    const folderPhoto = await resourceProperties(page, await selectedResourceId(page));
    expect(folderPhoto).toMatchObject({ kind: "document", path: "seed" });
    expect(folderPhoto.name).toMatch(photoName);
    await expectCreationInHistory(page);

    const created = await page.request.post("/api/council-business", {
      data: { path: "seed", name: `Chantier ${marker}`, reportName: "Report", reportContent: "" },
    });
    expect(created.ok()).toBeTruthy();
    const business = (await created.json()).properties as { id: string; folderPath: string };
    await page.goto(`/app/workspace?path=seed&councilBusiness=${business.id}`);
    await page.getByTestId("business-category-documents-toggle").click();
    await page.getByTestId("attachment-picker-open").click();
    await expect(page.getByTestId("attachment-picker-create-takePhoto")).toBeVisible();
    await takePhoto(page, page.getByTestId("attachment-picker-create-choosePhoto"));
    const businessPhotoId = await selectedResourceId(page);
    const businessPhoto = await resourceProperties(page, businessPhotoId);
    expect(businessPhoto.kind).toBe("document");
    expect(businessPhoto.name).toMatch(photoName);
    await expect
      .poll(async () => {
        const listed = await page.request.get(`/api/council-business/resource-items?councilBusinessId=${business.id}`);
        const body = await listed.json();
        return ((body.entities ?? []) as Array<{ properties: { id: string } }>).map((entry) => entry.properties.id);
      })
      .toContain(businessPhotoId);
    await expectCreationInHistory(page);

    const map = (
      await (
        await page.request.post("/api/resources", {
          data: { kind: "geographic", name: `Relevé ${marker}`, path: "seed" },
        })
      ).json()
    ).properties as { id: string; version: number; document: Record<string, unknown> };
    const drawingId = crypto.randomUUID();
    const saved = await page.request.put(`/api/resources/${map.id}/content`, {
      data: {
        kind: "geographic",
        expectedVersion: map.version,
        document: {
          ...map.document,
          view: { kind: "center", center: [4.5, 47.54], zoom: 16 },
          hallLayer: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                id: drawingId,
                properties: {
                  kind: "marker",
                  label: "Nid-de-poule",
                  visible: true,
                  style: { color: "#2255aa", size: "large" },
                },
                geometry: { type: "Point", coordinates: [4.5, 47.54] },
              },
            ],
          },
        },
      },
    });
    expect(saved.ok()).toBeTruthy();
    const note = await page.request.post(`/api/resources/${map.id}/feature-notes`, { data: { elementId: drawingId } });
    expect(note.ok()).toBeTruthy();
    const noteId = (await note.json()).properties.noteId as string;

    await page.goto(`/app/workspace?path=seed&resource=${map.id}`);
    const surface = page.locator(".workspace-bench .geographic-map");
    await expect(surface).toBeVisible();
    const box = await surface.boundingBox();
    if (!box) throw new Error("The map must be rendered");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const card = page.getByTestId("geographic-drawn-element-card");
    await expect(card.getByTestId("geographic-drawn-element-card-title")).toHaveText("Nid-de-poule");
    await expect(card.getByTestId("editor-camera-file")).toHaveAttribute("capture", "environment");
    await takePhoto(page, card.getByTestId("editor-take-photo"));
    await expect(card.locator(".editor-image-node")).toHaveCount(1);
    let imageId = "";
    await expect
      .poll(async () => {
        const content = (await resourceProperties(page, noteId)) as unknown as { content: string };
        imageId = /::image\[[^\]]*\]\{#([^\s}]+)/.exec(content.content)?.[1] ?? "";
        return imageId;
      })
      .not.toBe("");
    const drawingPhoto = await resourceProperties(page, imageId);
    expect(drawingPhoto).toMatchObject({ kind: "document", path: "seed" });
    expect(drawingPhoto.name).toMatch(photoName);
    await card.getByTestId("resource-changes-trigger").click();
    await expect(page.getByTestId("resource-changes-panel").getByTestId("resource-changes-item")).not.toHaveCount(0);
  });

  // @verifies-requirement HALL-FR-DOC-570
  test("Share hands the PDF itself to the phone's share sheet", async ({ appPage: page }) => {
    await page.addInitScript(() => {
      const recorded: Array<{ name: string; type: string; size: number; title?: string }> = [];
      Object.assign(window, { sharedFiles: recorded });
      Object.defineProperty(Navigator.prototype, "canShare", {
        configurable: true,
        value: (data: ShareData) => Boolean(data.files?.length),
      });
      Object.defineProperty(Navigator.prototype, "share", {
        configurable: true,
        value: async (data: ShareData) => {
          for (const file of data.files ?? [])
            recorded.push({ name: file.name, type: file.type, size: file.size, title: data.title });
        },
      });
    });
    const pdf = await uploadPdf(page);
    await page.goto(`/app/workspace?path=seed&resource=${pdf.id}`);
    await page.getByTestId("resource-workbench-share").click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { sharedFiles: unknown[] }).sharedFiles))
      .toEqual([{ name: "plan.pdf", type: "application/pdf", size: minimalPdf.length, title: "plan.pdf" }]);
  });
});

async function uploadPdf(page: Page) {
  const response = await page.request.post("/api/resources/documents", {
    multipart: { path: "seed", file: { name: "plan.pdf", mimeType: "application/pdf", buffer: minimalPdf } },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).properties as { id: string };
}

// @verifies-requirement HALL-FR-DOC-570
test("on a desktop browser without file sharing, Share downloads the PDF", async ({ appPage: page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "share", { configurable: true, value: undefined });
    Object.defineProperty(Navigator.prototype, "canShare", { configurable: true, value: undefined });
  });
  const pdf = await uploadPdf(page);
  await page.goto(`/app/workspace?path=seed&resource=${pdf.id}`);
  const download = page.waitForEvent("download", (candidate) => candidate.suggestedFilename() === "plan.pdf");
  await page.getByTestId("resource-workbench-share").click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe("plan.pdf");
});
