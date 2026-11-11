import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";

/* On a phone every content has its own page: the bottom bar leads to the destinations, the header arrow and the
   phone's back return to the previous screen, and the bar is hidden while reading. */

interface Entity<T> {
  properties: T;
}

async function items<T>(page: Page, path: string): Promise<T[]> {
  const response = await page.request.get(path);
  expect(response.ok(), path).toBeTruthy();
  return (((await response.json()) as { entities?: Entity<T>[] }).entities ?? []).map((entity) => entity.properties);
}

/** A PDF of blank pages with a correct cross-reference table. */
function blankPdf(pageCount: number) {
  const pageIds = Array.from({ length: pageCount }, (_, index) => index + 3);
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    `<</Type/Pages/Kids[${pageIds.map((id) => `${id} 0 R`).join(" ")}]/Count ${pageCount}>>`,
    ...pageIds.map(() => "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>"),
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj${object}endobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

/** Touch events of one finger or two, sent through one DevTools session so that a gesture keeps its touches. */
async function touchscreen(page: Page) {
  const session = await page.context().newCDPSession(page);
  return (type: "touchStart" | "touchMove" | "touchEnd", points: [number, number][]) =>
    session.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map(([x, y], id) => ({ x, y, id })),
    });
}

/** Rows of an open drop-down menu (height, text size and menu width), measured once its opening animation ends. */
async function menuMeasures(page: Page, testId: string) {
  const menu = page.getByTestId(testId);
  await expect(menu).toBeVisible();
  await menu.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
  );
  return menu.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    radius: Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
    viewport: document.documentElement.clientWidth,
    rows: [...element.querySelectorAll('[data-slot="dropdown-menu-item"]')].map((row) => ({
      height: row.getBoundingClientRect().height,
      font: Number.parseFloat(getComputedStyle(row).fontSize),
      icon: row.querySelector("svg")?.getBoundingClientRect().width ?? 0,
    })),
  }));
}

function expectPhoneMenu(measures: Awaited<ReturnType<typeof menuMeasures>>) {
  expect(measures.rows.length).toBeGreaterThan(0);
  expect(measures.width, "menu width").toBeGreaterThanOrEqual(measures.viewport - 40);
  expect(measures.radius, "menu corner radius").toBeLessThanOrEqual(8);
  for (const row of measures.rows) {
    expect(row.height, "menu row height").toBeGreaterThanOrEqual(44);
    expect(row.font, "menu text size").toBeGreaterThanOrEqual(15);
    expect(row.icon, "menu icon size").toBeGreaterThanOrEqual(20);
  }
}

test.describe("Hall pages on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test.describe("with the meetings of the demonstration", () => {
    test.use({ seedScenario: "default" });

    // @verifies-requirement HALL-FR-LAY-040
    // @verifies-requirement HALL-FR-LAY-010
    test("the home page leads to the meeting in progress and opens a recent document on its own page", async ({
      appPage: page,
    }) => {
      const meetings = await items<{
        id: string;
        slug: string | null;
        startedAt: string | null;
        closedAt: string | null;
      }>(page, "/api/council-meetings");
      const running = meetings.find((meeting) => meeting.startedAt && !meeting.closedAt)!;
      expect(running).toBeTruthy();

      await page.goto("/app/");
      await expect(page.getByTestId("home-meeting")).toBeVisible();
      await expect(page.getByTestId("home-meeting-follow")).toHaveAttribute(
        "href",
        `/app/meetings/${running.slug ?? running.id}/live`,
      );
      await expect(page.getByTestId("phone-navigation-home")).toHaveAttribute("aria-current", "page");

      const recent = page.getByTestId("home-recent").getByTestId(/^home-recent-document-/);
      await expect(recent.first()).toBeVisible();
      await recent.first().tap();
      await expect(page).toHaveURL(/\/app\/workspace\?.*resource=/);
      await expect(page.getByTestId("resource-phone-view")).toBeVisible();
      await expect(page.getByTestId("phone-navigation")).toHaveCount(0);
      await page.getByTestId("phone-header-back").tap();
      await expect(page).toHaveURL(/\/app\/$/);
      await expect(page.getByTestId("phone-navigation")).toBeVisible();
    });

    // @verifies-requirement HALL-FR-LAY-010
    test("an agenda item opens on its own page and the back arrow returns through the meeting", async ({
      appPage: page,
    }) => {
      const meetings = await items<{ id: string; slug: string | null; closedAt: string | null }>(
        page,
        "/api/council-meetings",
      );
      const closed = meetings.find((meeting) => meeting.closedAt)!;
      expect(closed).toBeTruthy();
      const reference = closed.slug ?? closed.id;

      await page.goto("/app/");
      await page.getByTestId("phone-navigation-meetings").tap();
      await expect(page.getByTestId("application-main")).toHaveAttribute("data-route", "/meetings");
      // The meeting time is shown to the minute.
      const row = page.getByTestId(`meeting-history-${closed.id}`);
      await expect(row).toContainText(/\d{2}:\d{2}/);
      await expect(row).not.toContainText(/\d{2}:\d{2}:\d{2}/);
      await row.tap();
      await expect(page).toHaveURL(new RegExp(`/app/meetings/${reference}$`));
      await expect(page.getByTestId("phone-navigation")).toBeVisible();

      // The last point of the meeting is a deliberation; the first approves the previous minutes.
      const point = page.getByTestId(/^meeting-point-open-/).last();
      await expect(point).toBeVisible();
      const pointId = (await point.getAttribute("data-testid"))!.replace("meeting-point-open-", "");
      await point.tap();
      await expect(page).toHaveURL(new RegExp(`/app/meetings/${reference}/points/${pointId}$`));
      await expect(page.getByTestId(`meeting-point-${pointId}`)).toBeVisible();
      await expect(page.getByTestId("phone-navigation")).toHaveCount(0);
      await page.getByTestId("phone-document-actions").tap();
      await expect(page.getByTestId("phone-document-action-open-business")).toBeVisible();
      await page.keyboard.press("Escape");

      await page.getByTestId("phone-header-back").tap();
      await expect(page).toHaveURL(new RegExp(`/app/meetings/${reference}$`));
      await page.goBack();
      await expect(page).toHaveURL(/\/app\/meetings$/);

      // Opened directly, without a previous screen, the arrow goes up to the meeting.
      await page.goto(`/app/meetings/${reference}/points/${pointId}`);
      await expect(page.getByTestId(`meeting-point-${pointId}`)).toBeVisible();
      await page.getByTestId("phone-header-back").tap();
      await expect(page).toHaveURL(new RegExp(`/app/meetings/${reference}$`));
    });

    // @verifies-requirement HALL-FR-LAY-010
    test("an agenda item with a vote fits the screen width, even beside a text wider than the screen", async ({
      appPage: page,
    }) => {
      const meetings = await items<{ id: string; closedAt: string | null }>(page, "/api/council-meetings");
      let voted: { meetingId: string; pointId: string } | null = null;
      for (const meeting of meetings.filter((entry) => entry.closedAt)) {
        await page.goto(`/app/meetings/${meeting.id}`);
        await expect(page.getByTestId(/^meeting-point-open-/).first()).toBeVisible();
        const pointIds = await page
          .getByTestId(/^meeting-point-open-/)
          .evaluateAll((links) =>
            links.map((link) => link.getAttribute("data-testid")!.replace("meeting-point-open-", "")),
          );
        for (const pointId of pointIds.reverse()) {
          await page.goto(`/app/meetings/${meeting.id}/points/${pointId}`);
          await expect(page.getByTestId(`meeting-point-${pointId}`)).toBeVisible();
          if (await page.getByTestId(/^report-ballot-toggle-/).count()) {
            voted = { meetingId: meeting.id, pointId };
            break;
          }
        }
        if (voted) break;
      }
      expect(voted, "a closed meeting has a point with a vote").toBeTruthy();
      for (const width of [375, 360]) {
        await page.setViewportSize({ width, height: 812 });
        await page.goto(`/app/meetings/${voted!.meetingId}/points/${voted!.pointId}`);
        const point = page.getByTestId(`meeting-point-${voted!.pointId}`);
        await expect(page.getByTestId(/^report-ballot-toggle-/)).toBeVisible();
        // A block of the page wider than the screen (a table, an address, a row of buttons) must not widen the title,
        // the vote or the texts of the point.
        await point.evaluate((article) => {
          const wide = document.createElement("div");
          wide.style.whiteSpace = "nowrap";
          wide.textContent = "https://www.legifrance.gouv.fr/".repeat(3);
          const address = document.createElement("p");
          address.textContent = "https://www.legifrance.gouv.fr/".repeat(3);
          const table = document.createElement("table");
          table.innerHTML = `<tr>${"<td style='white-space:nowrap'>Colonne de tableau</td>".repeat(4)}</tr>`;
          const section = document.createElement("section");
          section.className = "phone-point-text";
          section.append(address, table);
          article.append(wide, section);
        });
        const overflow = await point.evaluate((article) => {
          const right = document.documentElement.clientWidth;
          return [
            article,
            ...article.querySelectorAll(
              ".phone-point-heading, .report-ballot, .report-ballot-count, .phone-point-text, .phone-point-text > *",
            ),
          ]
            .filter((element) => element.getBoundingClientRect().right > right + 0.5)
            .map((element) => `${element.className} ${Math.round(element.getBoundingClientRect().right)}`);
        });
        expect(overflow, `content wider than ${width} pixels`).toEqual([]);
      }
    });

    // @verifies-requirement HALL-FR-LAY-010
    test("the documents search and creation sit in the header and the search opens over the screen", async ({
      appPage: page,
    }) => {
      const name = `Note cherchée ${crypto.randomUUID().slice(0, 8)}`;
      const created = await page.request.post("/api/resources", {
        data: { kind: "text", path: "seed", name, content: "Texte." },
      });
      expect(created.status()).toBe(201);
      const note = (await created.json()).properties as { id: string };

      for (const address of ["/app/workspace", "/app/workspace?path=seed"]) {
        await page.goto(address);
        const header = page.getByTestId("phone-header");
        await expect(header.getByTestId("workspace-search-open")).toBeVisible();
        await expect(header.getByTestId("workspace-create-menu")).toBeVisible();
        await expect(page.getByTestId("workspace-search-input")).toHaveCount(0);
        // The list of folders starts right under the header.
        const firstRow = page.getByTestId("application-main").locator(".workspace-contents").first();
        await expect(firstRow).toBeVisible();
        const headerBottom = (await header.boundingBox())!;
        const listTop = (await firstRow.boundingBox())!.y;
        expect(listTop - (headerBottom.y + headerBottom.height)).toBeLessThanOrEqual(16);
        for (const control of ["workspace-search-open", "workspace-create-menu"]) {
          const box = (await header.getByTestId(control).boundingBox())!;
          expect(Math.min(box.width, box.height), `${control} target`).toBeGreaterThanOrEqual(44);
        }
      }

      // The « Nouveau » menu of the header offers finger-sized rows over the screen width.
      await page.getByTestId("phone-header").getByTestId("workspace-create-menu").tap();
      expectPhoneMenu(await menuMeasures(page, "workspace-create-options"));
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("workspace-create-options")).toBeHidden();

      await page.getByTestId("workspace-search-open").tap();
      const surface = page.getByTestId("workspace-phone-search");
      await expect(surface).toBeVisible();
      const input = surface.getByTestId("workspace-search-input");
      await expect(input).toBeFocused();
      // The surface slides up from the bottom, then covers the screen.
      await expect.poll(async () => (await surface.boundingBox())?.y ?? 999).toBeLessThanOrEqual(1);
      expect((await surface.boundingBox())!.width).toBeGreaterThanOrEqual(389);
      await surface.getByTestId("dialog-close").tap();
      await expect(surface).toBeHidden();
      await expect(page).toHaveURL(/\/app\/workspace\?path=seed$/);

      await page.getByTestId("workspace-search-open").tap();
      await page.getByTestId("workspace-search-input").fill(name);
      const hit = surface.getByTestId("workspace-search-result").filter({ hasText: name });
      await expect(hit).toBeVisible();
      await hit.tap();
      await expect(surface).toBeHidden();
      await expect(page).toHaveURL(new RegExp(`resource=${note.id}`));
      await expect(page.getByTestId("resource-phone-view")).toBeVisible();
    });

    // @verifies-requirement HALL-FR-LAY-010
    test("phone list rows are compact: minutes and meetings keep their texts beside the icon and the state", async ({
      appPage: page,
    }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto("/app/minutes");
      const row = page.getByTestId(/^minutes-open-/).first();
      await expect(row).toBeVisible();
      const minutes = await row.evaluate((element) => {
        const box = (node: Element | null) => node!.getBoundingClientRect();
        const icon = box(element.querySelector(".list-row-head svg"));
        const title = box(element.querySelector(".list-row-title"));
        const date = box(element.querySelector(".list-row-detail-text"));
        const state = box(element.querySelector(".list-row-status"));
        const icons = [...element.querySelectorAll("svg")].filter((svg) => svg.getBoundingClientRect().width > 0);
        return {
          height: element.getBoundingClientRect().height,
          iconBesideTitle: icon.top < title.bottom && title.top < icon.bottom && icon.right <= title.left,
          dateBesideState: date.top < state.bottom && state.top < date.bottom,
          visibleIcons: icons.length,
        };
      });
      expect(minutes.height, "minutes row height").toBeGreaterThanOrEqual(44);
      expect(minutes.height, "minutes row height").toBeLessThanOrEqual(72);
      expect(minutes.iconBesideTitle, "icon on the title line").toBe(true);
      expect(minutes.dateBesideState, "date and state on one line").toBe(true);
      expect(minutes.visibleIcons, "no chevron").toBe(1);

      await page.goto("/app/meetings");
      const meeting = page.getByTestId(/^meeting-history-/).first();
      await expect(meeting).toBeVisible();
      const meetingRow = await meeting.evaluate((element) => {
        const texts = element.querySelector(".list-row-detail-text")!.getBoundingClientRect();
        const badge = element.querySelector(".list-row-status")!.getBoundingClientRect();
        return {
          sameLine: badge.top < texts.bottom && texts.top < badge.bottom,
          height: element.getBoundingClientRect().height,
        };
      });
      expect(meetingRow.sameLine, "meeting state beside its texts").toBe(true);
      expect(meetingRow.height).toBeGreaterThanOrEqual(44);
    });

    // @verifies-requirement HALL-FR-SRC-030
    // @verifies-requirement HALL-FR-LAY-010
    test("a contact or member reference opens its page and the back arrow returns to the note", async ({
      appPage: page,
    }) => {
      const [contact] = await items<{ id: string; firstName: string; lastName: string }>(page, "/api/contacts");
      const [member] = await items<{ id: string }>(page, "/api/council-members");
      expect(contact && member).toBeTruthy();
      const created = await page.request.post("/api/resources", {
        data: {
          kind: "text",
          path: "Conseil",
          name: `Références ${crypto.randomUUID().slice(0, 8)}`,
          content: `Voir :contact[Contact]{#${contact.id}} et :member[Conseiller]{#${member.id}}.`,
        },
      });
      expect(created.status()).toBe(201);
      const note = (await created.json()).properties as { id: string };
      const notePage = new RegExp(`/app/workspace\\?.*resource=${note.id}`);

      for (const [kind, id, route] of [
        ["contact", contact.id, "contacts"],
        ["member", member.id, "council-members"],
      ] as const) {
        await page.goto(`/app/workspace?path=Conseil&resource=${note.id}`);
        await page.getByTestId(`editor-${kind}-reference-${id}`).tap();
        await expect(page).toHaveURL(new RegExp(`/app/${route}/${id}$`));
        await expect(page.getByRole("dialog")).toHaveCount(0);
        if (kind === "contact") {
          await expect(page.getByTestId("contact-firstName")).toHaveValue(contact.firstName);
          await expect(page.getByTestId("contact-lastName")).toHaveValue(contact.lastName);
        } else await expect(page.getByTestId("member-contact-link")).toBeVisible();
        await page.getByTestId("phone-header-back").tap();
        await expect(page).toHaveURL(notePage);
      }
    });
  });

  test.describe("in a narrow window without a touch screen", () => {
    test.use({ seedScenario: "default", hasTouch: false, isMobile: false, viewport: { width: 375, height: 812 } });

    // @verifies-requirement HALL-FR-LAY-010
    // @verifies-requirement HALL-FR-BUS-070
    test("a business page offers finger-sized actions, wrapped titles and a full-width committee selector", async ({
      appPage: page,
    }) => {
      const marker = crypto.randomUUID().slice(0, 8);
      const createdBusiness = await page.request.post("/api/council-business", {
        data: { path: "seed", name: `Convention ${marker}`, reportName: "Rapport", reportContent: "" },
      });
      expect(createdBusiness.ok()).toBeTruthy();
      const business = (await createdBusiness.json()).properties as { id: string; folderPath: string };
      const name = `Délibération relative au renouvellement de la convention de mise à disposition ${marker}`;
      const created = await page.request.post("/api/resources", {
        data: { kind: "text", path: "seed", name, content: "Texte." },
      });
      expect(created.status()).toBe(201);
      const document = (await created.json()).properties as { id: string };
      const associated = await page.request.post(`/api/council-business/${business.id}/resources`, {
        data: { resourceId: document.id },
      });
      expect(associated.ok()).toBeTruthy();

      await page.goto(
        `/app/workspace?${new URLSearchParams({ councilBusiness: business.id, path: business.folderPath })}`,
      );
      await expect(page.getByTestId("council-business-workbench")).toBeVisible();
      const minimumSide = async (testId: string) => {
        const box = (await page.getByTestId(testId).first().boundingBox())!;
        return Math.min(box.width, box.height);
      };
      for (const testId of ["business-create-subject", "attachment-picker-open", "phone-document-actions"])
        expect(await minimumSide(testId), `${testId} target`).toBeGreaterThanOrEqual(44);

      for (const header of [page.getByTestId("phone-header"), page.getByTestId("business-subject-table")]) {
        const icon = await header.locator('[data-size^="icon"] svg').first().boundingBox();
        expect(icon!.width, "action icon size").toBeGreaterThanOrEqual(16);
      }
      await page.getByTestId("business-create-subject").click();
      expectPhoneMenu(await menuMeasures(page, "workspace-create-options"));
      await page.keyboard.press("Escape");
      await page.getByTestId("phone-document-actions").click();
      await expect(page.locator('[data-slot="dropdown-menu-content"][data-state="open"]')).toBeVisible();
      await page
        .locator('[data-slot="dropdown-menu-content"][data-state="open"]')
        .evaluate((element) =>
          Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
        );
      for (const height of await page
        .locator('[data-slot="dropdown-menu-content"][data-state="open"] [data-slot="dropdown-menu-item"]')
        .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height)))
        expect(height, "« ⋯ » menu row height").toBeGreaterThanOrEqual(44);
      await page.keyboard.press("Escape");

      const row = page.getByTestId(`business-phone-document-${document.id}`);
      await expect(row).toBeVisible();
      const title = await row.evaluate((element) => {
        const label = element.querySelector(":scope > span:last-child")!;
        return {
          right: element.getBoundingClientRect().right,
          cut: label.scrollWidth > label.clientWidth + 1,
          lines: Math.round(
            label.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(label).lineHeight),
          ),
          viewport: document.documentElement.clientWidth,
        };
      });
      expect(title.cut, "document title cut").toBe(false);
      expect(title.lines, "document title wraps").toBeGreaterThan(1);
      expect(title.right).toBeLessThanOrEqual(title.viewport);
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);

      await page.getByTestId("phone-document-information-toggle").click();
      const committees = page.getByTestId("business-committees");
      const search = page.getByTestId("business-committee-search");
      await expect(search).toBeVisible();
      const committeesBox = (await committees.boundingBox())!;
      const searchBox = (await search.boundingBox())!;
      expect(searchBox.width, "selector width").toBeGreaterThanOrEqual(committeesBox.width - 1);
      expect(searchBox.height, "selector height").toBeGreaterThanOrEqual(44);
      expect(searchBox.y, "selector under its label").toBeGreaterThan(committeesBox.y + 8);

      await page.getByTestId("business-committee-search-input").click();
      const results = page.getByTestId("business-committee-results");
      await expect(results).toBeVisible();
      expect((await results.boundingBox())!.width, "list width").toBeGreaterThanOrEqual(searchBox.width - 1);
      const choices = page.getByTestId("business-committee-result");
      await expect(choices.first()).toBeVisible();
      for (const height of await choices.evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().height),
      ))
        expect(height, "choice height").toBeGreaterThanOrEqual(44);

      const before = await page.getByTestId("business-committee-badge").count();
      await choices.first().click();
      await expect(page.getByTestId("business-committee-badge")).toHaveCount(before + 1);
      const remove = page.getByTestId("business-committee-remove").last();
      const removeBox = (await remove.boundingBox())!;
      expect(Math.min(removeBox.width, removeBox.height), "remove target").toBeGreaterThanOrEqual(44);
      await remove.click();
      await expect(page.getByTestId("business-committee-badge")).toHaveCount(before);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });

  // @verifies-requirement HALL-FR-DOC-480
  test("a PDF reads page by page, zooms by pinch and double tap, and shows its page", async ({ appPage: page }) => {
    const upload = await page.request.post("/api/resources/documents", {
      multipart: { path: "seed", file: { name: "plan.pdf", mimeType: "application/pdf", buffer: blankPdf(3) } },
    });
    expect(upload.ok(), await upload.text()).toBeTruthy();
    const pdf = (await upload.json()).properties as { id: string };
    // A phone browser has no built-in PDF viewer: Hall draws the pages itself.
    await page.addInitScript(() =>
      Object.defineProperty(Navigator.prototype, "pdfViewerEnabled", { configurable: true, get: () => false }),
    );
    await page.goto(`/app/workspace?path=seed&resource=${pdf.id}`);
    await expect(page.getByTestId("phone-navigation")).toHaveCount(0);

    const reader = page.getByTestId("resource-workbench-object");
    await expect(reader.getByRole("img")).toHaveCount(3);
    await expect(reader.locator("canvas").first()).toBeVisible();
    await expect(page.getByTestId("pdf-page-position")).toHaveText("Page 1 / 3");

    await reader.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    await expect(page.getByTestId("pdf-page-position")).toHaveText("Page 3 / 3");
    await reader.evaluate((element) => element.scrollTo({ top: 0 }));

    const touch = await touchscreen(page);
    const box = (await reader.boundingBox())!;
    const centre: [number, number] = [box.x + box.width / 2, box.y + box.height / 3];
    await touch("touchStart", [
      [centre[0] - 20, centre[1]],
      [centre[0] + 20, centre[1]],
    ]);
    await touch("touchMove", [
      [centre[0] - 50, centre[1]],
      [centre[0] + 50, centre[1]],
    ]);
    await touch("touchEnd", []);
    await expect(reader).toHaveAttribute("data-zoom", "2.5");
    await expect.poll(() => reader.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

    // A double tap returns a zoomed page to the width of the screen, and zooms it again.
    for (const zoom of ["1", "2.5"]) {
      for (let tap = 0; tap < 2; tap += 1) {
        await touch("touchStart", [centre]);
        await touch("touchEnd", []);
      }
      await expect(reader).toHaveAttribute("data-zoom", zoom);
    }

    await page.getByTestId("phone-header-back").tap();
    await expect(page).toHaveURL(/\/app\/workspace\?path=seed$/);
  });
});
