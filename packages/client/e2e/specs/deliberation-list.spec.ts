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
  await page.getByTestId("meeting-document-deliberation-list-open").click();
  await expect(page.getByTestId("document-object-viewer")).toBeVisible();
  const response = await document;
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/application\/pdf/);
});

// @verifies-requirement HALL-FR-LAY-100
test("a deliberation row shows its number, and a record names its list above its title", async ({ appPage: page }) => {
  const decisions = await items<{ id: string; number: string | null }>(page, "/api/council-decisions");
  const numbered = decisions.find((decision) => decision.number)!;
  await page.goto("/app/council-decisions");
  const row = page.getByTestId(`decision-open-${numbered.id}`);
  await expect(row.locator(".list-row-detail-text")).toHaveText(numbered.number!);

  await page.getByTestId(`decision-open-${numbered.id}`).click();
  await expect(page.getByTestId("decision-detail")).toBeVisible();
  const trail = page.locator(".screen-header-trail");
  await expect(trail.locator('a[href$="/council-decisions"]')).toBeVisible();
  await expect(trail.locator(".screen-header-commune")).toHaveCount(0);

  const minutes = await items<{ id: string }>(page, "/api/minutes");
  await page.goto(`/app/minutes/${minutes[0]!.id}`);
  await expect(trail.locator('a[href$="/minutes"]')).toBeVisible();
  await expect(trail.locator(".screen-header-commune")).toHaveCount(0);
});

test("in the meeting in progress of the demonstration the plateau defence point waits for its ballot", async ({
  appPage: page,
}) => {
  const plateau = "Défense du plateau - renforcement de la seconde ligne";
  const decisions = await items<{ title: string }>(page, "/api/council-decisions");
  expect(decisions).toHaveLength(5);
  expect(decisions.map((decision) => decision.title)).not.toContain(plateau);
  const meetings = await items<{ id: string; slug: string | null; startedAt: string | null; closedAt: string | null }>(
    page,
    "/api/council-meetings",
  );
  const running = meetings.find((meeting) => meeting.startedAt && !meeting.closedAt)!;
  expect(running).toBeTruthy();
  const agenda = (await (await page.request.get(`/api/council-meetings/${running.id}/agenda-items`)).json()) as {
    entities?: Array<{ properties: { title: string; startedAt: string | null; completedAt?: string | null } }>;
  };
  const point = (agenda.entities ?? []).map((entity) => entity.properties).find((item) => item.title === plateau)!;
  expect(point.startedAt).not.toBeNull();
  expect(point.completedAt ?? null).toBeNull();
  await page.goto(`/app/meetings/${running.slug ?? running.id}/live`);
  await expect(page.getByTestId("live-meeting-page")).toContainText(plateau);
  await expect(page.getByTestId("live-ballot-open")).toBeVisible();
});
