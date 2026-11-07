import { capture, expect, test } from "./fixtures";

test.setTimeout(3 * 60_000);
test.use({ seedScenario: "minutes" });

test("procès-verbal après la séance : des faits au PDF arrêté à la séance suivante", async ({ docsPage: page }) => {
  const journey = "proces-verbal";
  await page.getByRole("link", { name: "Procès-verbaux" }).first().click();
  await expect(page.getByTestId("minutes-page")).toBeVisible();
  await capture(page, `${journey}/01-liste-des-proces-verbaux`);

  await page
    .getByTestId(/^minutes-open-/)
    .first()
    .click();
  await expect(page.getByTestId("minutes-detail")).toBeVisible();
  await capture(page, `${journey}/02-brouillon`);

  await expect(page.getByTestId("minutes-facts")).toBeVisible();
  await page.getByTestId("minutes-facts").scrollIntoViewIfNeeded();
  await capture(page, `${journey}/03-faits-de-la-seance`);

  const editorialTab = page.getByTestId(/^minutes-editorial-tab-/).first();
  await editorialTab.scrollIntoViewIfNeeded();
  await editorialTab.click();
  await expect(page.getByTestId(/^minutes-editorial-panel-/).first()).toBeVisible();
  await capture(page, `${journey}/04-redaction-d-un-point`);

  await page.getByTestId("minutes-preview").click();
  await expect(page.getByTestId("minutes-document-dialog")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await capture(page, `${journey}/05-apercu`);
  await page.getByTestId("minutes-document-close").click();
  await expect(page.getByTestId("minutes-document-dialog")).toBeHidden();

  await page.getByTestId("minutes-generate").click();
  await expect(page.getByTestId("minutes-download")).toBeVisible({ timeout: 60_000 });
  await capture(page, `${journey}/06-document-genere`);

  const approval = page.getByTestId("minutes-approval-meeting").first();
  const approvalHref = await approval.getAttribute("href");
  if (approvalHref) await page.goto(approvalHref);
  else await approval.click({ force: true });
  await expect(page.getByTestId("meeting-stages")).toBeVisible();
  await capture(page, `${journey}/07-seance-ou-le-pv-est-arrete`);
});
