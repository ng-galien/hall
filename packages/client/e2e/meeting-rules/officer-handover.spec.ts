import { expect, signIn, test } from "../captures/fixtures";
import { openMeeting } from "../captures/journeys";
import { councillors, properties } from "./support";

test.setTimeout(3 * 60_000);
test.use({ seedScenario: "preparation" });

// @verifies-requirement HALL-FR-BAL-340
// @verifies-requirement HALL-FR-MTG-340
test("le départ de la secrétaire bloque le scrutin, la passation le débloque", async ({ docsPage: page }) => {
  await openMeeting(page);
  const meetingId = new URL(page.url()).pathname.split("/").at(-2)!;
  const meeting = await properties<{ secretaryMemberId: string }>(
    await page.request.get(`/api/council-meetings/${meetingId}`),
  );
  const [successor] = await councillors(page);

  await page.getByTestId("live-attendance-adjust").click();
  await page.getByTestId(`live-attendance-${meeting.secretaryMemberId}-absent`).click();
  await page.getByTestId("live-attendance-save").click();
  await expect(page.getByTestId("live-agenda-start")).toBeVisible();

  await page.getByTestId("live-agenda-start").click();
  await expect(
    page
      .getByTestId(/^conduct-blocker-/)
      .filter({ hasText: /secrétaire/i })
      .first(),
  ).toBeVisible();
  await expect(page.getByTestId("live-ballot-open")).toBeHidden();

  await page.getByTestId("live-officers-open").click();
  await page.getByTestId("live-officers-office-secretary").check();
  await page.getByTestId("live-officers-successor").click();
  await page
    .getByTestId("live-officers-successor-search-result")
    .and(page.locator(`[data-reference-id="${successor!.id}"]`))
    .click();
  await page.getByTestId("live-officers-handover-submit").click();
  await expect(page.getByTestId("live-officers-history").locator("li")).toHaveCount(1);
  await page.keyboard.press("Escape");
  // The departed secretary no longer conducts the meeting: the administrator continues.
  await signIn(page, "administrateur");

  await expect(page.getByTestId("live-ballot-open")).toBeEnabled();
  await page.getByTestId("live-ballot-open").click();
  await expect(page.getByTestId("live-ballot-all-for")).toBeVisible();
});
