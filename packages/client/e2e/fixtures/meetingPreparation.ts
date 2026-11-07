import { expect, type Page } from "@playwright/test";

/** Confirming the revision and producing its notice are two separate user actions. */
export async function establishRevision(page: Page) {
  const revision = page.getByTestId("meeting-agenda-revision");
  await expect(revision).toHaveAttribute("data-state", "open");
  await revision.getByTestId("meeting-generate-notice").click();
  await expect(revision).toHaveAttribute("data-state", "established");
}

export async function generateCurrentNotice(page: Page) {
  const document = page.getByTestId("meeting-document-notice");
  const generated = page.waitForResponse(
    (response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/notices"),
  );
  await document.getByTestId("meeting-generate-notice").click();
  const response = await generated;
  expect(response.ok(), await response.text()).toBeTruthy();
  await expect(page.getByTestId("document-object-viewer")).toBeVisible();
  await page.getByTestId("document-object-viewer-close").click();
  await expect(page.getByTestId("document-object-viewer")).toBeHidden();
  await expect(document.getByTestId("meeting-document-notice-open")).toBeVisible();
}

/** Inline properties save after each field change; await persistence before changing the next field. */
export async function saveMeetingField(page: Page, change: () => Promise<unknown>) {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /\/council-meetings\/[^/]+\/(prepare|schedule|officers)$/.test(new URL(response.url()).pathname),
  );
  await change();
  const response = await saved;
  expect(response.ok(), await response.text()).toBeTruthy();
  const { properties } = (await response.json()) as { properties: { slug?: string } };
  if (properties.slug) await expect(page).toHaveURL(new RegExp(`/meetings/${properties.slug}$`));
  await page.waitForLoadState("networkidle");
}
