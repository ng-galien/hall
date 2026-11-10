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
      await page.getByTestId(`meeting-history-${closed.id}`).tap();
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
        await page.getByTestId("phone-header-back").tap();
        await expect(page).toHaveURL(notePage);
      }
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
