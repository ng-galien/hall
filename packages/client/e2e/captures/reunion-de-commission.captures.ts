import { capture, expect, localDateTimeInput, test } from "./fixtures";

test.setTimeout(3 * 60_000);
test.use({ seedScenario: "preparation" });

test("réunion de commission : membres, rendez-vous, invitation", async ({ docsPage: page }) => {
  const journey = "reunion-de-commission";
  await page.goto("/app/council-committees");
  await page
    .getByRole("link", { name: /Commission défense/ })
    .first()
    .click();
  await expect(page.getByTestId("committee-role-board")).toBeVisible();
  await capture(page, `${journey}/01-commission-et-ses-membres`);

  await page.goto("/app/calendar");
  await expect(page.getByTestId("calendar-page")).toBeVisible();
  await page.getByTestId("calendar-new").click();
  await page.getByTestId("calendar-name").fill("Commission défense et soutien : seconde ligne");
  const allDay = page.getByTestId("event-all-day");
  if (await allDay.isChecked()) await allDay.uncheck();
  const start = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  start.setHours(18, 0, 0, 0);
  await page.getByTestId("event-start").fill(localDateTimeInput(start));
  await page.getByTestId("event-end").fill(localDateTimeInput(new Date(start.getTime() + 90 * 60_000)));
  await page.getByTestId("event-location").fill("Maison commune de l’oppidum");
  await page.getByTestId("event-add-council-members").click();
  await capture(page, `${journey}/02-nouveau-rendez-vous`);
  await page.getByTestId("calendar-create").click();
  await page.waitForLoadState("networkidle");
  await page.getByText("Commission défense et soutien : seconde ligne").first().click();
  await expect(page.getByTestId("event-invitation-request")).toBeVisible({ timeout: 15_000 });
  await capture(page, `${journey}/03-rendez-vous-cree`);
});
