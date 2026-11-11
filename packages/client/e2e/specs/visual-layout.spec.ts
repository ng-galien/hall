import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";
import { saveMeetingField } from "../fixtures/meetingPreparation";

test.use({ seedScenario: "preparation" });

/* Layout assertions on the Alésia screens, on a desktop and on a phone: header buttons whose icons cover their
   label, pages left on the loading indicator, and the page scrolling while selecting meeting officers. */

interface Entity<T> {
  properties: T;
}

async function items<T>(page: Page, path: string): Promise<T[]> {
  const response = await page.request.get(path);
  expect(response.ok(), path).toBeTruthy();
  return (((await response.json()) as { entities?: Entity<T>[] }).entities ?? []).map((entity) => entity.properties);
}

async function expectLoaded(page: Page) {
  await page.waitForLoadState("networkidle");
  const label = await page.evaluate(() => (document.documentElement.lang === "fr" ? "Chargement…" : "Loading…"));
  await expect(page.getByText(label, { exact: true })).toHaveCount(0);
}

async function expectIconsBesideLabel(button: Locator) {
  await expect(button).toBeVisible();
  const layout = await button.evaluate((element) => {
    const tolerance = 0.5;
    const box = element.getBoundingClientRect();
    const icons = [...element.querySelectorAll("svg")]
      .map((icon) => icon.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const labels: DOMRect[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      labels.push(...range.getClientRects());
    }
    const intersects = (a: DOMRect, b: DOMRect) =>
      a.left < b.right - tolerance &&
      b.left < a.right - tolerance &&
      a.top < b.bottom - tolerance &&
      b.top < a.bottom - tolerance;
    return {
      iconsOverLabel: icons.filter((icon) => labels.some((label) => intersects(icon, label))).length,
      iconsOverIcons: icons.filter((icon, index) => icons.some((other, at) => at !== index && intersects(icon, other)))
        .length,
      iconsOutside: icons.filter(
        (icon) =>
          icon.left < box.left - tolerance ||
          icon.right > box.right + tolerance ||
          icon.top < box.top - tolerance ||
          icon.bottom > box.bottom + tolerance,
      ).length,
    };
  });
  expect(layout, await button.getAttribute("data-testid")).toEqual({
    iconsOverLabel: 0,
    iconsOverIcons: 0,
    iconsOutside: 0,
  });
}

async function scrollPositions(page: Page) {
  return page.evaluate(() => ({
    main: document.querySelector("main")?.scrollTop ?? 0,
    document: document.scrollingElement?.scrollTop ?? 0,
  }));
}

async function meetingInPreparation(page: Page) {
  const meetings = await items<{ id: string; startedAt: string | null; closedAt: string | null }>(
    page,
    "/api/council-meetings",
  );
  return meetings.find((meeting) => !meeting.startedAt && !meeting.closedAt)!;
}

for (const [device, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["phone", { width: 390, height: 844 }],
] as const) {
  test.describe(`layout on a ${device}`, () => {
    test.use({ viewport });

    test("loaded Alésia screens and meeting header buttons", async ({ appPage: page }) => {
      await page.goto("/app/");
      await expectLoaded(page);
      await page.goto("/app/meetings");
      await expectLoaded(page);

      const meeting = await meetingInPreparation(page);
      await page.goto(`/app/meetings/${meeting.id}`);
      await expectLoaded(page);
      await expect(page.getByTestId("meeting-document-notice-state")).toHaveAttribute("data-tone", "warning");
      await expect(page.getByTestId("meeting-details-inline")).toBeVisible();
      await expectIconsBesideLabel(page.getByTestId("meeting-proxy-form-open"));
      await expectIconsBesideLabel(page.getByTestId("meeting-enter-live").first());

      const [chair, secretary] = (await items<{ id: string; active: boolean }>(page, "/api/council-members")).filter(
        (member) => member.active,
      );
      for (const [path, data] of [
        [
          `/api/council-meetings/${meeting.id}/prepare`,
          {
            scheduledAt: new Date(Date.now() - 30 * 60_000).toISOString(),
            location: "Maison commune de l’oppidum",
            chairMemberId: chair!.id,
            secretaryMemberId: secretary!.id,
          },
        ],
        [`/api/council-meetings/${meeting.id}/notices`, {}],
      ] as const) {
        const response = path.endsWith("/prepare")
          ? await page.request.put(path, { data })
          : await page.request.post(path, { data });
        expect(response.ok(), path).toBeTruthy();
      }
      await page.goto(`/app/meetings/${meeting.id}/live`);
      await expectLoaded(page);
      await expect(page.getByTestId("live-rollcall-heading")).toBeVisible();
    });

    test("the page stays still when selecting inline meeting officers", async ({ appPage: page }) => {
      const meeting = await meetingInPreparation(page);
      const members = await items<{ id: string; active: boolean }>(page, "/api/council-members");
      const [chair, secretary] = members.filter((member) => member.active);
      await page.goto(`/app/meetings/${meeting.id}`);
      await expectLoaded(page);
      await expect(page.getByTestId("meeting-edit-chair")).toBeVisible();
      const before = await scrollPositions(page);

      await page.getByTestId("meeting-edit-chair").click();
      await page
        .getByTestId("meeting-edit-chair-search-result")
        .and(page.locator(`[data-reference-id="${chair!.id}"]`))
        .click();
      await page.getByTestId("meeting-edit-secretary").click();
      await saveMeetingField(page, () =>
        page
          .getByTestId("meeting-edit-secretary-search-result")
          .and(page.locator(`[data-reference-id="${secretary!.id}"]`))
          .click(),
      );
      await expectLoaded(page);
      expect(await scrollPositions(page)).toEqual(before);
    });
  });
}
