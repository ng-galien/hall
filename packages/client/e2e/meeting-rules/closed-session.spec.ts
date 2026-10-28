import { expect, test } from "../captures/fixtures";
import { openMeeting } from "../captures/journeys";

test.setTimeout(3 * 60_000);
test.use({ seedScenario: "preparation" });

// @verifies-requirement HALL-FR-MTG-350
test("huis clos refusé sans la majorité absolue, puis adopté", async ({ docsPage: page }) => {
  await openMeeting(page);

  await page.getByTestId("live-closed-session-open").click();
  await expect(page.getByTestId("live-closed-session-form")).toBeVisible();
  await page.getByTestId("live-closed-session-request-mayor").check();
  await page.getByTestId("live-closed-session-approvals").fill("2");
  await page.getByTestId("live-closed-session-scope-whole").check();
  await page.getByTestId("live-closed-session-submit").click();
  await expect(page.getByTestId("live-closed-session-form").getByRole("alert")).toContainText(
    "Le huis clos ne peut pas être enregistré",
  );
  await expect(page.getByTestId("live-closed-sessions")).toHaveCount(0);

  await page.getByTestId("live-closed-session-approvals").fill("12");
  await page.getByTestId("live-closed-session-submit").click();
  await expect(page.getByTestId("live-closed-session-form")).toBeHidden();
  await page.getByTestId("live-opening").click();
  await expect(page.getByTestId("live-closed-sessions")).toContainText("12");
});
