import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";

test.use({ seedScenario: "preparation" });

async function items<T>(page: Page, path: string): Promise<T[]> {
  const response = await page.request.get(path);
  expect(response.ok(), path).toBeTruthy();
  return (((await response.json()) as { entities?: Array<{ properties: T }> }).entities ?? []).map(
    (entity) => entity.properties,
  );
}

// @verifies-requirement HALL-FR-ATT-170
// @verifies-requirement HALL-FR-ATT-180
test("the page of a meeting in preparation opens the attendance sheet and generates a proxy, holder optional", async ({
  appPage: page,
}) => {
  const meetings = await items<{ id: string; startedAt: string | null }>(page, "/api/council-meetings");
  const preparing = meetings.find((meeting) => !meeting.startedAt)!;
  await page.goto(`/app/meetings/${preparing.id}`);

  const sheet = page.waitForResponse((response) => response.url().endsWith("/attendance-sheet.pdf"));
  await page.getByTestId("meeting-attendance-sheet-open").click();
  await expect(page.getByTestId("document-object-viewer")).toBeVisible();
  const sheetResponse = await sheet;
  expect(sheetResponse.status()).toBe(200);
  expect(sheetResponse.headers()["content-type"]).toMatch(/application\/pdf/);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("document-object-viewer")).toBeHidden();

  await page.getByTestId("meeting-proxy-form-open").click();
  await expect(page.getByTestId("meeting-proxy-form-submit")).toBeDisabled();
  await page.getByTestId("meeting-proxy-grantor").click();
  await page.getByRole("option", { name: /Dumnacos/ }).click();
  await expect(page.getByTestId("meeting-proxy-form-submit")).toBeEnabled();
  const blank = page.waitForResponse(
    (response) => response.url().includes("/proxy-form.pdf?") && !response.url().includes("holderMemberId"),
  );
  await page.getByTestId("meeting-proxy-form-submit").click();
  await expect(page.getByTestId("document-object-viewer")).toBeVisible();
  expect((await blank).status()).toBe(200);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("document-object-viewer")).toBeHidden();

  await page.getByTestId("meeting-proxy-form-open").click();
  await page.getByTestId("meeting-proxy-grantor").click();
  await page.getByRole("option", { name: /Dumnacos/ }).click();
  await page.getByTestId("meeting-proxy-holder").click();
  await expect(page.getByRole("option", { name: /Dumnacos/ })).toHaveCount(0);
  await page.getByRole("option", { name: /Vercassivellaunos/ }).click();
  const proxy = page.waitForResponse((response) => response.url().includes("/proxy-form.pdf?"));
  await page.getByTestId("meeting-proxy-form-submit").click();
  await expect(page.getByTestId("document-object-viewer")).toBeVisible();
  const proxyResponse = await proxy;
  expect(proxyResponse.status()).toBe(200);
  expect(proxyResponse.headers()["content-type"]).toMatch(/application\/pdf/);
});

// @verifies-requirement HALL-FR-ATT-170
// @verifies-requirement HALL-FR-ATT-180
// @verifies-requirement HALL-FR-MTG-390
test("the documents of a closed meeting no longer offer the attendance sheet or the proxy", async ({
  appPage: page,
}) => {
  const meetings = await items<{ id: string; closedAt: string | null }>(page, "/api/council-meetings");
  const closed = meetings.find((meeting) => meeting.closedAt)!;
  await page.goto(`/app/meetings/${closed.id}`);
  await expect(page.getByTestId("meeting-document-minutes")).toBeVisible();
  await expect(page.getByTestId("meeting-document-deliberation-list")).toBeVisible();
  await expect(page.getByTestId("meeting-document-decisions")).toBeVisible();
  await expect(page.getByTestId("meeting-document-attendance-sheet")).toHaveCount(0);
  await expect(page.getByTestId("meeting-document-proxy-form")).toHaveCount(0);
});

// @verifies-requirement HALL-FR-MTG-390
test("the documents of a meeting without filed pieces show no attachment row and offer no filing", async ({
  appPage: page,
}) => {
  const meetings = await items<{ id: string; startedAt: string | null }>(page, "/api/council-meetings");
  const preparing = meetings.find((meeting) => !meeting.startedAt)!;
  await page.goto(`/app/meetings/${preparing.id}`);
  await expect(page.getByTestId("meeting-document-notice")).toBeVisible();
  await expect(page.getByTestId("meeting-document-attachments")).toHaveCount(0);
  await expect(page.getByTestId("meeting-attachment-upload")).toHaveCount(0);
});
