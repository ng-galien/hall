import { capture, expect, localDateTimeInput, test } from "./fixtures";

test.setTimeout(10 * 60_000);
test.use({ seedScenario: "preparation" });

test("ouvrir la séance : de la séance programmée à la séance ouverte", async ({ docsPage: page }) => {
  const journey = "ouvrir-la-seance";
  await page.getByRole("link", { name: "Séances" }).first().click();
  await expect(page.getByRole("heading", { name: "Séances du conseil" })).toBeVisible();
  await capture(page, `${journey}/01-liste-des-seances`);

  await page
    .getByRole("link", { name: /Conseil municipal 1/ })
    .first()
    .click();
  await expect(page.getByTestId("meeting-edit-details")).toBeVisible();

  await page.getByTestId("meeting-edit-details").click();
  await page.getByTestId("meeting-edit-starts-at").fill(localDateTimeInput(new Date(Date.now() - 30 * 60_000)));
  await page.getByTestId("meeting-edit-chair").click();
  await page.getByRole("option", { name: /Vercingétorix/ }).click();
  await page.getByTestId("meeting-edit-secretary").click();
  await page.getByRole("option", { name: /Commius/ }).click();
  await capture(page, `${journey}/02-proprietes-generales`);
  await page.getByTestId("meeting-edit-submit").click();
  await expect(page.getByText("Programmée", { exact: true })).toBeVisible();
  await capture(page, `${journey}/03-seance-programmee`);

  await page
    .getByTestId(/^agenda-candidate-add-/)
    .first()
    .click();
  await expect(page.getByTestId(/^agenda-item-position-/).first()).toBeVisible();
  await capture(page, `${journey}/04-point-inscrit`);

  await page.getByRole("button", { name: "Ordre du jour" }).click();
  await expect(page.getByTestId("meeting-freeze-agenda")).toBeVisible();
  await capture(page, `${journey}/05-figer-ordre-du-jour`);
  await page.getByTestId("meeting-freeze-agenda").click();
  await expect(page.getByTestId("meeting-generate-notice")).toBeVisible();
  await capture(page, `${journey}/06-generer-convocation`);
  await page.getByTestId("meeting-generate-notice").click();
  await expect(page.getByText("Visionneuse de document")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByText("Visionneuse de document")).toBeHidden();
  await expect(page.getByRole("button", { name: /Télécharger le courriel Outlook/ })).toBeVisible();
  await capture(page, `${journey}/07-convocation-generee`);
  await page.keyboard.press("Escape");

  await expect(page.getByTestId("meeting-enter-live")).toBeEnabled();
  await capture(page, `${journey}/08-passer-en-mode-seance`);
  await page.getByTestId("meeting-enter-live").click();
  await expect(page.getByTestId("live-rollcall-heading")).toBeVisible();
  await capture(page, `${journey}/09-appel-des-membres`);
  await page.getByTestId("live-attendance-all-present").click();
  await expect(page.getByTestId("live-meeting-start")).toBeEnabled();
  await capture(page, `${journey}/10-appel-complet`);
  await page.getByTestId("live-meeting-start").click();
  await expect(page.getByText(/Quorum : \d+ \/ \d+/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Commencer l’examen du point" })).toBeVisible();
  await capture(page, `${journey}/11-seance-ouverte`);
});
