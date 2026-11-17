import type { Locator, Page } from "@playwright/test";
import { expect, openMenuEntry, test } from "../fixtures/application";

test.use({ hasTouch: true });

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEElEQVR42mNk+M+ABzDhkAIAEwQCAiV7nNwAAAAASUVORK5CYII=",
  "base64",
);

async function expectFitsWidth(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect
    .poll(() =>
      page.getByTestId("application-main").evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    )
    .toBe(true);
}

// @verifies-requirement HALL-FR-LAY-010
test("phone navigation and sections fit the viewport and preserve desktop navigation", async ({
  appPage: page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/app/");
  // On a phone the bottom bar replaces the drawer; « Plus » opens the other destinations.
  await expect(page.getByTestId("phone-navigation")).toBeVisible();
  await expect(page.getByTestId("navigation-toggle")).toHaveCount(0);
  // The bar presents home, documents, calendar and meetings in this order, then « Plus ».
  await expect
    .poll(() =>
      page
        .getByTestId("phone-navigation")
        .locator(":scope > [data-testid]")
        .evaluateAll((items) => items.map((item) => item.getAttribute("data-testid"))),
    )
    .toEqual([
      "phone-navigation-home",
      "phone-navigation-documents",
      "phone-navigation-calendar",
      "phone-navigation-meetings",
      "phone-navigation-more",
    ]);
  for (const [destination, route] of [
    ["meetings", "/meetings"],
    ["calendar", "/calendar"],
    ["documents", "/workspace"],
    ["home", "/"],
  ] as const) {
    await page.getByTestId(`phone-navigation-${destination}`).tap();
    await expect(page.getByTestId("application-main")).toHaveAttribute("data-route", route);
    await expect(page.getByTestId(`phone-navigation-${destination}`)).toHaveAttribute("aria-current", "page");
    // Choice 1A: only the active destination is marked, in blue and bold, and no icon has a pad behind it.
    await expect
      .poll(() =>
        page
          .getByTestId("phone-navigation")
          .locator(":scope > [data-testid]")
          .evaluateAll((items) =>
            items.map((item) => {
              const icon = item.querySelector(".app-phone-bar-icon");
              const padded = icon !== null && getComputedStyle(icon).backgroundColor !== "rgba(0, 0, 0, 0)";
              return item.getAttribute("data-active") === "true" && !padded;
            }),
          ),
      )
      .toEqual(["home", "documents", "calendar", "meetings", "more"].map((entry) => entry === destination));
    await expectFitsWidth(page);
  }
  for (const [destination, route] of [
    ["council-decisions", "/council-decisions"],
    ["minutes", "/minutes"],
    ["maps", "/maps"],
    ["users", "/users"],
    ["contacts", "/contacts"],
    ["council-members", "/council-members"],
    ["council-committees", "/council-committees"],
    ["council-delegations", "/council-delegations"],
    ["templates", "/templates"],
    ["mail", "/mail"],
    ["administration-commune", "/administration/commune"],
    ["settings", "/settings"],
    ["help", "/docs"],
  ] as const) {
    await page.getByTestId("phone-navigation-more").tap();
    const sheet = page.getByTestId("phone-more");
    await expect(sheet).toBeVisible();
    if (destination === "council-decisions") {
      await page.screenshot({ path: testInfo.outputPath("phone-more.png"), animations: "disabled" });
      // Shapes keep the radius of the cards and fields: the sheet and the active mark are not pills.
      expect(
        await sheet.evaluate((element) => Number.parseFloat(getComputedStyle(element).borderTopLeftRadius)),
      ).toBeLessThanOrEqual(8);
      expect(
        await page
          .getByTestId("phone-navigation-more")
          .locator('[aria-hidden="true"]')
          .first()
          .evaluate((element) => Number.parseFloat(getComputedStyle(element).borderTopLeftRadius)),
      ).toBeLessThanOrEqual(8);
      // The last row of the sheet keeps a margin above the bottom edge of the screen.
      await sheet.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
      await expect
        .poll(async () => {
          const last = await sheet.getByTestId("phone-more-help").boundingBox();
          return last ? 800 - (last.y + last.height) : 0;
        })
        .toBeGreaterThanOrEqual(24);
    }
    await sheet.getByTestId(`phone-more-${destination}`).tap();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId("application-main")).toHaveAttribute("data-route", new RegExp(`^${route}(/|$)`));
    // Maps records its view in the address once loaded; wait for it so that the next sheet stays open.
    if (destination === "maps") await expect(page).toHaveURL(/\/app\/maps\?view=/);
    await expectFitsWidth(page);
    if (destination === "maps")
      await page.screenshot({ path: testInfo.outputPath("phone-maps.png"), animations: "disabled" });
  }

  // Above the phone, one menu anchored at the left: folded in its rail below 1000 pixels until the person chooses.
  await page.setViewportSize({ width: 768, height: 800 });
  await page.goto("/app/");
  await expect(page.getByTestId("phone-navigation")).toHaveCount(0);
  const sidebar = page.locator(".app-sidebar");
  await expect(sidebar).toHaveCount(1);
  await expect(sidebar).toHaveAttribute("data-compact", "true");
  await page.getByTestId("navigation-toggle").click();
  await expect(sidebar).not.toHaveAttribute("data-compact", "true");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const destination of [
    "contacts",
    "council-members",
    "meetings",
    "minutes",
    "council-decisions",
    "workspace",
    "maps",
    "calendar",
    "council-committees",
    "settings",
  ]) {
    await openMenuEntry(page, destination);
    await expect(sidebar).not.toHaveAttribute("data-compact", "true");
    await expectFitsWidth(page);
  }
  const measures: Array<{ width: number; row: number }> = [];
  for (const width of [783, 1030, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(sidebar).not.toHaveAttribute("data-compact", "true");
    measures.push({
      width: Math.round((await sidebar.boundingBox())!.width),
      row: Math.round((await page.getByTestId("navigation-overview").boundingBox())!.height),
    });
  }
  expect(new Set(measures.map((measure) => `${measure.width}x${measure.row}`)).size, JSON.stringify(measures)).toBe(1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByTestId("navigation-workspace")).toBeVisible();
  await expect(page.getByTestId("phone-navigation")).toHaveCount(0);
});

// @verifies-requirement HALL-FR-LAY-010
test("phone documentation shows the page over the whole width and opens its contents on demand", async ({
  appPage: page,
}) => {
  for (const width of [375, 360]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/app/docs/prise-en-main");
    const article = page.getByTestId("docs-article");
    await expect(article).toBeVisible();
    await expect(page.getByTestId("docs-navigation")).toHaveCount(0);
    const text = article.locator("p").first();
    await expect(text).toBeVisible();
    expect((await article.boundingBox())!.width).toBeGreaterThanOrEqual(width - 1);
    expect((await text.boundingBox())!.width).toBeGreaterThanOrEqual(width - 40);
    await expectFitsWidth(page);

    await page.getByTestId("docs-navigation-toggle").tap();
    const contents = page.getByTestId("docs-navigation");
    await expect(contents).toBeVisible();
    await expect(article).toBeHidden();
    expect((await contents.boundingBox())!.width).toBeGreaterThanOrEqual(width - 1);
    await contents.getByTestId("docs-page-ecrans").tap();
    await expect(page).toHaveURL(/\/app\/docs\/ecrans$/);
    await expect(contents).toBeHidden();
    await expect(article).toBeVisible();
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/app/docs/prise-en-main");
  await expect(page.getByTestId("docs-navigation")).toBeVisible();
  await expect(page.getByTestId("docs-article")).toBeVisible();
});

// @verifies-requirement HALL-FR-LAY-010
test("phone calendar keeps a two-row toolbar, a floating « + Nouveau » and a single scrolling grid", async ({
  appPage: page,
}) => {
  // The French labels are the longest ones.
  await page.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
  // A morning hour: the day view opens on it without reaching the end of the day.
  await page.clock.setFixedTime(new Date(2026, 10, 10, 10, 20));
  for (const width of [375, 360]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/app/calendar");
    await expect(page.getByTestId("calendar-title")).not.toBeEmpty();
    await expect(page.getByTestId("calendar-slot-label").first()).toBeAttached();
    // Creation is the floating « + Nouveau » of the screen.
    const create = page.getByTestId("calendar-new");
    await expect(create).toBeVisible();
    const createBox = (await create.boundingBox())!;
    expect(Math.min(createBox.width, createBox.height)).toBeGreaterThanOrEqual(44);
    const toolbar = await page.evaluate(() => {
      const box = (testId: string) => document.querySelector(`[data-testid="${testId}"]`)!.getBoundingClientRect();
      const heading = document.querySelector<HTMLElement>('[data-testid="calendar-title"]')!;
      const controls = [
        "calendar-today",
        "calendar-view-list",
        "calendar-view-dayGridMonth",
        "calendar-view-timeGridWeek",
        "calendar-view-timeGridDay",
      ].map(box);
      const all = [...controls, heading.getBoundingClientRect()];
      const overlaps = all.flatMap((a, index) =>
        all
          .slice(index + 1)
          .filter(
            (b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5,
          ),
      ).length;
      return {
        rows: new Set(all.map((rect) => Math.round(rect.top + rect.height / 2))).size,
        titleTruncated: heading.scrollWidth > heading.clientWidth + 1,
        smallest: Math.min(...controls.map((rect) => Math.min(rect.width, rect.height))),
        overlaps,
        rightGap: document.documentElement.clientWidth - Math.max(...all.map((rect) => rect.right)),
        legend: document.querySelectorAll(".calendar-legend").length,
        periodArrows: document.querySelectorAll('[data-testid="calendar-previous"], [data-testid="calendar-next"]')
          .length,
      };
    });
    expect(toolbar.rows, "toolbar rows").toBeLessThanOrEqual(2);
    expect(toolbar.titleTruncated, "period shown whole").toBe(false);
    expect(toolbar.smallest, "toolbar targets").toBeGreaterThanOrEqual(44);
    expect(toolbar.overlaps, "toolbar controls apart").toBe(0);
    expect(toolbar.rightGap, "space before the right edge").toBeGreaterThanOrEqual(4);
    expect(toolbar.legend, "colour legend without action").toBe(0);
    expect(toolbar.periodArrows, "the period changes by a swipe or the period picker").toBe(0);
    // A single area scrolls: the grid of the day; the page itself does not, once the grid has taken its height.
    const scrollingAreas = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .filter((element) => {
            const style = getComputedStyle(element);
            return (
              ["auto", "scroll"].includes(style.overflowY) &&
              element.scrollHeight > element.clientHeight + 1 &&
              element.getBoundingClientRect().height > 0
            );
          })
          .map((element) => `${element.tagName.toLowerCase()}.${[...element.classList].join(".")}`),
      );
    await expect.poll(scrollingAreas, { message: "vertical scrolling areas" }).toHaveLength(1);
    // No hour label of the day view is half hidden under the header of the grid.
    const cutLabels = await page.getByTestId("calendar-slot-label").evaluateAll((labels) =>
      labels.flatMap((label) => {
        const rect = label.getBoundingClientRect();
        let top = rect.top;
        for (let parent = label.parentElement; parent; parent = parent.parentElement) {
          if (getComputedStyle(parent).overflowY !== "visible") top = Math.max(top, parent.getBoundingClientRect().top);
        }
        const hidden = top - rect.top;
        return hidden > 0.5 && hidden < rect.height - 0.5 ? [(label.textContent ?? "").trim()] : [];
      }),
    );
    expect(cutLabels, "hour labels cut at the top of the day view").toEqual([]);
    await expectFitsWidth(page);
  }
});

// @verifies-requirement HALL-FR-LAY-010
// @verifies-requirement HALL-FR-WSP-320
test("phone maps open the list of maps over the map from the field, the back arrow closes it", async ({
  appPage: page,
}) => {
  const root = `Cartes téléphone ${Date.now()}`;
  for (const name of ["Cimetière", "Réservoirs", "Sentiers", "Voirie"]) {
    const created = await page.request.post("/api/resources", {
      data: { kind: "geographic", name, path: `${root}/${name}` },
    });
    expect(created.ok()).toBeTruthy();
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/maps");
  await expect(page).toHaveURL(/\/app\/maps\?view=/);
  // The map takes the screen and the field stands on it; the list is closed on arrival.
  await expect(page.getByTestId("maps-surface")).toBeVisible();
  await expect(page.getByTestId("maps-context-empty")).toBeHidden();
  const search = page.getByTestId("maps-search");
  await expect(search).toBeVisible();
  await expect(page.getByTestId("maps-list")).toHaveCount(0);

  await search.tap();
  const list = page.getByTestId("maps-list");
  await expect(list).toBeVisible();
  const visibleRows = await list.evaluate((element) => {
    const bar = document.querySelector('[data-testid="phone-navigation"]')?.getBoundingClientRect().top ?? innerHeight;
    const bounds = element.getBoundingClientRect();
    const bottom = Math.min(bar, bounds.bottom);
    return [...element.querySelectorAll("li[data-resource-id]")].filter((row) => {
      const rect = row.getBoundingClientRect();
      return rect.height > 0 && rect.top >= bounds.top - 0.5 && rect.bottom <= bottom + 0.5;
    }).length;
  });
  expect(visibleRows, "lines of the list of maps visible without scrolling").toBeGreaterThanOrEqual(3);
  await expectFitsWidth(page);
  await page.screenshot({ path: test.info().outputPath("phone-maps-list.png"), animations: "disabled" });

  const first = list.locator("li[data-resource-id]").first();
  const id = await first.getAttribute("data-resource-id");
  await first.getByTestId("maps-entry").tap();
  await expect(page).toHaveURL(new RegExp(`/maps/${id}\\?view=`));
  await expect(page.getByTestId("maps-list")).toHaveCount(0);
  await expect(search).toHaveValue("");

  await search.tap();
  await expect(page.getByTestId("maps-list")).toBeVisible();
  await page.getByTestId("phone-header-back").tap();
  await expect(page.getByTestId("maps-list")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/maps/${id}\\?view=`));
  await expectFitsWidth(page);
});

// @verifies-requirement HALL-FR-LAY-010
// @verifies-requirement HALL-FR-LAY-110
test("phone settings are one screen per entry, without tabs, within the width", async ({ appPage: page }) => {
  await page.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
  await page.setViewportSize({ width: 375, height: 812 });
  for (const screen of ["settings", "administration/commune", "administration/mail"]) {
    await page.goto(`/app/${screen}`);
    await expect(page.getByTestId(/^settings-.*-screen$/)).toBeVisible();
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expectFitsWidth(page);
  }
});

/** Focus marks of a field and of the element that carries its visible border, read once their transitions end. */
async function focusMarks(field: Locator, frame: Locator) {
  const style = (element: Element) => {
    const computed = getComputedStyle(element);
    return {
      outline: computed.outlineStyle !== "none" && Number.parseFloat(computed.outlineWidth) > 0,
      shadow: computed.boxShadow,
      border: computed.borderTopColor,
    };
  };
  const before = await frame.evaluate(style);
  await field.focus();
  for (const element of [field, frame])
    await element.evaluate((node) =>
      Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
    );
  return { before, field: await field.evaluate(style), frame: await frame.evaluate(style) };
}

// @verifies-requirement HALL-FR-LAY-010
test("a focused field shows one sober mark, its underline turning blue, without a frame around it", async ({
  appPage: page,
}) => {
  for (const viewport of [
    { width: 360, height: 740 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/app/meetings");
    const search = page.getByTestId("collection-search");
    const searchMarks = await focusMarks(search, search);
    expect(searchMarks.field.outline, "search field outline").toBe(false);
    expect(searchMarks.field.shadow, "search underline on focus").not.toBe(searchMarks.before.shadow);

    await page.goto("/app/contacts");
    await page.getByTestId("contacts-add").click();
    const firstName = page.getByTestId("contact-first-name");
    const fieldMarks = await focusMarks(firstName, firstName);
    expect(fieldMarks.field.outline, "form field outline").toBe(false);
    expect(fieldMarks.field.shadow, "form field underline on focus").not.toBe(fieldMarks.before.shadow);
    await page.keyboard.press("Escape");
  }
});

// @verifies-requirement HALL-FR-LAY-010
test("phone form can be completed and submitted without horizontal overflow", async ({ appPage: page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/app/contacts");
  // The search takes the width; creation is the floating « + Nouveau » at the bottom right.
  await expect(page.getByTestId("collection-search")).toBeVisible();
  const searchBox = (await page.getByTestId("collection-search").boundingBox())!;
  const addBox = (await page.getByTestId("contacts-add").boundingBox())!;
  expect(searchBox.width, "search over the width").toBeGreaterThanOrEqual(360 - 2 * 16);
  expect(addBox.x + addBox.width, "floating button inside the screen").toBeLessThanOrEqual(360);
  expect(addBox.y, "floating button at the bottom").toBeGreaterThan(740 / 2);
  await page.getByTestId("contacts-add").tap();
  const form = page.getByTestId("contact-create-form");
  await expect(form).toBeVisible();
  await page.getByTestId("contact-first-name").fill("Mobile");
  await page.getByTestId("contact-last-name").fill("Verification");
  expect(await form.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.getByTestId("contact-create-submit").tap();
  await expect(form).toBeHidden();
  await page.getByTestId("collection-search").fill("Verification");
  await expect(page.getByTestId("application-main")).toContainText("Mobile Verification");
});

// @verifies-requirement HALL-FR-LAY-010
// @verifies-requirement HALL-FR-DOC-230
test("phone photo selection and camera input persist images through the shared editor", async ({
  appPage: page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const created = await page.request.post("/api/resources", {
    data: { kind: "text", name: `Mobile photo ${crypto.randomUUID()}`, path: "seed", content: "Texte conservé." },
  });
  expect(created.ok()).toBe(true);
  const resource = (await created.json()).properties as { id: string; slug: string };
  const url = `/app/workspace?path=seed&resource=${resource.id}`;
  const editNote = async () => {
    await page.getByTestId("text-edit").click();
  };
  await page.goto(url);
  await editNote();
  const compact = page.getByTestId("markdown-editor-compact").first();
  await expect(compact.getByTestId("editor-photo")).toBeVisible();
  await compact.getByTestId("editor-photo").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("editor-photo-sheet").getByTestId("editor-choose-image").click();
  await (await chooser).setFiles({ name: "telephone.png", mimeType: "image/png", buffer: png });
  await expect(compact.locator(".editor-image-node")).toHaveCount(1);
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/resources/${resource.slug}`)).json()).properties.content as string,
    )
    .toContain("::image[");
  await page.reload();
  await editNote();
  await expect(compact.locator(".editor-image-node")).toHaveCount(1);
  await expect(compact.getByTestId("editor-writing-area")).toContainText("Texte conservé.");
  // The text fills the phone screen: the full-screen editor is not offered, the camera is in the same sheet.
  await expect(compact.getByTestId("editor-open-enriched")).toBeHidden();
  await expect(compact.getByTestId("editor-camera-file")).toHaveAttribute("capture", "environment");
  await compact.getByTestId("editor-photo").click();
  const camera = page.waitForEvent("filechooser");
  await page.getByTestId("editor-photo-sheet").getByTestId("editor-take-photo").click();
  await (await camera).setFiles({ name: "camera.png", mimeType: "image/png", buffer: png });
  await expect(compact.locator(".editor-image-node")).toHaveCount(2);
  await expect
    .poll(
      async () =>
        (
          (
            (await (await page.request.get(`/api/resources/${resource.slug}`)).json()).properties.content as string
          ).match(/::image\[/g) ?? []
        ).length,
    )
    .toBe(2);
  await page.reload();
  await editNote();
  await expect(compact.locator(".editor-image-node")).toHaveCount(2);
  await expect
    .poll(() =>
      compact
        .locator(".editor-image-node img")
        .evaluateAll(
          (images) => images.length === 2 && images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath("phone-persisted-photos.png"), animations: "disabled" });
  await compact
    .getByTestId("editor-image-file")
    .setInputFiles({ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("refused") });
  await expect(compact.getByTestId("editor-image-status")).toHaveAttribute("data-status", "failed");
  await expect(compact.getByTestId("editor-writing-area")).toContainText("Texte conservé.");
  await expect(compact.locator(".editor-image-node")).toHaveCount(2);
  await page.route("**/api/resources/*", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET" || ![resource.id, resource.slug].some((id) => path.endsWith(`/${id}`)))
      return route.continue();
    const response = await route.fetch();
    const representation = await response.json();
    representation.actions = representation.actions.filter(
      (action: { name: string }) => action.name !== "resource.update-content",
    );
    await route.fulfill({ response, body: JSON.stringify(representation) });
  });
  await page.reload();
  await expect(page.getByTestId("application-main")).toContainText("Texte conservé.");
  await page.getByTestId("phone-document-actions").click();
  await expect(page.getByTestId("phone-document-action-copy-reference")).toBeVisible();
  await expect(page.getByTestId("text-edit")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("editor-choose-image")).toHaveCount(0);
  await expect(page.getByTestId("editor-take-photo")).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});

// @verifies-requirement HALL-FR-LAY-010
// @verifies-requirement HALL-FR-DOC-230
test("a long phone note keeps its header and its writing tools on screen while photos are added and text is typed", async ({
  appPage: page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const paragraphs = Array.from(
    { length: 40 },
    (_, index) => `Paragraphe ${index + 1} du compte rendu de la visite du chantier de la salle des fêtes.`,
  );
  const created = await page.request.post("/api/resources", {
    data: { kind: "text", name: `Note longue ${crypto.randomUUID()}`, path: "seed", content: paragraphs.join("\n\n") },
  });
  expect(created.ok()).toBe(true);
  const resource = (await created.json()).properties as { id: string; slug: string };
  await page.goto(`/app/workspace?path=seed&resource=${resource.id}`);
  await page.getByTestId("text-edit").click();
  const compact = page.getByTestId("markdown-editor-compact").first();
  const writingArea = compact.getByTestId("editor-writing-area");
  await expect(writingArea).toContainText("Paragraphe 40");

  /** The header and the writing tools are inside the window and the page itself has not scrolled. */
  const expectFrameOnScreen = async (step: string) => {
    const height = page.viewportSize()!.height;
    for (const target of [
      page.getByTestId("phone-header"),
      compact.getByTestId("editor-photo"),
      page.getByTestId("editor-phone-toolbar"),
    ]) {
      await expect(target, step).toBeVisible();
      const box = await target.boundingBox();
      expect(box, step).not.toBeNull();
      expect(box!.y, `${step}: top`).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height, `${step}: bottom`).toBeLessThanOrEqual(height + 0.5);
    }
    expect(await page.evaluate(() => window.scrollY), `${step}: page scroll`).toBe(0);
  };
  await expectFrameOnScreen("note opened for writing");

  const storedImages = async () =>
    (
      ((await (await page.request.get(`/api/resources/${resource.slug}`)).json()).properties.content as string).match(
        /::image\[/g,
      ) ?? []
    ).length;
  /** The writing as a list of paragraphs and photos, in order. */
  const blocks = () =>
    writingArea.evaluate((root) =>
      Array.from(root.children).map((block) =>
        block.matches(".editor-image-node") || block.querySelector(".editor-image-node")
          ? "[photo]"
          : (block.textContent ?? "").trim(),
      ),
    );
  // Each photo is held on its way to the server, so that text is typed while it is sent.
  const held: { release?: () => void } = {};
  await page.route("**/api/resources/editor-assets**", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise<void>((release) => {
      held.release = release;
    });
    await route.continue();
  });
  const placedAfter: number[] = [];
  for (const [index, paragraph] of [10, 25, 40].entries()) {
    placedAfter.push(paragraph);
    const target = writingArea.locator("p", { hasText: `Paragraphe ${paragraph} du compte rendu` });
    await target.click();
    await target.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    });
    await expectFrameOnScreen(`caret at paragraph ${paragraph}`);
    await compact.getByTestId("editor-photo").click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("editor-photo-sheet").getByTestId("editor-choose-image").click();
    await (await chooser).setFiles({ name: `chantier-${index + 1}.png`, mimeType: "image/png", buffer: png });
    await expect.poll(() => held.release !== undefined, `photo ${index + 1} sent`).toBe(true);
    await page.keyboard.type(`Écrit pendant l'envoi ${index + 1}.`);
    await expect(writingArea).toContainText(`Écrit pendant l'envoi ${index + 1}.`);
    held.release!();
    held.release = undefined;
    await expect(compact.locator(".editor-image-node")).toHaveCount(index + 1);
    await expect.poll(storedImages).toBe(index + 1);
    await expectFrameOnScreen(`photo ${index + 1} placed`);
    await page.keyboard.type(` Écrit après la photo ${index + 1}.`);
    await expect(writingArea).toContainText(`Écrit après la photo ${index + 1}.`);
    await expectFrameOnScreen(`text typed after photo ${index + 1}`);
    // Under each photo placed so far: the paragraph of the caret above it, then everything typed for it, in order.
    const current = await blocks();
    const photos = current.flatMap((block, position) => (block === "[photo]" ? [position] : []));
    expect(photos, `photo ${index + 1}: photos in the text`).toHaveLength(index + 1);
    photos.forEach((position, photo) => {
      expect(current[position - 1], `photo ${photo + 1}: paragraph above`).toMatch(
        new RegExp(`^Paragraphe ${placedAfter[photo]} du compte rendu`),
      );
      expect(current[position + 1], `photo ${photo + 1}: text under`).toBe(
        `Écrit pendant l'envoi ${photo + 1}. Écrit après la photo ${photo + 1}.`,
      );
    });
  }
  await page.unrouteAll({ behavior: "wait" });
  // Text, photo, text, photo, text, photo, text: the paragraphs, each photo and the text typed under it.
  const final = await blocks();
  const typed = (photo: number) => `Écrit pendant l'envoi ${photo}. Écrit après la photo ${photo}.`;
  const paragraphRange = (from: number, to: number) => paragraphs.slice(from - 1, to);
  expect(final.filter((block) => block !== "")).toEqual([
    ...paragraphRange(1, 10),
    "[photo]",
    typed(1),
    ...paragraphRange(11, 25),
    "[photo]",
    typed(2),
    ...paragraphRange(26, 40),
    "[photo]",
    typed(3),
  ]);
  await expect
    .poll(async () => {
      const content = (await (await page.request.get(`/api/resources/${resource.slug}`)).json()).properties
        .content as string;
      return content.match(/::image\[|Écrit pendant l'envoi \d\. Écrit après la photo \d\./g);
    })
    .toEqual(["::image[", typed(1), "::image[", typed(2), "::image[", typed(3)]);
  await page.screenshot({ path: testInfo.outputPath("phone-long-note-photos.png"), animations: "disabled" });
});

// @verifies-requirement HALL-FR-LAY-010
test("the back command of a phone closes what is open over the screen before it leaves the screen", async ({
  appPage: page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const created = await page.request.post("/api/resources", {
    data: { kind: "text", name: `Retour ${crypto.randomUUID().slice(0, 8)}`, path: "seed", content: "Début." },
  });
  expect(created.ok()).toBe(true);
  const resource = (await created.json()).properties as { id: string; slug: string };

  await page.goto("/app/workspace?path=seed");
  const address = page.url();
  await page.getByTestId("workspace-create-menu").click();
  const sheet = page.getByTestId("workspace-create-options");
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet, "the back command closes the open sheet").toBeHidden();
  expect(page.url(), "the screen stays").toBe(address);
  await expect(page.getByTestId("workspace-create-menu")).toBeVisible();
  await page.goForward();
  await expect(sheet, "going forward does not open the sheet again").toBeHidden();

  const text = `/app/workspace?path=seed&resource=${resource.id}`;
  await page.goto(text);
  await page.getByTestId("text-edit").click();
  await expect(page.getByTestId("text-finish-editing")).toBeVisible();
  const area = page.getByTestId("markdown-editor-compact").first().getByTestId("editor-writing-area");
  await area.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Ajout au retour.");
  await page.goBack();
  await expect(page.getByTestId("text-finish-editing"), "the text comes back to reading").toHaveCount(0);
  await expect(page.getByTestId("text-edit")).toBeVisible();
  expect(page.url(), "the text stays open").toContain(`resource=${resource.id}`);
  await expect
    .poll(async () => (await (await page.request.get(`/api/resources/${resource.slug}`)).json()).properties.content)
    .toContain("Ajout au retour.");
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/workspace\?path=seed$/);
});

// @verifies-requirement HALL-FR-LAY-180
test("a phone opens a spreadsheet for reading and writes a cell through « Modifier »", async ({ appPage: page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const resources = (await (await page.request.get("/api/resources?path=")).json()) as {
    entities: Array<{ properties: { id: string; kind: string; name: string } }>;
  };
  const seeded = resources.entities.find(
    ({ properties }) => properties.kind === "spreadsheet" && properties.name === "Chiffrage de la seconde ligne",
  )?.properties;
  expect(seeded).toBeTruthy();
  const source = (await (await page.request.get(`/api/resources/${seeded!.id}`)).json()).properties;
  const created = await page.request.post("/api/resources", {
    data: {
      kind: "spreadsheet",
      path: "",
      name: `Tableur ${crypto.randomUUID().slice(0, 8)}`,
      document: source.document,
    },
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).properties.id as string;

  await page.goto(`/app/workspace?resource=${id}`);
  const grid = page.getByTestId("spreadsheet-grid");
  await expect(grid).toBeVisible({ timeout: 15_000 });
  await expect(grid).toHaveAttribute("aria-readonly", "true");
  await expect(page.getByTestId("text-edit")).toBeVisible();
  await expect(page.getByTestId("spreadsheet-phone-toolbar")).toHaveCount(0);
  await expect(page.getByTestId("spreadsheet-cell-bar")).toHaveCount(0);
  const line = page.getByTestId("spreadsheet-cell-line");
  await expect(line).toBeVisible();
  const box = (await grid.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + 80);
  await expect(line.locator(".spreadsheet-cell-line-name")).toHaveText(/^[A-Z]+\d+$/);
  /* A text area of the spreadsheet library may take the focus, but none opens the keyboard of the phone. */
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("input:focus, textarea:focus, [contenteditable=true]:focus")]
          .filter((element) => element.getAttribute("inputmode") !== "none")
          .map((element) => element.dataset.testid ?? element.tagName),
      ),
    )
    .toEqual([]);

  await page.getByTestId("text-edit").click();
  await expect(page.getByTestId("text-finish-editing")).toBeVisible();
  await expect(grid).toHaveAttribute("aria-readonly", "false");
  await expect(page.getByTestId("spreadsheet-phone-toolbar")).toBeVisible();
  for (const tool of ["undo", "redo", "bold", "italic", "insert-row", "insert-column"])
    await expect(page.getByTestId(`spreadsheet-${tool}`)).toBeVisible();
  const input = page.getByTestId("spreadsheet-cell-input");
  await expect(input).toBeEnabled();
  const cellName = (await page.getByTestId("spreadsheet-cell-field").textContent())?.trim();
  await input.fill("4242");
  await page.getByTestId("spreadsheet-cell-next-row").click();
  await page.getByTestId("text-finish-editing").click();
  await expect(page.getByTestId("text-edit")).toBeVisible();
  await expect(grid).toHaveAttribute("aria-readonly", "true");
  await expect
    .poll(async () =>
      JSON.stringify((await (await page.request.get(`/api/resources/${id}`)).json()).properties.document),
    )
    .toContain("4242");
  expect(cellName, "the field carries the name of the cell").toMatch(/[A-Z]+\d+/);
});
