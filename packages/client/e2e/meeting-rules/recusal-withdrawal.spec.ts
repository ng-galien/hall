import { expect, test } from "../captures/fixtures";
import { prepareMeeting } from "../captures/journeys";
import { councillors } from "./support";

test.setTimeout(3 * 60_000);
test.use({ seedScenario: "preparation" });

// @verifies-requirement HALL-FR-AGI-430
test("déport retiré avant le résultat : le membre revient parmi les votants", async ({ docsPage: page }, testInfo) => {
  const [voter, recused] = await councillors(page);
  await page.getByText("Conseil municipal", { exact: true }).first().click();
  await prepareMeeting(page);
  await page.getByTestId("live-attendance-all-present").click();
  await page.getByTestId("live-meeting-start").click();
  await page.getByTestId("live-agenda-start").click();
  await page.getByTestId("live-ballot-open").click();
  await page.getByTestId(`live-vote-member-${voter!.id}`).click();
  await page.getByTestId("live-vote-assign-against").click();
  await expect(page.getByTestId(`live-vote-member-${recused!.id}`)).toBeVisible();

  await page.getByTestId("live-recusal-info").click();
  await page.getByTestId("agenda-item-recusal-open").click();
  await page.getByTestId("recusal-member").click();
  await page
    .getByTestId("recusal-member-search-result")
    .and(page.locator(`[data-reference-id="${recused!.id}"]`))
    .click();
  await page.getByTestId("recusal-basis-personalInterest").check();
  await page.getByTestId("recusal-submit").click();
  await expect(page.getByTestId("recusal-form")).toBeHidden();
  await expect(page.getByTestId(`live-vote-member-${recused!.id}`)).toBeHidden();

  await page.getByTestId("live-recusal-info").click();
  await expect(page.getByTestId(`agenda-item-recusal-${recused!.id}`)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("deport-declare.png") });
  await page.getByTestId(`agenda-item-recusal-withdraw-${recused!.id}`).click();
  const dialog = page.getByTestId("agenda-item-recusal-withdraw-dialog");
  await expect(dialog).toBeVisible();
  await page.getByTestId("agenda-item-recusal-withdraw-confirm").click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId(`live-vote-member-${recused!.id}`)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("deport-retire.png") });

  await page.getByTestId("live-recusal-info").click();
  await expect(page.getByTestId(`agenda-item-recusal-${recused!.id}`)).toBeHidden();
});
