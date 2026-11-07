import type { APIResponse } from "@playwright/test";
import { expect, test } from "../fixtures/application";

interface SirenItem<T> {
  properties: T;
}

async function sirenProperties<T>(response: APIResponse): Promise<T> {
  const body = (await response.json()) as SirenItem<T>;
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return body.properties;
}

async function sirenItems<T>(response: APIResponse): Promise<T[]> {
  const body = (await response.json()) as { entities: Array<SirenItem<T>> };
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return body.entities.map((entity) => entity.properties);
}

const captureDirectory = process.env.HALL_REVISION_CAPTURES;

async function capture(page: import("@playwright/test").Page, name: string, testId?: string) {
  const path = captureDirectory ? `${captureDirectory}/revision-${name}.png` : test.info().outputPath(`${name}.png`);
  if (testId) await page.getByTestId(testId).screenshot({ path, animations: "disabled" });
  else await page.screenshot({ path, fullPage: true, animations: "disabled" });
}

// @verifies-requirement HALL-FR-NOT-140
// @verifies-requirement HALL-FR-NOT-150
// @verifies-requirement HALL-FR-NOT-160
test("establishes, revises and resets the agenda revision with its notices", async ({ appPage: page }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const meetings = await sirenItems<{ id: string; startedAt: string | null; closedAt: string | null }>(
    await page.request.get("/api/council-meetings"),
  );
  const meeting = meetings.find((candidate) => !candidate.startedAt && !candidate.closedAt)!;
  const scheduled = await sirenProperties<{ slug: string }>(
    await page.request.put(`/api/council-meetings/${meeting.id}/schedule`, {
      data: { scheduledAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), location: "Salle du conseil" },
    }),
  );
  const businesses = await sirenItems<{ id: string }>(await page.request.get("/api/council-business"));
  const agenda = await sirenItems<{ id: string; position: number }>(
    await page.request.get(`/api/council-meetings/${scheduled.slug}/agenda-items`),
  );
  let position = Math.max(0, ...agenda.map((item) => Math.abs(item.position))) + 1;
  const added: string[] = [];
  for (const business of businesses.slice(0, 2)) {
    const item = await sirenProperties<{ id: string }>(
      await page.request.post(`/api/council-meetings/${scheduled.slug}/agenda-items`, {
        data: { kind: "councilDecisionProposal", councilBusinessId: business.id, position: position++ },
      }),
    );
    added.push(item.id);
  }
  const detailUrl = `/app/meetings/${scheduled.slug}`;
  await page.goto(detailUrl);
  // The captures show the French interface used in the commune.
  await page.evaluate(() => localStorage.setItem("mairie.locale", "fr"));
  await page.reload();

  const state = page.getByTestId("meeting-agenda-revision-state");
  await expect(state).toHaveAttribute("data-state", "open");
  await expect(state).toHaveAttribute("data-number", "1");
  await expect(page.getByTestId("meeting-generate-notice")).toBeVisible();
  await expect(page.getByTestId("meeting-revise-agenda")).toHaveCount(0);
  await expect(page.getByTestId("meeting-reset-agenda-revision")).toHaveCount(0);
  await capture(page, "1-ouverte");

  await page.getByTestId("meeting-generate-notice").click();
  await expect(state).toHaveAttribute("data-state", "established");
  await expect(state).toHaveAttribute("data-number", "1");
  await expect(page.getByTestId("meeting-agenda-revision-notice")).toBeVisible();
  await expect(page.getByTestId("meeting-generate-notice")).toHaveCount(0);
  await expect(page.getByTestId("meeting-revise-agenda")).toBeVisible();
  await expect(page.getByTestId("meeting-document-notice-state")).toHaveAttribute("data-tone", "done");
  await expect(page.getByTestId("meeting-notice-regenerate")).toBeVisible();
  await capture(page, "2-apres-generer");

  await page.getByTestId("meeting-revise-agenda").click();
  await expect(state).toHaveAttribute("data-state", "open");
  await expect(state).toHaveAttribute("data-number", "2");
  await expect(page.getByTestId("meeting-reset-agenda-revision")).toBeVisible();
  await capture(page, "3-apres-reviser");

  const removed = await page.request.delete(`/api/council-meetings/${scheduled.slug}/agenda-items/${added[0]}`);
  expect(removed.ok(), await removed.text()).toBeTruthy();
  await page.reload();
  const reset = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/agenda-revision-reset"),
  );
  await page.getByTestId("meeting-reset-agenda-revision").click();
  const resetResponse = await reset;
  expect(resetResponse.ok(), await resetResponse.text()).toBeTruthy();
  await expect(state).toHaveAttribute("data-state", "established");
  await expect(state).toHaveAttribute("data-number", "1");
  await expect(page.getByTestId("meeting-agenda-revision-notice")).toBeVisible();
  const restored = await sirenItems<{ id: string; position: number }>(
    await page.request.get(`/api/council-meetings/${scheduled.slug}/agenda-items`),
  );
  expect(restored.find((item) => item.id === added[0])?.position).toBeGreaterThan(0);
  await expect(page.getByTestId("meeting-revise-agenda")).toBeEnabled();
  await expect(page.getByTestId(`agenda-item-open-business-${added[0]}`)).toBeVisible();
  await capture(page, "4-apres-reinitialiser");

  await page.getByTestId("meeting-revise-agenda").click();
  await expect(state).toHaveAttribute("data-state", "open");
  await expect(state).toHaveAttribute("data-number", "2");
  await page.getByTestId("meeting-generate-notice").click();
  await expect(state).toHaveAttribute("data-state", "established");
  await expect(state).toHaveAttribute("data-number", "2");
  await expect(page.getByTestId("meeting-agenda-revision-notice")).toBeVisible();
  await page.getByTestId("meeting-notice-previous-toggle").click();
  await expect(page.getByTestId("meeting-notice-previous-list").locator("li")).toHaveCount(1);
  await capture(page, "5-documents-deux-convocations", "meeting-documents");
});
