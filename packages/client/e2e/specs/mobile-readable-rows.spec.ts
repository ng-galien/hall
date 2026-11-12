import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";

const widths = [360, 390, 768, 852, 1440];
/** At and below this width Hall uses its phone layout, where each item opens on its own page. */
const phoneWidth = 760;

/** A row title is visible inside the screen; a title longer than its line ends with an ellipsis (HALL-FR-LAY-060). */
async function expectReadable(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.width > 40 && bounds.left >= 0 && bounds.right <= window.innerWidth + 1;
      }),
    )
    .toBe(true);
}

/** Scrolls an action into view, again when the list renders it anew, and checks that a finger reaches it. */
async function expectReachable(locator: Locator) {
  await expect(async () => {
    await locator.scrollIntoViewIfNeeded({ timeout: 2_000 });
    await expect(locator).toBeInViewport({ timeout: 1_000 });
  }).toPass();
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        return bounds.left >= 0 && bounds.right <= window.innerWidth + 1 && !!hit && element.contains(hit);
      }),
    )
    .toBe(true);
}

async function expectOpensRecord(row: Locator) {
  const name = row.locator(".list-row-title");
  await name.scrollIntoViewIfNeeded();
  await expect(name).toBeInViewport();
  await expect
    .poll(() =>
      name.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        return !!hit?.closest(".list-row-main");
      }),
    )
    .toBe(true);
}

// @verifies-requirement HALL-FR-LAY-010
test("member list preserves identities beside status and commissions at every responsive width", async ({
  appPage: page,
}) => {
  await page.goto("/app/council-members");
  const rows = page.getByTestId(/^member-record-/);
  await expect(rows.first()).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const row of await rows.all()) {
      const name = row.locator(".list-row-title");
      await expectReadable(name);
      const nameBox = await name.boundingBox();
      const statusBox = await row.locator(".list-row-status").boundingBox();
      expect(nameBox && statusBox).toBeTruthy();
      expect(nameBox!.y + nameBox!.height <= statusBox!.y || nameBox!.x + nameBox!.width <= statusBox!.x).toBe(true);
    }
    await expectOpensRecord(rows.first());
  }
});

/**
 * Every visible row shows its title, keeps its state clear of the facts beside it and stays inside its line; the
 * page does not scroll sideways, neither the document nor the content area beside the side panel.
 */
async function expectRowsFit(page: Page, screen: string) {
  const defects = await page.evaluate(() => {
    const crosses = (a: DOMRect, b: DOMRect) =>
      a.width > 0 &&
      b.width > 0 &&
      a.left < b.right - 1 &&
      b.left < a.right - 1 &&
      a.top < b.bottom - 1 &&
      b.top < a.bottom - 1;
    const found: string[] = [];
    for (const row of document.querySelectorAll<HTMLElement>('[data-slot="list-row"]')) {
      if (!row.offsetParent) continue;
      const title = row.querySelector<HTMLElement>(".list-row-title");
      const name = title?.textContent?.trim() || row.dataset.testid || "row";
      if (title && title.getBoundingClientRect().width < 40) found.push(`${name}: title hidden`);
      const status = row.querySelector(".list-row-status")?.getBoundingClientRect();
      for (const fact of row.querySelectorAll(".list-row-detail-text, .list-row-wide > *, .list-row-fact")) {
        if (status && crosses(status, fact.getBoundingClientRect())) found.push(`${name}: state covers a fact`);
      }
      const line = row.querySelector<HTMLElement>(".list-row-line");
      if (line && line.scrollWidth > line.clientWidth + 1) found.push(`${name}: line wider than the row`);
    }
    if (document.documentElement.scrollWidth > window.innerWidth + 1) found.push("document scrolls sideways");
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      const overflow = getComputedStyle(element).overflowX;
      if ((overflow === "auto" || overflow === "scroll") && element.scrollWidth > element.clientWidth + 1) {
        found.push(`${element.className || element.tagName} scrolls sideways`);
      }
    }
    return found;
  });
  expect(defects, screen).toEqual([]);
}

test.describe("person and body lists", () => {
  test.use({ seedScenario: "minutes" });

  // @verifies-requirement HALL-FR-LAY-060
  test("rows keep name, state and facts apart without sideways scrolling at every width and theme", async ({
    appPage: page,
  }) => {
    test.setTimeout(120_000);
    const closed = (await (await page.request.get("/api/council-meetings")).json()).entities
      .map((entry: { properties: { id: string; closedAt: string | null } }) => entry.properties)
      .find((meeting: { closedAt: string | null }) => meeting.closedAt);
    expect(closed).toBeTruthy();
    const screens = [
      "/app/council-members",
      "/app/users",
      "/app/contacts",
      "/app/council-committees",
      "/app/council-delegations",
      `/app/meetings/${closed.id}`,
    ];
    for (const path of screens) {
      await page.goto(path);
      await expect(page.locator('[data-slot="list-row"]').first()).toBeVisible();
      if (path === `/app/meetings/${closed.id}`) {
        await page.getByTestId("report-attendance-toggle").click();
        await expect(page.getByTestId("report-attendance-list")).toBeVisible();
      }
      for (const width of [1030, 1280, 768, 375]) {
        await page.setViewportSize({ width, height: 900 });
        for (const colorScheme of ["light", "dark"] as const) {
          await page.emulateMedia({ colorScheme });
          await expectRowsFit(page, `${path} at ${width} px, ${colorScheme}`);
        }
      }
    }
    await page.goto("/app/council-members");
    await page.setViewportSize({ width: 1030, height: 900 });
    const member = page.getByTestId(/^member-record-/).first();
    await expect(member.locator(".list-row-title")).toBeVisible();
    await expectReadable(member.locator(".list-row-title"));
  });

  // @verifies-requirement HALL-FR-LAY-060
  test("with a mouse on a computer, list rows take the size of the side menu", async ({ appPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/app/contacts");
    const row = page.locator('[data-slot="list-row"]').first();
    await expect(row).toBeVisible();
    const sizes = await page.evaluate(() => {
      const size = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        return {
          font: Number.parseFloat(getComputedStyle(element).fontSize),
          height: Math.round(element.getBoundingClientRect().height),
        };
      };
      return {
        menu: size("aside .nav-row"),
        title: size(".list-row-title"),
        detail: size(".list-row-detail"),
        line: size(".list-row-line"),
        search: size('[data-slot="search-input"] > input'),
        screenTitle: size("h1"),
      };
    });
    expect(sizes.title?.font).toBe(sizes.menu?.font);
    expect(sizes.detail!.font).toBeLessThan(sizes.title!.font);
    expect(sizes.line?.height).toBe(52);
    expect(sizes.search?.font).toBe(sizes.menu?.font);
    expect(sizes.screenTitle!.font).toBeGreaterThan(sizes.title!.font);
  });
});

// @verifies-requirement HALL-FR-LAY-010
test("prepared and scheduled titles keep their actions reachable in meetings and business", async ({
  appPage: page,
}) => {
  test.setTimeout(60_000);
  const response = await page.request.post("/api/council-business", {
    data: { path: "", name: `Mobile rows ${crypto.randomUUID()}`, reportName: "Report", reportContent: "" },
  });
  expect(response.status()).toBe(201);
  const business = (await response.json()).properties;
  const title = "Voirie : pont du Gué-de-la-Brenne et sécurisation des déplacements des habitants";
  const prepared = await page.request.post(`/api/council-business/${business.id}/prepared-subjects`, {
    data: { kind: "openQuestion", name: title, content: "Présentation du sujet préparé." },
  });
  expect(prepared.status()).toBe(201);
  const subject = (await prepared.json()).properties;
  const meetings = await (await page.request.get("/api/council-meetings")).json();
  const meeting = meetings.entities
    .map((entry: { properties: { id: string; startedAt: string | null } }) => entry.properties)
    .find((entry: { startedAt: string | null }) => !entry.startedAt);
  expect(meeting).toBeTruthy();
  await page.goto(`/app/meetings/${meeting.id}`);
  const add = page.getByTestId(`agenda-candidate-add-${subject.id}`);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    // On a phone the title opens the page of the prepared subject instead of unfolding it.
    const candidate = page.getByTestId(
      width <= phoneWidth ? `agenda-candidate-open-${subject.id}` : `agenda-candidate-preview-${subject.id}`,
    );
    await expectReadable(candidate.locator(".list-row-title"));
    await expectReachable(candidate);
    await expectReachable(add);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const scheduledResponse = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/agenda-items"),
  );
  await add.click();
  expect((await scheduledResponse).ok()).toBe(true);
  const agendaResponse = await page.request.get(`/api/council-business/agenda-items?councilBusinessId=${business.id}`);
  const agenda = (await agendaResponse.json()).entities.map(
    (entry: { properties: { id: string } }) => entry.properties,
  );
  expect(agenda).toHaveLength(1);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    if (width <= phoneWidth) {
      const point = page.getByTestId(`agenda-item-open-${agenda[0].id}`);
      await expectReadable(point.locator(".list-row-title"));
      await expectReachable(point);
      continue;
    }
    const scheduled = page.getByTestId(`agenda-item-expand-${agenda[0].id}`);
    await expectReadable(scheduled.locator(".list-row-title"));
    await expectReachable(scheduled);
    await expectReachable(page.getByTestId(`agenda-item-open-business-${agenda[0].id}`));
  }
  await page.goto(`/app/workspace?councilBusiness=${business.id}`);
  const open = page.getByTestId(`business-subject-${subject.id}-open`);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expect(open).toContainText(title);
    await expectReadable(open.locator(".list-row-title"));
    await expectReachable(open);
    if (width > phoneWidth) await expectReachable(page.getByTestId(`business-subject-unschedule-${subject.id}`));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await open.click();
  await expect(page.getByTestId("resource-phone-view")).toContainText("Présentation du sujet préparé.");
  await page.getByTestId("phone-document-actions").click();
  await expect(page.getByTestId("phone-document-action-subject-unschedule")).toBeVisible();
});
