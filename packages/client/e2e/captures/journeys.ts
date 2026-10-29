import type { Page } from "@playwright/test";
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
    await expect(page.getByText("Affaires en préparation").first()).toBeVisible();
    await page.waitForTimeout(1500);
    await capture(page, "ecrans/vue-d-ensemble");
  }
  await page.getByRole("link", { name: "Séances" }).first().click();
  await expect(page.getByRole("heading", { name: "Séances du conseil" })).toBeVisible();
  await shot("01-liste-des-seances");

  await page
    .getByRole("link", { name: new RegExp(`Conseil municipal ${meetingNumber}\\b`) })
    .first()
    .click();
  await expect(page.getByTestId("meeting-edit-details")).toBeVisible();
  await waitForPageEntrance(page);

  const startsAt = new Date(Date.now() - 30 * 60_000);
  const scheduledAhead = new Date();
  scheduledAhead.setDate(scheduledAhead.getDate() + 14);
  scheduledAhead.setHours(18, 30, 0, 0);
  await page.getByTestId("meeting-edit-details").click();
  await page.getByTestId("meeting-edit-starts-at").fill(localDateTimeInput(prefix ? scheduledAhead : startsAt));
  await page.getByTestId("meeting-edit-chair").click();
  await page.getByRole("option", { name: /Vercingétorix/ }).click();
  await page.getByTestId("meeting-edit-secretary").click();
  await page.getByRole("option", { name: /Vercassivellaunos/ }).click();
  await shot("02-proprietes-generales");
  await page.getByTestId("meeting-edit-submit").click();
  await expect(page.getByText("Programmée", { exact: true })).toBeVisible();
  if (prefix) {
    await expect(page.getByTestId("meeting-notice-deadline-date")).toContainText("Cette date est à venir.");
    await shot("03-seance-programmee");
    await page.getByTestId("meeting-edit-details").click();
    await page.getByTestId("meeting-edit-starts-at").fill(localDateTimeInput(startsAt));
    await page.getByTestId("meeting-edit-submit").click();
    await expect(page.getByTestId("meeting-edit-submit")).toBeHidden();
  }

  const candidate = page.getByTestId(/^agenda-candidate-add-/).first();
  if ((await candidate.count()) && (await candidate.isEnabled())) await candidate.click();
  await expect(page.getByTestId(/^agenda-item-position-/).first()).toBeVisible();
  await page
    .getByTestId(/^agenda-item-position-/)
    .first()
    .scrollIntoViewIfNeeded();
  await shot("04-point-inscrit");

  await page.getByRole("button", { name: "Ordre du jour" }).click();
  await expect(page.getByTestId("meeting-freeze-agenda")).toBeVisible();
  await shot("05-figer-ordre-du-jour");
  await page.getByTestId("meeting-freeze-agenda").click();
  await expect(page.getByTestId("meeting-generate-notice")).toBeVisible();
  await shot("06-generer-convocation");
  await page.getByTestId("meeting-generate-notice").click();
  await expect(page.getByText("Visionneuse de document")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByText("Visionneuse de document")).toBeHidden();
  await expect(page.getByRole("button", { name: /Télécharger le courriel Outlook/ })).toBeVisible();
  await shot("07-convocation-generee");
  await page.keyboard.press("Escape");
  await page.getByTestId("meeting-open-documents").click();
  await expect(page.getByTestId("meeting-dossier-download")).toBeVisible();
  await shot("07b-dossier-de-seance");
  await page.keyboard.press("Escape");

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
