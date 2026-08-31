import { expect, test } from "../fixtures/application";

test("persists the complete multi-sheet Univer workbook without concurrent saves", async ({ appPage: page }) => {
  test.setTimeout(45_000);
  const resourcesResponse = await page.request.get("/api/resources");
  expect(resourcesResponse.ok()).toBeTruthy();
  const resources = (await resourcesResponse.json()) as {
    entities: Array<{ properties: { id: string; kind: string; folderPath: string } }>;
  };
  const spreadsheet = resources.entities.find(
    ({ properties }) => properties.kind === "spreadsheet" && properties.folderPath === "seed",
  )?.properties;
  expect(spreadsheet).toBeTruthy();
  const resourceId = spreadsheet!.id;

  const putBodies: Array<{
    document: {
      workbook: {
        sheetOrder: string[];
        sheets: Record<string, { cellData: Record<string, Record<string, { v?: unknown }>> }>;
      };
    };
  }> = [];
  let signalFirstSaveStarted: (() => void) | undefined;
  let releaseFirstSave: (() => void) | undefined;
  const firstSaveStarted = new Promise<void>((resolve) => {
    signalFirstSaveStarted = resolve;
  });
  const firstSaveReleased = new Promise<void>((resolve) => {
    releaseFirstSave = resolve;
  });
  await page.goto(`/app/workspace?path=seed&resource=${resourceId}`);
  const grid = page.getByTestId("spreadsheet-grid");
  await expect(grid).toBeVisible();
  await expect(grid).toHaveAttribute("aria-readonly", "false");
  await page.waitForTimeout(1_500);
  await page.route("**/api/resources/*/spreadsheet", async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    putBodies.push(route.request().postDataJSON());
    if (putBodies.length === 1) {
      signalFirstSaveStarted?.();
      await firstSaveReleased;
    }
    const response = await route.fetch();
    await route.fulfill({ response });
  });

  const editActiveCell = async (value: string) => {
    await page.keyboard.press("F2");
    await page.waitForTimeout(50);
    await page.keyboard.insertText(value);
    await page.keyboard.press("Enter");
  };

  await grid.click({ position: { x: 100, y: 265 } });
  await editActiveCell("Première sauvegarde");
  await firstSaveStarted;

  await editActiveCell("Dernière sauvegarde");
  await page.waitForTimeout(1_200);
  expect(putBodies).toHaveLength(1);
  await page.getByTestId("workspace-breadcrumb-close").click();
  await expect(page.getByTestId("spreadsheet-grid")).toHaveCount(0);

  releaseFirstSave?.();
  await expect.poll(() => putBodies.length).toBe(2);

  const finalWorkbook = putBodies[1]!.document.workbook;
  expect(finalWorkbook.sheetOrder).toEqual(["budget", "hypotheses"]);
  expect(finalWorkbook.sheets.budget?.cellData["5"]?.["0"]?.v).toBe("Première sauvegarde");
  expect(finalWorkbook.sheets.budget?.cellData["6"]?.["0"]?.v).toBe("Dernière sauvegarde");
  expect(finalWorkbook.sheets.hypotheses?.cellData["1"]?.["0"]?.v).toBe("Taux de TVA");

  await page.goto(`/app/workspace?path=seed&resource=${resourceId}`);
  await expect(page.getByTestId("spreadsheet-grid")).toBeVisible();
  const detailsResponse = await page.request.get(`/api/resources/${resourceId}`);
  expect(detailsResponse.ok()).toBeTruthy();
  const details = (await detailsResponse.json()) as {
    properties: { spreadsheet: { workbook: typeof finalWorkbook } };
  };
  expect(details.properties.spreadsheet.workbook).toMatchObject(finalWorkbook);
});

test.describe("workspace explorer", () => {
  test("keeps the workspace home focused on active council work", async ({ appPage: page }) => {
    await page.goto("/app/workspace");

    await expect(page.getByTestId("workspace-home-active-count")).toContainText("7");
    await expect(page.getByText("Subventions aux associations 2026", { exact: true })).toBeVisible();
    await expect(page.getByText("Éclairage public - engagement de la tranche 2", { exact: true })).toBeVisible();
    await expect(page.getByText("Cession de la parcelle AB 127", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Tarifs de la restauration scolaire 2026-2027", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("workspace-home-folder-travaux")).toBeVisible();
  });

  test("presents one filtered tree and previews documents directly", async ({ appPage: page }) => {
    await page.goto("/app/workspace?path=finances");
    const document = page
      .locator('[data-testid^="workspace-resource-open-"]')
      .filter({ hasText: "Compte administratif 2025" });

    await expect(page.getByTestId("workspace-view-all")).toHaveAttribute("aria-pressed", "true");
    await expect(document).toBeVisible();
    const business = page.locator('[data-testid^="workspace-business-open-"]').first();
    await expect(business).toBeVisible();
    await expect(business.locator('[data-testid^="workspace-business-lifecycle-"]')).toBeVisible();
    await expect(business).not.toContainText("pièce");
    await expect(document.locator('[data-testid^="workspace-resource-metadata-"]')).toContainText("PDF");
    await expect(document.locator('[data-testid^="workspace-resource-metadata-"]')).toContainText(
      /\d{2}\/\d{2}\/\d{4}/,
    );
    await expect(page.locator(".workspace-explorer-count")).toHaveCount(0);
    await expect(page.locator(".workspace-tree-count")).toHaveCount(0);

    await page.getByTestId("workspace-view-resources").click();
    await expect(page.locator('[data-testid^="workspace-business-open-"]')).toHaveCount(0);
    await expect(document).toBeVisible();

    await page.getByTestId("workspace-view-all").click();
    await page.getByTestId("workspace-tree-filter").fill("Compte administratif 2025");
    await expect(document).toBeVisible();
    await expect(page.locator('[data-testid^="workspace-resource-open-"]')).toHaveCount(1);

    await document.click();
    await expect(page.getByTestId("resource-preview")).toBeVisible();
    await expect(page.getByTestId("resource-preview-object")).toBeVisible();
    await page.getByTestId("resource-preview-close").click();
    await expect(page.getByTestId("resource-preview")).toHaveCount(0);
  });
});
