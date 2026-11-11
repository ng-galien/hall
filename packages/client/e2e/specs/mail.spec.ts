import { expect, test } from "../fixtures/application";

test.use({ seedScenario: "fresh" });
// @verifies-requirement HALL-FR-EML-020
// @verifies-requirement HALL-FR-EML-030
for (const width of [1440, 390]) {
  test(`shared mail composer preserves recipients and files at ${width}px`, async ({ appPage: page }, testInfo) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/app/mail");
    await page.getByTestId("mail-new").click();
    await expect(page.getByTestId("mail-composer")).toBeVisible();
    await page.getByTestId("mail-subject").fill("Documents du conseil");
    await page.getByTestId("mail-to-address").fill("member@example.test");
    await page.getByTestId("mail-to-address").press("Enter");
    await page
      .getByTestId("mail-upload")
      .setInputFiles({ name: "dossier.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-test fixture") });
    await expect(
      page.locator('[data-testid^="mail-attachment-"]').filter({ hasText: "dossier.pdf" }).first(),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`composer-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    await page.getByTestId("mail-review").click();
    await expect(page.getByTestId("mail-preview-body")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`mail-${width}.png`), fullPage: true, animations: "disabled" });
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.getByTestId("mail-subject")).toHaveValue("Documents du conseil");
    await expect(page.getByTestId("mail-to")).toContainText("member@example.test");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

// @verifies-requirement HALL-FR-EML-030
test("creates a saved group and expands it into Bcc without changing an existing draft when the group is deleted", async ({
  appPage: page,
}) => {
  await page.goto("/app/mail");
  await page.getByTestId("mail-groups").click();
  await page.getByTestId("mail-group-new").click();
  await page.getByTestId("mail-group-name").fill("Commission de test");
  await page.getByTestId("mail-group-members-address").fill("committee@example.test");
  await page.getByTestId("mail-group-members-address").press("Enter");
  await page.getByTestId("mail-group-save").click();
  const group = page.locator('[data-testid^="mail-group-open-"]').filter({ hasText: "Commission de test" });
  await expect(group).toBeVisible();
  const id = (await group.getAttribute("data-testid"))!.replace("mail-group-open-", "");
  await page.getByTestId("mail-groups-dialog-close").click();
  await page.getByTestId("mail-new").click();
  await page.getByTestId("mail-toggle-copies").click();
  await page.getByTestId("mail-group-recipient-kind").click();
  await page.getByTestId("mail-group-recipient-kind-bcc").click();
  await page.getByTestId("mail-recipient-selection").click();
  await page.getByTestId(`mail-select-group-${id}`).click();
  await expect(page.getByTestId("mail-bcc")).toContainText("committee@example.test");
  await expect(page.getByTestId("mail-to")).not.toContainText("committee@example.test");
  await page.getByTestId("mail-save").click();
  await page.getByTestId("mail-groups").click();
  await page.getByTestId(`mail-group-open-${id}`).click();
  await page.getByTestId("mail-group-delete").click();
  await page.getByTestId("mail-group-delete-confirm").click();
  await expect(page.getByTestId(`mail-group-open-${id}`)).toHaveCount(0);
  await page.getByTestId("mail-groups-dialog-close").click();
  await page.reload();
  await expect(page.getByTestId("mail-bcc")).toContainText("committee@example.test");
});
