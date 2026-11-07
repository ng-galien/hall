import type { Page } from "@playwright/test";
import { capture, conductMemberId, expect, signIn, switchAccount, test, waitForPageEntrance } from "./fixtures";

/** Hall on a phone for the getting-started guide: a meeting page, a folder's New menu with its photo entries, the roll
    call and a vote, taken with the finger. */
test.setTimeout(4 * 60_000);
test.use({ seedScenario: "preparation", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

interface Entity<T> {
  properties: T;
}

async function items<T>(page: Page, path: string): Promise<T[]> {
  const response = await page.request.get(path);
  expect(response.ok(), path).toBeTruthy();
  return (((await response.json()) as { entities?: Entity<T>[] }).entities ?? []).map((entity) => entity.properties);
}

test("Hall sur un téléphone : séance, appel et vote", async ({ docsPage: page }) => {
  const journey = "prise-en-main";
  const meeting = (
    await items<{ id: string; startedAt: string | null; closedAt: string | null }>(page, "/api/council-meetings")
  ).find((entry) => !entry.startedAt && !entry.closedAt)!;
  const members = (await items<{ id: string; role: string; active: boolean }>(page, "/api/council-members")).filter(
    (member) => member.active,
  );
  for (const [method, path, data] of [
    [
      "put",
      `/api/council-meetings/${meeting.id}/prepare`,
      {
        scheduledAt: new Date(Date.now() - 30 * 60_000).toISOString(),
        location: "Maison commune de l’oppidum",
        chairMemberId: members.find((member) => member.role === "mayor")!.id,
        secretaryMemberId: await conductMemberId(page),
      },
    ],
    ["post", `/api/council-meetings/${meeting.id}/notices`, {}],
  ] as const) {
    const response =
      method === "put" ? await page.request.put(path, { data }) : await page.request.post(path, { data });
    expect(response.ok(), path).toBeTruthy();
  }

  await page.goto(`/app/meetings/${meeting.id}`);
  await expect(page.getByTestId("meeting-edit-details")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await waitForPageEntrance(page);
  await capture(page, `${journey}/08-telephone-seance`);

  await page.goto("/app/workspace");
  await page.getByTestId("workspace-create-menu").tap();
  await expect(page.getByTestId("workspace-create-takePhoto")).toBeVisible();
  await waitForPageEntrance(page);
  await capture(page, `${journey}/11-telephone-photo`);
  await page.keyboard.press("Escape");

  await switchAccount(page, "conduite");
  await signIn(page, "conduite", `/app/meetings/${meeting.id}/live`);
  await expect(page.getByTestId("live-rollcall-heading")).toBeVisible();
  await page.getByTestId("live-attendance-all-present").tap();
  await expect(page.getByTestId("live-meeting-start")).toBeEnabled();
  await waitForPageEntrance(page);
  await capture(page, `${journey}/09-telephone-appel`);

  await page.getByTestId("live-meeting-start").tap();
  await page.getByTestId("live-agenda-start").tap();
  await page.getByTestId("live-ballot-open").tap();
  await page.getByTestId("live-ballot-all-for").tap();
  await expect(page.getByTestId("live-ballot-preview-open")).toBeVisible();
  await page.getByTestId("live-ballot-preview-open").scrollIntoViewIfNeeded();
  await waitForPageEntrance(page);
  await capture(page, `${journey}/10-telephone-vote`);
});
