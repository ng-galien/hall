import { openMenuEntry } from "../fixtures/application";
import { capture, expect, test } from "./fixtures";

test.setTimeout(3 * 60_000);
test.use({ seedScenario: "default" });

test("délibérations après le vote : du brouillon au document figé", async ({ docsPage: page }) => {
  const journey = "deliberations";
  await openMenuEntry(page, "council-decisions");
  await expect(page.getByTestId("decisions-page")).toBeVisible();
  await capture(page, `${journey}/01-liste-des-deliberations`);

  await page
    .getByTestId(/^decision-open-/)
    .first()
    .click();
  await expect(page.getByTestId("decision-detail")).toBeVisible();
  await expect(page.getByTestId("decision-view")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await capture(page, `${journey}/02-fiche-de-la-deliberation`);

  await page.getByTestId("decision-submitted-toggle").click();
  await expect(page.getByTestId("decision-submitted-text")).toBeVisible();
  await capture(page, `${journey}/03-texte-soumis-au-vote`);
  await page.getByTestId("decision-submitted-toggle").click();

  await page.getByTestId("decision-view").click();
  await expect(page.getByTestId("decision-document-dialog")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await capture(page, `${journey}/04-apercu`);
  await page.getByTestId("decision-document-close").click();
  await expect(page.getByTestId("decision-document-dialog")).toBeHidden();

  await page.getByTestId("decision-freeze").click();
  await expect(page.getByTestId("decision-freeze-dialog")).toBeVisible();
  await capture(page, `${journey}/05-figer-le-document`);
  await page.getByTestId("decision-freeze-confirm").click();
  await expect(page.getByTestId("decision-download")).toBeVisible({ timeout: 60_000 });
  await capture(page, `${journey}/06-document-fige`);
});
