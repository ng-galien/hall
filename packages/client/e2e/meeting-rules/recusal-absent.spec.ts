import { expect, test } from "../captures/fixtures";
import { prepareMeeting } from "../captures/journeys";
import { councillors } from "./support";

test.setTimeout(3 * 60_000);
test.use({ seedScenario: "preparation" });

// @verifies-requirement HALL-FR-AGI-420
test("déport refusé à un membre absent, enregistré pour un membre présent", async ({ docsPage: page }) => {
  const [absent, present] = await councillors(page);
  await prepareMeeting(page);
  await page.getByTestId("live-attendance-all-present").click();
  await page.getByTestId(`live-attendance-${absent!.id}-absent`).click();
  await page.getByTestId("live-meeting-start").click();
  await expect(page.getByTestId("live-agenda-start")).toBeVisible();

  await page.getByTestId("live-recusal-info").click();
  await page.getByTestId("agenda-item-recusal-open").click();
  const form = page.getByTestId("recusal-form");
  await expect(form).toBeVisible();
  await page.getByTestId("recusal-member").click();
  await page
    .getByTestId("recusal-member-search-result")
    .and(page.locator(`[data-reference-id="${absent!.id}"]`))
    .click();
  await page.getByTestId("recusal-basis-personalInterest").check();
  await page.getByTestId("recusal-submit").click();
  await expect(form.getByRole("alert")).toContainText("Seul un membre présent ou représenté peut se déporter.");
  await expect(form).toBeVisible();

  await page.getByTestId("recusal-member").click();
  await page
    .getByTestId("recusal-member-search-result")
    .and(page.locator(`[data-reference-id="${present!.id}"]`))
    .click();
  await page.getByTestId("recusal-submit").click();
  await expect(form).toBeHidden();
  await page.getByTestId("live-recusal-info").click();
  await expect(page.getByTestId("live-recusal-info-content")).toBeVisible();
  await expect(page.getByTestId(`agenda-item-recusal-${present!.id}`)).toBeVisible();
});
