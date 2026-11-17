import type { Locator, Page } from "@playwright/test";
import { expect, runItemCommand, test } from "../fixtures/application";

/* A document dropped on a business or moved there by « Déplacer vers… » goes into the folder of the business and joins
   it; « Joindre un document existant » leaves it in place. */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
});

interface Place {
  root: string;
  sorting: string;
  businessId: string;
  businessFolder: string;
}

async function place(page: Page): Promise<Place> {
  const marker = crypto.randomUUID().slice(0, 8);
  const root = `Déplacements ${marker}`;
  const sorting = `${root}/Classement`;
  const folder = await page.request.post("/api/resources", {
    data: { kind: "folder", path: root, name: "Classement" },
  });
  expect(folder.status()).toBe(201);
  const name = "Coupe de bois sur route communale";
  const business = await page.request.post("/api/council-business", {
    data: { path: root, name, reportName: "Rapport", reportContent: "" },
  });
  expect(business.status(), await business.text()).toBe(201);
  return { root, sorting, businessId: (await business.json()).properties.id, businessFolder: `${root}/${name}` };
}

async function text(page: Page, path: string, name: string) {
  const response = await page.request.post("/api/resources", { data: { kind: "text", path, name, content: "Texte." } });
  expect(response.status()).toBe(201);
  return (await response.json()).properties.id as string;
}

async function resourcePath(page: Page, id: string) {
  return ((await (await page.request.get(`/api/resources/${id}`)).json()).properties as { path: string }).path;
}

async function businessResourceIds(page: Page, businessId: string) {
  const response = await page.request.get(`/api/council-business/resource-items?councilBusinessId=${businessId}`);
  const body = await response.json();
  return ((body.entities ?? []) as Array<{ properties: { id: string } }>).map((entry) => entry.properties.id);
}

function alerts(page: Page) {
  return page.locator('[role="alert"]:visible');
}

const synthetic: string[] = [];

/** A real drag of the mouse; the drag events are dispatched only when the browser drag did not reach the target. */
async function drag(page: Page, source: Locator, target: Locator, label: string, arrived: () => Promise<boolean>) {
  await source.dragTo(target);
  const reached = await expect
    .poll(arrived, { timeout: 5_000 })
    .toBe(true)
    .then(
      () => true,
      () => false,
    );
  if (reached) return;
  synthetic.push(label);
  test.info().annotations.push({ type: "synthetic drag", description: label });
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  const dragged = await source.elementHandle();
  await dragged?.dispatchEvent("dragstart", { dataTransfer: transfer });
  await target.dispatchEvent("dragenter", { dataTransfer: transfer });
  await target.dispatchEvent("dragover", { dataTransfer: transfer });
  await target.dispatchEvent("drop", { dataTransfer: transfer });
  await dragged?.dispatchEvent("dragend", { dataTransfer: transfer });
  await transfer.dispose();
}

test.describe("moving documents on a computer", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // @verifies-requirement HALL-FR-WSP-090
  test("a document dropped on a business, in the explorer and in the menu tree, goes into its folder and joins it; dropped again it stays without error", async ({
    appPage: page,
  }) => {
    test.setTimeout(90_000);
    const where = await place(page);
    const first = await text(page, where.root, "Devis élagage");
    const second = await text(page, where.root, "Arrêté de circulation");
    const filed = (id: string) => async () =>
      (await resourcePath(page, id)) === where.businessFolder &&
      (await businessResourceIds(page, where.businessId)).includes(id);

    await page.goto(`/app/workspace?path=${encodeURIComponent(where.root)}`);
    const businessTitle = page.getByTestId(`workspace-business-title-${where.businessId}`);
    await drag(page, page.getByTestId(`workspace-resource-${first}`), businessTitle, "explorer", filed(first));
    await expect.poll(filed(first)).toBe(true);
    await expect(alerts(page)).toHaveCount(0);

    const treeBusiness = page
      .getByTestId("workspace-tree")
      .locator(
        `[data-testid="workspace-sidebar-link"][data-kind="councilBusiness"][data-path="${where.businessFolder}"]`,
      );
    await expect(treeBusiness).toBeVisible();
    await drag(page, page.getByTestId(`workspace-resource-${second}`), treeBusiness, "menu tree", filed(second));
    await expect.poll(filed(second)).toBe(true);
    await expect(alerts(page)).toHaveCount(0);

    // Dropped again on the same business, both documents stay as they are and no error is written.
    await page.goto(`/app/workspace?path=${encodeURIComponent(where.root)}`);
    await page.getByTestId(`workspace-business-expand-${where.businessId}`).click();
    const row = page.getByTestId(`workspace-business-${where.businessId}`);
    await expect(row.getByTestId(`workspace-resource-${first}`)).toBeVisible();
    await row.getByTestId(`workspace-resource-${first}`).dragTo(businessTitle);
    await row.getByTestId(`workspace-resource-${second}`).dragTo(treeBusiness);
    await page.waitForTimeout(1_000);
    await expect(alerts(page)).toHaveCount(0);
    expect(await filed(first)()).toBe(true);
    expect(await filed(second)()).toBe(true);
    expect((await businessResourceIds(page, where.businessId)).filter((id) => id === first)).toHaveLength(1);
  });

  // @verifies-requirement HALL-FR-WSP-090
  test("« Déplacer vers… » moves a document to a folder, to a business and to the root, and a taken name gives one error in the window", async ({
    appPage: page,
  }) => {
    test.setTimeout(90_000);
    const where = await place(page);
    const moved = await text(page, where.root, "Plan de coupe");
    const twin = await text(page, where.root, "Doublon");
    await text(page, where.sorting, "Doublon");

    await page.goto(`/app/workspace?path=${encodeURIComponent(where.root)}`);
    await page.getByTestId(`workspace-resource-title-${moved}`).click({ button: "right" });
    await page.getByTestId("workspace-tree-move-to").click();
    const dialog = page.getByTestId("move-to-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId(`move-to-business-${where.businessId}`)).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("move-to-dialog.png") });
    await dialog.getByTestId(`move-to-folder-${where.sorting}`).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => resourcePath(page, moved)).toBe(where.sorting);

    await page.goto(`/app/workspace?path=${encodeURIComponent(where.sorting)}&resource=${moved}`);
    await runItemCommand(page, "resource-move-to");
    await dialog.getByTestId(`move-to-business-${where.businessId}`).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => resourcePath(page, moved)).toBe(where.businessFolder);
    await expect.poll(() => businessResourceIds(page, where.businessId)).toContain(moved);

    await runItemCommand(page, "resource-move-to");
    await dialog.getByTestId("move-to-root").click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => resourcePath(page, moved)).toBe("");
    await expect(alerts(page)).toHaveCount(0);

    await page.goto(`/app/workspace?path=${encodeURIComponent(where.root)}&resource=${twin}`);
    await runItemCommand(page, "resource-move-to");
    await dialog.getByTestId(`move-to-folder-${where.sorting}`).click();
    await expect(dialog).toBeVisible();
    await expect(alerts(page)).toHaveCount(1);
    await expect(dialog.locator('[role="alert"]')).toContainText("porte déjà ce nom");
    // The error is read where the person chose the destination: it is within the visible part of the window.
    await expect(dialog.locator('[role="alert"]')).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath("move-to-refused.png") });
    expect(await resourcePath(page, twin)).toBe(where.root);
  });

  // @verifies-requirement HALL-FR-WSP-090
  // @verifies-requirement HALL-FR-WSP-140
  test("« Joindre un document existant » from the business page attaches the document and leaves it in its folder", async ({
    appPage: page,
  }) => {
    const where = await place(page);
    const kept = await text(page, where.sorting, "Rapport de l’ONF");
    await page.goto(`/app/workspace?path=${encodeURIComponent(where.root)}&councilBusiness=${where.businessId}`);
    await page.getByTestId("business-category-documents-toggle").click();
    await page.getByTestId("attachment-picker-open").click();
    await page.getByTestId("attachment-picker-search-input").fill("Rapport de l’ONF");
    await page.getByTestId("attachment-picker-search-result").first().click();
    await expect(page.getByTestId(`business-attached-resource-${kept}`)).toBeVisible();
    await expect.poll(() => businessResourceIds(page, where.businessId)).toContain(kept);
    expect(await resourcePath(page, kept)).toBe(where.sorting);
  });
});

test.describe("moving documents on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  // @verifies-requirement HALL-FR-WSP-090
  test("« Déplacer vers… » of the phone opens a bottom sheet and moves the document into the business", async ({
    appPage: page,
  }) => {
    const where = await place(page);
    const moved = await text(page, where.root, "Photo du chemin");
    await page.goto(`/app/workspace?path=${encodeURIComponent(where.root)}&resource=${moved}`);
    await page.getByTestId("phone-document-actions").click();
    await page.getByTestId("phone-document-action-move").click();
    const dialog = page.getByTestId("move-to-dialog");
    await expect(dialog).toBeVisible();
    await page.evaluate(() =>
      Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
    );
    const box = await dialog.boundingBox();
    if (!box) throw new Error("The move window must be rendered");
    expect(box.y + box.height, "the window stands on the bottom edge").toBeGreaterThanOrEqual(844 - 1);
    expect(box.width, "the window takes the width of the screen").toBeGreaterThanOrEqual(390 - 1);
    await page.screenshot({ path: test.info().outputPath("phone-move-to-sheet.png") });
    await dialog.getByTestId(`move-to-business-${where.businessId}`).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => resourcePath(page, moved)).toBe(where.businessFolder);
    await expect.poll(() => businessResourceIds(page, where.businessId)).toContain(moved);
  });
});

test.afterAll(() => {
  if (synthetic.length) console.log(`Drags dispatched as synthetic events: ${synthetic.join(", ")}`);
});
