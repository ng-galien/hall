import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";

test.use({ seedScenario: "fresh" });

/** Types in a line of recipients and chooses the suggestion whose test identifier ends with the given key. */
async function chooseRecipient(page: Page, line: string, text: string, key: string) {
  await page.getByTestId(`${line}-input`).fill(text);
  await page.getByTestId(`${line}-suggest-${key}`).click();
}

// @verifies-requirement HALL-FR-EML-020
// @verifies-requirement HALL-FR-EML-100
for (const width of [1440, 390]) {
  test(`a draft saves itself with its recipients and files at ${width}px`, async ({ appPage: page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/app/mail");
    await expect(page).toHaveURL(/\/app\/mail\/drafts$/);
    await page.getByTestId("mail-new").click();
    await expect(page).toHaveURL(/\/app\/mail\/drafts\/[0-9a-f-]+$/);
    await expect(page.getByTestId("mail-composer")).toBeVisible();
    await page.getByTestId("mail-subject").fill("Documents du conseil");
    await page.getByTestId("mail-to-input").fill("member@example.test");
    await expect(page.getByTestId("mail-to-suggest-address")).toContainText("member@example.test");
    await page.getByTestId("mail-to-input").press("Enter");
    await expect(page.getByTestId("mail-to-recipient-0")).toContainText("member@example.test");
    await expect(page.getByTestId("mail-save-state")).toHaveAttribute("data-save", "saved");
    await page.getByTestId("mail-attach").click();
    await expect(page.getByTestId("mail-attach-file")).toBeVisible();
    await expect(page.getByTestId("mail-attach-document")).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByTestId("mail-upload")
      .setInputFiles({ name: "dossier.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-test fixture") });
    const attachment = page.locator('[data-testid^="mail-attachment-"]').filter({ hasText: "dossier.pdf" }).first();
    await expect(attachment).toBeVisible();
    await expect(attachment).toContainText("Ko");
    await page.screenshot({ path: testInfo.outputPath(`composer-${width}.png`), animations: "disabled" });
    await page.getByTestId("mail-send").click();
    await expect(page.getByTestId("mail-preview-body")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`mail-${width}.png`), animations: "disabled" });
    await page.keyboard.press("Escape");
    // A change left at once is saved on leaving the draft, without a dialog.
    const draftUrl = page.url();
    await page.getByTestId("mail-subject").fill("Documents du conseil, version finale");
    await page.getByTestId(width < 768 ? "phone-header-back" : "mail-folder-drafts").click();
    await expect(page.getByTestId("mail-composer")).toHaveCount(0);
    await expect(page.getByTestId("mail-list")).toContainText("Documents du conseil, version finale");
    await page.goto(draftUrl);
    await expect(page.getByTestId("mail-subject")).toHaveValue("Documents du conseil, version finale");
    await expect(page.getByTestId("mail-to")).toContainText("member@example.test");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

// @verifies-requirement HALL-FR-EML-030
// @verifies-requirement HALL-FR-EML-100
test("a saved group shows as one label, suggestions come in order and a group change keeps a draft", async ({
  appPage: page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/mail/drafts");
  await page.getByTestId("mail-more").click();
  await page.getByTestId("mail-manage-groups").click();
  await page.getByTestId("mail-group-new").click();
  await page.getByTestId("mail-group-name").fill("Commission de test");
  for (const address of ["committee@example.test", "second@example.test"]) {
    await page.getByTestId("mail-group-members-input").fill(address);
    await page.getByTestId("mail-group-members-input").press("Enter");
  }
  await page.getByTestId("mail-group-save").click();
  const group = page.locator('[data-testid^="mail-group-open-"]').filter({ hasText: "Commission de test" });
  await expect(group).toBeVisible();
  const id = (await group.getAttribute("data-testid"))!.replace("mail-group-open-", "");
  await page.getByTestId("mail-groups-dialog-close").click();

  await page.getByTestId("mail-new").click();
  await expect(page.getByTestId("mail-composer")).toBeVisible();
  await page.getByTestId("mail-to-input").fill("o");
  const order = await page
    .getByTestId("mail-to-suggestions")
    .locator('[data-testid^="mail-to-suggest-"]')
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-testid")!.replace("mail-to-suggest-", "")));
  expect(order.indexOf(`group-group:${id}`)).toBeLessThan(order.indexOf("address"));
  expect(order.at(-1)).toBe("manage");
  await page.getByTestId("mail-to-input").press("Escape");
  await expect(page.getByTestId("mail-add-cc")).toBeVisible();
  await page.getByTestId("mail-add-bcc").click();
  await expect(page.getByTestId("mail-add-bcc")).toHaveCount(0);
  await chooseRecipient(page, "mail-bcc", "Commission", `group-group:${id}`);
  const label = page.getByTestId(`mail-bcc-group-group:${id}`);
  await expect(label).toContainText("Commission de test · 2");
  await expect(page.getByTestId("mail-to")).not.toContainText("committee@example.test");
  await expect(page.getByTestId("mail-save-state")).toHaveAttribute("data-save", "saved");

  await page.getByTestId("mail-more").click();
  await page.getByTestId("mail-more-groups").click();
  await page.getByTestId(`mail-group-open-${id}`).click();
  await expect(page.getByTestId("mail-group-name")).toHaveValue("Commission de test");
  await page.getByTestId("mail-group-delete").click();
  await page.getByTestId("mail-group-delete-confirm").click();
  await expect(page.getByTestId(`mail-group-open-${id}`)).toHaveCount(0);
  await page.getByTestId("mail-groups-dialog-close").click();
  await page.reload();
  await expect(page.getByTestId("mail-bcc")).toContainText("committee@example.test");
  await expect(page.getByTestId("mail-bcc")).toContainText("second@example.test");
});

// @verifies-requirement HALL-FR-EML-100
// @verifies-requirement HALL-FR-LAY-110
// @verifies-requirement HALL-FR-LAY-160
test("the menu holds the folders of the mailbox, the list folds and searches, the commands are in the header", async ({
  appPage: page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/mail");
  // « Brouillons » and « Envoyés » show under the Courriels entry of the menu; no column stands between them.
  const menu = page.locator(".app-sidebar");
  await expect(menu.getByTestId("mail-folder-drafts")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("mail-pane")).toHaveCount(0);
  for (const subject of ["Ordre du jour", "Compte rendu"]) {
    await page.getByTestId("mail-new").click();
    await page.getByTestId("mail-subject").fill(subject);
    await expect(page.getByTestId("mail-save-state")).toHaveAttribute("data-save", "saved");
    await page.getByTestId("mail-folder-drafts").click();
  }
  await expect(page.getByTestId("mail-list").locator('[data-testid^="mail-open-"]')).toHaveCount(2);
  await page.getByTestId("mail-search").fill("ordre");
  await expect(page.getByTestId("mail-list").locator('[data-testid^="mail-open-"]')).toHaveCount(1);
  await page.getByTestId("mail-list").locator('[data-testid^="mail-open-"]').click();
  await expect(page.getByTestId("mail-subject")).toHaveValue("Ordre du jour");
  // The header carries the save state, the « … » menu and « Envoyer »; the old commands are gone.
  const header = page.getByTestId("screen-header");
  await expect(header.getByTestId("mail-save-state")).toBeVisible();
  await expect(header.getByTestId("mail-send")).toBeVisible();
  for (const retired of ["mail-save", "mail-review", "mail-groups", "mail-upload-open", "mail-recipient-selection"])
    await expect(page.getByTestId(retired)).toHaveCount(0);
  await header.getByTestId("mail-more").click();
  await expect(page.getByTestId("mail-delete")).toBeVisible();
  await expect(page.getByTestId("mail-more-groups")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByTestId("mail-list-toggle").click();
  await expect(page.getByTestId("mail-list")).toHaveCount(0);
  await expect(header.getByTestId("mail-list-toggle")).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(page.getByTestId("mail-list")).toHaveCount(0);
  await header.getByTestId("mail-list-toggle").click();
  await expect(page.getByTestId("mail-list")).toBeVisible();

  await page.getByTestId("mail-folder-sent").click();
  await expect(page).toHaveURL(/\/app\/mail\/sent$/);
  await expect(page.getByTestId("mail-list").locator('[data-testid^="mail-open-"]')).toHaveCount(0);
});

// @verifies-requirement HALL-FR-EML-100
test("on a phone, two tabs head the list and a draft opens over the whole screen", async ({ appPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/mail");
  await expect(page.getByTestId("mail-tab-drafts")).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("mail-tab-sent").click();
  await expect(page).toHaveURL(/\/app\/mail\/sent$/);
  await page.getByTestId("mail-tab-drafts").click();
  await page.getByTestId("mail-new").click();
  await expect(page.getByTestId("mail-composer")).toBeVisible();
  await expect(page.getByTestId("mail-list")).toHaveCount(0);
  await expect(page.getByTestId("phone-header").getByTestId("mail-send")).toBeVisible();
});
