import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";

/* Every Hall screen on a phone: no horizontal scrolling, nothing cut at the right edge, touch targets of at least
   44 points, no text under 14 pixels and no truncated action label. A link inside a sentence is exempt, as in
   WCAG 2.5.8, and a check box or radio button is measured with its label. HALL_MOBILE_AUDIT=report prints the
   findings instead of asserting them. */
// @verifies-requirement HALL-FR-LAY-020

const minimumTarget = 44;
const minimumFontSize = 14;
const report = process.env.HALL_MOBILE_AUDIT === "report";

interface Entity<T> {
  properties: T;
}

async function items<T>(page: Page, path: string): Promise<T[]> {
  const response = await page.request.get(path);
  expect(response.ok(), path).toBeTruthy();
  return (((await response.json()) as { entities?: Entity<T>[] }).entities ?? []).map((entity) => entity.properties);
}

async function layoutFindings(page: Page) {
  return page.evaluate(
    ({ minimum, minimumFont }) => {
      const viewport = document.documentElement.clientWidth;
      const visible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (rect.width <= 0 || rect.height <= 0 || style.visibility === "hidden" || style.display === "none")
          return false;
        if (rect.right <= 0 || rect.left >= viewport) return false;
        for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          const clipping = getComputedStyle(parent);
          const bounds = parent.getBoundingClientRect();
          if (clipping.overflowX !== "visible" && (rect.right <= bounds.left || rect.left >= bounds.right))
            return false;
          if (clipping.overflowY !== "visible" && (rect.bottom <= bounds.top || rect.top >= bounds.bottom))
            return false;
        }
        return true;
      };
      const describe = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const label =
          element.getAttribute("data-testid") ||
          element.getAttribute("aria-label") ||
          (element.textContent ?? "").trim().slice(0, 40) ||
          element.tagName.toLowerCase();
        return `${element.tagName.toLowerCase()} ${label} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
      };
      const scrolling = document.scrollingElement;
      const horizontalScroll = (scrolling?.scrollWidth ?? 0) > viewport + 1;
      const cutAtRightEdge = (element: Element) => {
        const rect = element.getBoundingClientRect();
        if (rect.right <= viewport + 1) return false;
        let paintedRight = rect.right;
        for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          if (getComputedStyle(parent).overflowX !== "visible")
            paintedRight = Math.min(paintedRight, parent.getBoundingClientRect().right);
        }
        return paintedRight >= viewport - 1;
      };
      const cut = [...document.querySelectorAll("body *")]
        .filter((element) => visible(element) && cutAtRightEdge(element))
        .filter((element) => !element.closest("[data-horizontal-scroll], .maplibregl-map, .univer-spreadsheet, table"))
        .slice(0, 8)
        .map(describe);
      const inSentence = (element: Element) => {
        if (element.tagName !== "A" || !getComputedStyle(element).display.startsWith("inline")) return false;
        const block = element.parentElement?.closest("p, li, td, dd, blockquote");
        return Boolean(block && (block.textContent ?? "").trim().length > (element.textContent ?? "").trim().length);
      };
      const touchArea = (element: Element) => {
        const label = element.closest("label");
        return (element as HTMLInputElement).type === "checkbox" || (element as HTMLInputElement).type === "radio"
          ? (label ?? element).getBoundingClientRect()
          : element.getBoundingClientRect();
      };
      const targets = [
        ...document.querySelectorAll(
          "button, a[href], input:not([type=hidden]):not([type=file]), select, textarea, [role=button], [role=tab], [role=checkbox], [role=radio], [role=switch], [role=menuitem], [role=option]",
        ),
      ]
        .filter(visible)
        .filter((element) => !element.closest(".maplibregl-map, .univer-spreadsheet, [contenteditable=true]"))
        .filter((element) => !inSentence(element))
        .filter((element) => {
          const rect = touchArea(element);
          return rect.width < minimum - 0.5 || rect.height < minimum - 0.5;
        })
        .map(describe);
      const smallText = [...document.querySelectorAll("body *")]
        .filter((element) => visible(element) && !element.closest(".maplibregl-map, .univer-spreadsheet"))
        .filter((element) =>
          [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim()),
        )
        .filter((element) => Number.parseFloat(getComputedStyle(element).fontSize) < minimumFont)
        .slice(0, 8)
        .map(describe);
      const truncatedActions = [...document.querySelectorAll("button, [role=tab], [role=button], [data-slot=button]")]
        .filter((element) => visible(element) && !element.closest(".maplibregl-map, .univer-spreadsheet"))
        .filter((element) => !element.closest("[title]") && !element.querySelector("[title]"))
        .filter((element) => element.scrollWidth > element.clientWidth + 1 && (element.textContent ?? "").trim())
        .slice(0, 8)
        .map(describe);
      return { horizontalScroll, cut, smallTargets: targets, smallText, truncatedActions };
    },
    { minimum: minimumTarget, minimumFont: minimumFontSize },
  );
}

const findings: Record<string, Awaited<ReturnType<typeof layoutFindings>>> = {};

async function record(page: Page, name: string) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  findings[name] = await layoutFindings(page);
  await page.screenshot({ path: test.info().outputPath(`${name.replaceAll(" ", "-")}.png`), animations: "disabled" });
}

async function check(page: Page, name: string, path: string, settle?: () => Promise<void>) {
  await page.goto(`/app${path}`);
  await page.waitForLoadState("networkidle");
  if (settle) await settle();
  await page.waitForTimeout(300);
  await record(page, name);
}

async function expectCoarsePointer(page: Page) {
  await page.goto("/app/");
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), "coarse pointer emulated").toBe(true);
}

function expectFindings() {
  for (const [screen, result] of Object.entries(findings)) {
    expect.soft(result.horizontalScroll, `${screen}: horizontal scrolling`).toBe(false);
    expect.soft(result.cut, `${screen}: cut at the right edge`).toEqual([]);
    expect.soft(result.smallTargets, `${screen}: targets under ${minimumTarget} points`).toEqual([]);
    expect.soft(result.smallText, `${screen}: text under ${minimumFontSize} pixels`).toEqual([]);
    expect.soft(result.truncatedActions, `${screen}: truncated action labels`).toEqual([]);
  }
}

for (const [device, viewport] of [
  ["phone", { width: 390, height: 844 }],
  ["unfolded", { width: 768, height: 1024 }],
] as const) {
  test.describe(`Hall screens on a ${device}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, seedScenario: "default" });

    test("every screen fits the width and offers finger-sized targets", async ({ appPage: page }) => {
      test.setTimeout(8 * 60_000);
      for (const key of Object.keys(findings)) delete findings[key];
      await expectCoarsePointer(page);
      const meetings = await items<{ id: string; startedAt: string | null; closedAt: string | null }>(
        page,
        "/api/council-meetings",
      );
      const running = meetings.find((meeting) => meeting.startedAt && !meeting.closedAt);
      const closed = meetings.find((meeting) => meeting.closedAt);
      const [minutes] = await items<{ id: string }>(page, "/api/minutes");
      const [decision] = await items<{ id: string }>(page, "/api/council-decisions");
      const [business] = await items<{ id: string }>(page, "/api/council-business");
      const resources = await items<{ id: string; kind: string }>(page, "/api/resources");
      const byKind = (kind: string) => resources.find((resource) => resource.kind === kind);
      const [contact] = await items<{ id: string }>(page, "/api/contacts");
      const [member] = await items<{ id: string }>(page, "/api/council-members");
      const [committee] = await items<{ id: string }>(page, "/api/council-committees");
      const [user] = await items<{ id: string }>(page, "/api/users");

      await check(page, "overview", "/");
      await check(page, "meetings", "/meetings");
      if (closed) {
        await check(page, "closed meeting", `/meetings/${closed.id}`, async () => {
          await expect(page.getByTestId("meeting-report-facts")).toBeVisible();
          const minutesLink = page.getByTestId("meeting-document-minutes-open");
          await expect(minutesLink).toBeVisible();
          // On a phone the meeting title moves from the page to the phone header.
          const meetingTitle =
            device === "phone" ? page.getByTestId("phone-header-title") : page.locator(".meeting-report-header h1");
          await expect(meetingTitle).toBeVisible();
          await expect
            .poll(
              async () => {
                const title = await meetingTitle.boundingBox();
                const link = await minutesLink.boundingBox();
                return Boolean(
                  title &&
                    link &&
                    (link.y >= title.y + title.height ||
                      title.y >= link.y + link.height ||
                      link.x >= title.x + title.width ||
                      title.x >= link.x + link.width),
                );
              },
              { message: "The minutes link must not overlap the closed meeting title" },
            )
            .toBe(true);
        });
      }
      if (running) {
        await check(page, "running meeting", `/meetings/${running.id}`);
        await check(page, "meeting mode", `/meetings/${running.id}/live`);
      }
      await check(page, "minutes list", "/minutes");
      if (minutes) await check(page, "minutes", `/minutes/${minutes.id}`);
      await check(page, "decisions list", "/council-decisions");
      if (decision) await check(page, "decision", `/council-decisions/${decision.id}`);
      await check(page, "workspace", "/workspace");
      if (business) await check(page, "business", `/workspace?councilBusiness=${business.id}`);
      for (const kind of ["text", "spreadsheet", "document", "remote"]) {
        const resource = byKind(kind);
        if (resource) await check(page, `${kind} resource`, `/workspace?resource=${resource.id}`);
      }
      await check(page, "maps", "/maps");
      await check(page, "calendar", "/calendar");
      await check(page, "contacts", "/contacts");
      if (contact) await check(page, "contact", `/contacts/${contact.id}`);
      await check(page, "council members", "/council-members");
      if (member) await check(page, "council member", `/council-members/${member.id}`);
      await check(page, "committees", "/council-committees");
      if (committee) await check(page, "committee", `/council-committees/${committee.id}`);
      await check(page, "users", "/users");
      if (user) await check(page, "user", `/users/${user.id}`);
      await check(page, "settings", "/settings");
      await check(page, "documentation", "/docs");

      if (report) {
        console.log(`MOBILE-AUDIT ${device} ${JSON.stringify(findings)}`);
        return;
      }
      expectFindings();
    });
  });
}

for (const [device, viewport] of [
  ["phone", { width: 390, height: 844 }],
  ["unfolded", { width: 768, height: 1024 }],
] as const) {
  test.describe(`Meeting mode on a ${device}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, seedScenario: "preparation" });

    test("roll call, conduct, vote and dialogs fit the width with finger-sized targets", async ({ appPage: page }) => {
      test.setTimeout(4 * 60_000);
      for (const key of Object.keys(findings)) delete findings[key];
      await expectCoarsePointer(page);
      const meetings = await items<{ id: string; startedAt: string | null; closedAt: string | null }>(
        page,
        "/api/council-meetings",
      );
      const meeting = meetings.find((entry) => !entry.startedAt && !entry.closedAt)!;
      const members = (await items<{ id: string; active: boolean }>(page, "/api/council-members")).filter(
        (member) => member.active,
      );
      for (const [method, path, data] of [
        [
          "put",
          `/api/council-meetings/${meeting.id}/prepare`,
          {
            scheduledAt: new Date(Date.now() - 30 * 60_000).toISOString(),
            location: "Maison commune de l’oppidum",
            chairMemberId: members[0]!.id,
            secretaryMemberId: members[1]!.id,
          },
        ],
        ["post", `/api/council-meetings/${meeting.id}/notices`, {}],
      ] as const) {
        const response =
          method === "put" ? await page.request.put(path, { data }) : await page.request.post(path, { data });
        expect(response.ok(), path).toBeTruthy();
      }
      await check(page, "meeting preparation", `/meetings/${meeting.id}`);
      await check(page, "established meeting properties", `/meetings/${meeting.id}`, async () => {
        await expect(page.getByTestId("meeting-facts")).toBeVisible();
        // Establishing the notice locks the schedule, but officers must remain editable.
        await expect.soft(page.getByTestId("meeting-edit-chair")).toBeVisible();
      });
      await check(page, "roll call", `/meetings/${meeting.id}/live`, async () => {
        await expect(page.getByTestId("live-rollcall-heading")).toBeVisible();
      });
      await page.getByTestId("live-attendance-all-present").tap();
      await page.getByTestId("live-meeting-start").tap();
      await expect(page.getByTestId("live-agenda-start")).toBeVisible();
      await record(page, "conduct");
      await page.getByTestId("live-agenda-start").tap();
      await page.getByTestId("live-ballot-open").tap();
      await expect(page.getByTestId("live-ballot-all-for")).toBeVisible();
      await page.getByTestId("live-ballot-all-for").tap();
      await page.getByTestId("live-ballot-preview-open").tap();
      await expect(page.getByTestId("live-ballot-preview")).toBeVisible();
      await record(page, "vote preview");
      await page.getByTestId("live-ballot-preview-correct").tap();
      await expect(page.getByTestId("live-ballot-preview")).toBeHidden();
      await record(page, "vote");

      if (report) {
        console.log(`MOBILE-AUDIT-MEETING ${device} ${JSON.stringify(findings)}`);
        return;
      }
      expectFindings();
    });
  });
}

test.describe("Layout audit clipping", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("ignores internal clipping while reporting real viewport cuts", async ({ page }) => {
    await page.setContent(
      `<style>body{margin:0}#clip{position:absolute;left:320px;top:20px;width:50px;height:44px;overflow:hidden}#content{width:306px;height:44px}</style><div id="clip"><div id="content">General</div></div>`,
    );
    const internal = await layoutFindings(page);
    expect(internal.horizontalScroll).toBe(false);
    expect(internal.cut).toEqual([]);

    await page.setContent(
      `<style>body{margin:0}#content{position:absolute;left:360px;top:20px;width:80px;height:44px}</style><div id="content" data-testid="real-overflow">Overflow</div>`,
    );
    const overflow = await layoutFindings(page);
    expect(overflow.horizontalScroll).toBe(true);
    expect(overflow.cut).toEqual(["div real-overflow 80x44"]);

    await page.setContent(
      `<style>body{margin:0}#clip{position:absolute;left:320px;top:20px;width:70px;height:44px;overflow:hidden}#content{width:306px;height:44px}</style><div id="clip"><div id="content">General</div></div>`,
    );
    const viewportCut = await layoutFindings(page);
    expect(viewportCut.horizontalScroll).toBe(false);
    expect(viewportCut.cut).toEqual(["div General 306x44"]);
  });
});
