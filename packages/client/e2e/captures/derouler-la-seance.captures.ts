import { capture, expect, test } from "./fixtures";
import { openMeeting } from "./journeys";

test.setTimeout(10 * 60_000);
test.use({ seedScenario: "preparation" });

test("dérouler la séance : examen du point, vote, clôture", async ({ docsPage: page }) => {
  const journey = "derouler-la-seance";
  await openMeeting(page);
  await capture(page, `${journey}/01-premier-point`);

  await page.getByTestId("live-recusal-info").click();
  await page.getByTestId("agenda-item-recusal-open").click();
  await expect(page.getByTestId("recusal-form")).toBeVisible();
  await capture(page, `${journey}/02-deports`);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("recusal-form")).toBeHidden();

  await page.getByTestId("live-agenda-start").click();
  await expect(page.getByTestId("live-ballot-open")).toBeVisible();
  await capture(page, `${journey}/03-discussion`);

  await page.getByTestId("live-ballot-open").click();
  await expect(page.getByTestId("live-ballot-all-for")).toBeVisible();
  await capture(page, `${journey}/04-vote-ouvert`);
  await page.getByTestId("live-ballot-all-for").click();
  await page
    .getByTestId(/^live-vote-member-/)
    .first()
    .click();
  await page.getByTestId("live-vote-assign-against").click();
  await capture(page, `${journey}/05-votes-saisis`);

  await page.getByTestId("live-ballot-preview-open").click();
  await expect(page.getByTestId("live-ballot-preview")).toBeVisible();
  await capture(page, `${journey}/06-previsualisation`);
  await page.getByTestId("live-ballot-preview-confirm").click();
  await expect(page.getByTestId("live-ballot-result")).toBeVisible();
  await capture(page, `${journey}/07-resultat`);

  await page.getByTestId("live-closed-session-open").click();
  await expect(page.getByTestId("live-closed-session-form")).toBeVisible();
  await capture(page, `${journey}/08-huis-clos`);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("live-closed-session-form")).toBeHidden();

  await page.getByRole("button", { name: "Présences" }).click();
  await expect(page.getByTestId("live-rollcall-heading")).toBeVisible();
  await capture(page, `${journey}/09-presences-en-seance`);
  await page.getByRole("button", { name: /Revenir à l’ordre du jour/ }).click();

  await expect(page.getByTestId("live-meeting-close")).toBeEnabled();
  await page.getByTestId("live-meeting-close").click();
  await expect(page.getByTestId("live-meeting-close")).toContainText("Confirmer");
  await capture(page, `${journey}/10-confirmer-la-cloture`);
  await page.getByTestId("live-meeting-close").click();
  await expect(page).not.toHaveURL(/\/live$/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await capture(page, `${journey}/11-seance-close`);
});
