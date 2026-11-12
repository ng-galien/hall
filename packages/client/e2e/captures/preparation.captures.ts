import { capture, expect, test } from "./fixtures";

test.setTimeout(3 * 60_000);
test.use({ seedScenario: "preparation" });

test("préparation d’une affaire : création, rapport, documents, élément préparé", async ({ docsPage: page }) => {
  const journey = "preparation";
  await page.goto("/app/workspace");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("workspace-create-menu").first().click();
  await expect(page.getByTestId("workspace-create-councilMatter")).toBeVisible();
  await capture(page, `${journey}/01-nouveau`);
  await page.getByTestId("workspace-create-councilMatter").click();
  await expect(page.getByTestId("workspace-create-name")).toBeVisible();
  await page.getByTestId("workspace-create-name").fill("Réfection du pont de la Laume");
  await capture(page, `${journey}/02-nouvelle-affaire`);
  await page.getByTestId("workspace-create-submit").click();
  await expect(page.getByTestId("business-report-editor")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await capture(page, `${journey}/03-affaire-creee`);

  await page.getByTestId("business-report-editor").click();
  await page.keyboard.type(
    "Le pont de la Laume, emprunté par les convois de ravitaillement, montre des poutres fendues. Le conseil doit décider de sa réfection avant l’hiver et en fixer le financement.",
  );
  await page.waitForTimeout(2500);
  await capture(page, `${journey}/04-rapport`);

  await page.getByTestId("attachment-picker-open").first().click();
  await expect(page.getByTestId("attachment-picker-panel")).toBeVisible();
  await capture(page, `${journey}/05-joindre-un-document`);
  await page.keyboard.press("Escape");
});
