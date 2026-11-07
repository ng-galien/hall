import { capture, expect, test, waitForPageEntrance } from "./fixtures";
import { openMeeting } from "./journeys";

test.setTimeout(3 * 60_000);
test.use({ seedScenario: "preparation" });

test("dérouler la séance : examen du point, vote, clôture", async ({ docsPage: page }) => {
  const journey = "derouler-la-seance";
  await openMeeting(page);
  await capture(page, `${journey}/01-premier-point`);

  // Le premier point est l’arrêt du procès-verbal précédent : il se vote sans captures.
  await page.getByTestId("live-agenda-start").click();
  await page.getByTestId("live-ballot-open").click();
  await page.getByTestId("live-ballot-all-for").click();
  await page.getByTestId("live-ballot-preview-open").click();
  await expect(page.getByTestId("live-ballot-preview")).toBeVisible();
  await page.getByTestId("live-ballot-preview-confirm").click();
  await expect(page.getByTestId("live-ballot-preview")).toBeHidden();
  await page
    .getByTestId(/^live-agenda-item-/)
    .nth(1)
    .click();
  await expect(page.getByTestId("live-agenda-start")).toBeVisible();
  await capture(page, `${journey}/02-projet-de-deliberation`);

  await page.getByTestId("live-recusal-info").click();
  await page.getByTestId("agenda-item-recusal-open").click();
  await expect(page.getByTestId("recusal-form")).toBeVisible();
  await capture(page, `${journey}/03-deports`);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("recusal-form")).toBeHidden();

  await page.getByTestId("live-agenda-start").click();
  await expect(page.getByTestId("live-ballot-open")).toBeVisible();
  await capture(page, `${journey}/04-discussion`);

  await page.getByTestId("live-ballot-open").click();
  await expect(page.getByTestId("live-ballot-all-for")).toBeVisible();
  await capture(page, `${journey}/05-vote-ouvert`);
  await page.getByTestId("live-ballot-all-for").click();
  await page
    .getByTestId(/^live-vote-member-/)
    .first()
    .click();
  await page.getByTestId("live-vote-assign-against").click();
  await capture(page, `${journey}/06-votes-saisis`);

  await page.getByTestId("live-ballot-preview-open").click();
  await expect(page.getByTestId("live-ballot-preview")).toBeVisible();
  await capture(page, `${journey}/07-previsualisation`);
  await page.getByTestId("live-ballot-preview-confirm").click();
  await expect(page.getByTestId("live-ballot-preview")).toBeHidden();
  await page
    .getByTestId(/^live-agenda-item-/)
    .nth(1)
    .click();
  await expect(page.getByTestId("live-ballot-result")).toBeVisible();
  await capture(page, `${journey}/08-resultat`);

  await page.getByTestId("live-closed-session-open").click();
  await expect(page.getByTestId("live-closed-session-form")).toBeVisible();
  await capture(page, `${journey}/09-huis-clos`);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("live-closed-session-form")).toBeHidden();

  await page.getByRole("button", { name: "Présences" }).click();
  await expect(page.getByTestId("live-rollcall-heading")).toBeVisible();
  await capture(page, `${journey}/10-presences-en-seance`);
  await page.getByRole("button", { name: /Revenir à l’ordre du jour/ }).click();

  await expect(page.getByTestId("live-meeting-close")).toBeEnabled();
  await page.getByTestId("live-meeting-close").click();
  await expect(page.getByTestId("live-meeting-close")).toContainText(/Confirmer|non examiné/);
  await capture(page, `${journey}/11-confirmer-la-cloture`);
  await page.getByTestId("live-meeting-close").click();
  await expect(page).not.toHaveURL(/\/live$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Séances du conseil" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Terminée", { exact: true }).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await waitForPageEntrance(page);
  await page.mouse.move(800, 700);
  await capture(page, `${journey}/12-seance-close`);

  const meetings = (
    (await (await page.request.get("/api/council-meetings")).json()) as {
      entities: Array<{ properties: { id: string; closedAt: string | null } }>;
    }
  ).entities.map((entity) => entity.properties);
  const closed = meetings
    .filter((meeting) => meeting.closedAt)
    .toSorted((left, right) => right.closedAt!.localeCompare(left.closedAt!))[0]!;
  await page.goto(`/app/meetings/${closed.id}`);
  await expect(page.getByTestId("meeting-document-deliberation-list-open")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await waitForPageEntrance(page);
  await capture(page, `${journey}/13-liste-des-deliberations`);
  await page.getByTestId("meeting-document-deliberation-list-open").click();
  await expect(page.getByTestId("document-object-viewer")).toBeVisible();
});
