import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";

test.use({ seedScenario: "default" });

async function items<T>(page: Page, path: string): Promise<T[]> {
  const response = await page.request.get(path);
  expect(response.ok(), path).toBeTruthy();
  return (((await response.json()) as { entities?: Array<{ properties: T }> }).entities ?? []).map(
    (entity) => entity.properties,
  );
}

// @verifies-requirement HALL-FR-MIN-270
test("the page of a closed meeting opens the list of deliberations examined", async ({ appPage: page }) => {
  const meetings = await items<{ id: string; closedAt: string | null }>(page, "/api/council-meetings");
  const closed = meetings.find((meeting) => meeting.closedAt)!;
  await page.goto(`/app/meetings/${closed.id}`);
  const document = page.waitForResponse((response) => response.url().endsWith("/deliberation-list.pdf"));
  await page.getByTestId("meeting-deliberation-list-open").click();
  await expect(page.getByTestId("document-object-viewer")).toBeVisible();
  const response = await document;
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/application\/pdf/);
});
