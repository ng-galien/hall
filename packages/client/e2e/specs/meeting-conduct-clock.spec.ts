import type { APIResponse } from "@playwright/test";
import { expect, test } from "../fixtures/application";

interface SirenItem<T> {
  properties: T;
}

interface SirenCollection<T> {
  entities: Array<SirenItem<T>>;
}

async function properties<T>(response: APIResponse): Promise<T> {
  const body = (await response.json()) as SirenItem<T>;
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return body.properties;
}

async function items<T>(response: APIResponse): Promise<T[]> {
  const body = (await response.json()) as SirenCollection<T>;
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return body.entities.map((entity) => entity.properties);
}

const fiveMinutes = 5 * 60_000;

for (const [label, offset] of [
  ["five minutes behind", -fiveMinutes],
  ["five minutes ahead", fiveMinutes],
] as const) {
  // @verifies-requirement HALL-FR-MTG-370
  test(`conducts a meeting with a browser clock ${label} of the server`, async ({ appPage: page }) => {
    test.setTimeout(120_000);
    const meetings = await items<{ id: string; startedAt: string | null; closedAt: string | null }>(
      await page.request.get("/api/council-meetings"),
    );
    const meeting = meetings.find((candidate) => !candidate.startedAt && !candidate.closedAt);
    expect(meeting).toBeTruthy();
    const scheduled = await properties<{ slug: string }>(
      await page.request.put(`/api/council-meetings/${meeting!.id}/schedule`, {
        data: { scheduledAt: new Date(Date.now() - 60_000).toISOString(), location: "Clock offset test" },
      }),
    );
    const businesses = await items<{ id: string }>(await page.request.get("/api/council-business"));
    const item = await properties<{ id: string }>(
      await page.request.post(`/api/council-meetings/${scheduled.slug}/agenda-items`, {
        data: { kind: "openQuestion", councilBusinessId: businesses[0]!.id, position: 1 },
      }),
    );
    await properties(await page.request.post(`/api/council-meetings/${scheduled.slug}/agenda-freeze`, { data: {} }));
    await properties(await page.request.post(`/api/council-meetings/${scheduled.slug}/notices`, { data: {} }));

    const refusals: string[] = [];
    page.on("response", async (response) => {
      if (response.url().includes("/api/") && response.status() >= 400)
        refusals.push(`${response.status()} ${response.url()} ${await response.text().catch(() => "")}`);
    });
    await page.clock.install({ time: new Date(Date.now() + offset) });
    await page.goto(`/app/meetings/${scheduled.slug}/live`);
    expect(Math.abs((await page.evaluate(() => Date.now())) - Date.now() - offset)).toBeLessThan(60_000);

    await page.getByTestId("live-attendance-all-present").click();
    const members = await items<{ id: string }>(await page.request.get("/api/council-members"));
    await page.getByTestId(`live-member-actions-${members[0]!.id}`).click();
    await page.getByTestId(`live-designate-chair-${members[0]!.id}`).click();
    await page.getByTestId(`live-member-actions-${members[1]!.id}`).click();
    await page.getByTestId(`live-designate-secretary-${members[1]!.id}`).click();
    await expect(page.getByTestId("live-meeting-start")).toBeEnabled();
    const openedAfter = Date.now();
    await page.getByTestId("live-meeting-start").click();
    await expect(page.getByTestId(`live-agenda-item-${item.id}`)).toBeVisible();

    await page.getByTestId("live-attendance-adjust").click();
    await page.getByTestId(`live-attendance-${members[2]!.id}-absent`).click();
    await page.getByTestId("live-attendance-save").click();
    await expect(page.getByTestId("live-attendance-save")).toBeHidden();

    await page.getByTestId(`live-agenda-item-${item.id}`).click();
    await page.getByTestId("live-agenda-start").click();
    await expect(page.getByTestId("live-agenda-complete")).toBeVisible();
    await page.getByTestId("live-agenda-complete").click();
    await expect(page.getByTestId("live-agenda-complete")).toBeHidden();

    const conduct = await properties<{ meeting: { startedAt: string } }>(
      await page.request.get(`/api/council-meetings/${scheduled.slug}/conduct`),
    );
    const openedAt = Date.parse(conduct.meeting.startedAt);
    expect(openedAt).toBeGreaterThanOrEqual(openedAfter - 1_000);
    expect(openedAt).toBeLessThanOrEqual(Date.now() + 1_000);
    const examined = await properties<{ startedAt: string; completedAt: string }>(
      await page.request.get(`/api/council-meetings/${scheduled.slug}/agenda-items/${item.id}`),
    );
    expect(Date.parse(examined.startedAt)).toBeGreaterThanOrEqual(openedAt);
    expect(Date.parse(examined.completedAt)).toBeGreaterThanOrEqual(Date.parse(examined.startedAt));
    expect(Date.parse(examined.completedAt)).toBeLessThanOrEqual(Date.now() + 1_000);
    expect(refusals).toEqual([]);
  });
}
