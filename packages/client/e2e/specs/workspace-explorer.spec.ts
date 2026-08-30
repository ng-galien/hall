import { expect, test } from "../fixtures/application";

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
