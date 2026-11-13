import type { Page } from "@playwright/test";
import { establishRevision, generateCurrentNotice, saveMeetingField } from "../fixtures/meetingPreparation";
import { capture, expect, localDateTimeInput, signIn, waitForPageEntrance } from "./fixtures";

/**
 * From the meeting in preparation to the roll call screen; captures each step under `prefix` when given.
 * The secretariat prepares the meeting; from the meeting mode on, the account with the meeting conduct role takes over.
 * The documentation shows a meeting scheduled two weeks ahead; the journey then dates it half an hour ago, without
 * capture, because the meeting can only be opened once its scheduled time is reached.
 */
export async function prepareMeeting(page: Page, prefix?: string, meetingNumber = 2) {
  const shot = async (name: string) => {
    if (prefix) await capture(page, `${prefix}/${name}`);
  };
  await page.waitForLoadState("networkidle");
  if (prefix) {
    await expect(page.getByTestId("home-meeting")).toBeVisible();
    await expect(page.getByTestId(/^home-recent-document-/).first()).toBeVisible();
    await page.waitForTimeout(1500);
    await capture(page, "ecrans/vue-d-ensemble");
  }
  const meetings = page.getByTestId("navigation-meetings");
  if (!(await meetings.isVisible())) await page.getByTestId("navigation-council").click();
  await meetings.click();
  await expect(page.getByRole("heading", { name: "Séances du conseil" })).toBeVisible();
  await shot("01-liste-des-seances");

  await page
    .getByRole("link", { name: new RegExp(`Conseil municipal ${meetingNumber}\\b`) })
    .first()
    .click();
  await expect(page.getByTestId("meeting-details-inline")).toBeVisible();
  await waitForPageEntrance(page);
  const date = page.getByTestId("meeting-edit-starts-at");
  await expect(date).toHaveValue(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);

  const startsAt = new Date(Date.now() - 30 * 60_000);
  const scheduledAhead = new Date();
  scheduledAhead.setDate(scheduledAhead.getDate() + 14);
  scheduledAhead.setHours(18, 30, 0, 0);
  await saveMeetingField(page, async () => {
    await date.fill(localDateTimeInput(prefix ? scheduledAhead : startsAt));
    await date.blur();
  });
  await page.getByTestId("meeting-edit-chair").click();
  await page
    .getByTestId("meeting-edit-chair-search-result")
    .filter({ hasText: /Vercingétorix/ })
    .click();
  await page.getByTestId("meeting-edit-secretary").click();
  await saveMeetingField(page, () =>
    page
      .getByTestId("meeting-edit-secretary-search-result")
      .filter({ hasText: /Vercassivellaunos/ })
      .click(),
  );
  await expect(page.getByTestId("meeting-details-status")).toBeHidden();
  await shot("02-proprietes-generales");
  await expect(page.getByTestId("meeting-agenda-revision")).toHaveAttribute("data-state", "open");
  if (prefix) {
    await expect(page.getByTestId("meeting-notice-deadline-date")).toHaveAttribute("data-reminder", "upcoming");
    await shot("03-seance-programmee");
    await expect(page.getByTestId("meeting-agenda-revision").getByTestId("meeting-generate-notice")).toBeEnabled();
    await saveMeetingField(page, async () => {
      await date.fill(localDateTimeInput(startsAt));
      await date.blur();
    });
  }

  const candidate = page.getByTestId(/^agenda-candidate-add-/).first();
  if ((await candidate.count()) && (await candidate.isEnabled())) await candidate.click();
  await expect(page.getByTestId(/^agenda-item-position-/).first()).toBeVisible();
  await page
    .getByTestId(/^agenda-item-position-/)
    .first()
    .scrollIntoViewIfNeeded();
  await shot("04-point-inscrit");

  await page.getByTestId("meeting-agenda-revision").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("meeting-generate-notice")).toBeVisible();
  await shot("05-revision-ouverte");
  await establishRevision(page);
  await expect(page.getByTestId("meeting-revise-agenda")).toBeVisible({ timeout: 60_000 });
  await shot("06-revision-etablie");
  await generateCurrentNotice(page);
  await page.getByTestId("meeting-documents").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("meeting-export-notice-message")).toBeVisible();
  await shot("07-convocation-generee");
  await expect(page.getByTestId("meeting-dossier-open")).toBeVisible();
  await shot("07b-dossier-de-seance");

  await signIn(page, "conduite");
  await expect(page.getByTestId("meeting-enter-live")).toBeEnabled();
  await waitForPageEntrance(page);
  await shot("08-passer-en-mode-seance");
  await page.getByTestId("meeting-enter-live").click();
  await expect(page.getByTestId("live-rollcall-heading")).toBeVisible();
  await shot("09-appel-des-membres");
}

/** From the meeting in preparation to the opened meeting with every member present. */
export async function openMeeting(page: Page, prefix?: string) {
  const shot = async (name: string) => {
    if (prefix) await capture(page, `${prefix}/${name}`);
  };
  await prepareMeeting(page, prefix);
  await page.getByTestId("live-attendance-all-present").click();
  await expect(page.getByTestId("live-meeting-start")).toBeEnabled();
  await shot("10-appel-complet");
  await page.getByTestId("live-meeting-start").click();
  await expect(page.getByText(/Quorum : \d+ \/ \d+/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Commencer l’examen du point" })).toBeVisible();
  await shot("11-seance-ouverte");
}
