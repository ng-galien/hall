import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";

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
    // Only the active destination carries a tinted pill behind its icon.
    await expect
      .poll(() =>
        page
          .getByTestId("phone-navigation")
          .locator(':scope > [data-testid] > [aria-hidden="true"]')
          .evaluateAll((icons) => icons.map((icon) => getComputedStyle(icon).backgroundColor !== "rgba(0, 0, 0, 0)")),
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
    ["account", "/settings"],
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
      await expect
        .poll(async () => {
          const last = await sheet.getByTestId("phone-more-account").boundingBox();
          return last ? 800 - (last.y + last.height) : 0;
        })
        .toBeGreaterThanOrEqual(24);
    }
    await sheet.getByTestId(`phone-more-${destination}`).tap();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId("application-main")).toHaveAttribute("data-route", new RegExp(`^${route}(/|$)`));
    // « Mon compte » opens the settings on the tab holding the password change and the logout.
    if (destination === "account")
      await expect(page.getByTestId("settings-tab-preferences")).toHaveAttribute("aria-selected", "true");
    // Maps records its view in the address once loaded; wait for it so that the next sheet stays open.
    if (destination === "maps") await expect(page).toHaveURL(/\/app\/maps\?view=/);
    await expectFitsWidth(page);
    if (destination === "maps")
      await page.screenshot({ path: testInfo.outputPath("phone-maps.png"), animations: "disabled" });
  }

  await page.setViewportSize({ width: 768, height: 800 });
  await page.goto("/app/");
  await expect(page.getByTestId("phone-navigation")).toHaveCount(0);
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
    await page.getByTestId("navigation-toggle").tap();
    const menu = page.getByTestId("mobile-navigation");
    await expect(menu).toBeVisible();
    const link = menu.getByTestId(`navigation-${destination}`);
    const route = (await link.getAttribute("href"))?.replace(/^\/app/, "");
    await link.tap();
    await expect(menu).toBeHidden();
    // The layout closes the menu when the route commits: wait for it before reopening the menu.
    await expect(page.getByTestId("application-main")).toHaveAttribute("data-route", route ?? "");
    await expectFitsWidth(page);
  }
  await page.getByTestId("navigation-toggle").click();
  await page.getByTestId("mobile-navigation").getByTestId("dialog-close").click();
  await expect(page.getByTestId("mobile-navigation")).toBeHidden();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByTestId("navigation-workspace")).toBeVisible();
  await expect(page.getByTestId("mobile-navigation")).toHaveCount(0);
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
        "calendar-previous",
        "calendar-next",
        "calendar-today",
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
      };
    });
    expect(toolbar.rows, "toolbar rows").toBeLessThanOrEqual(2);
    expect(toolbar.titleTruncated, "period shown whole").toBe(false);
    expect(toolbar.smallest, "toolbar targets").toBeGreaterThanOrEqual(44);
    expect(toolbar.overlaps, "toolbar controls apart").toBe(0);
    expect(toolbar.rightGap, "space before the right edge").toBeGreaterThanOrEqual(4);
    expect(toolbar.legend, "colour legend without action").toBe(0);
    // A single area scrolls: the grid of the day; the page itself does not.
    const scrolling = await page.evaluate(
      () =>
        [...document.querySelectorAll("body *")].filter((element) => {
          const style = getComputedStyle(element);
          return (
            ["auto", "scroll"].includes(style.overflowY) &&
            element.scrollHeight > element.clientHeight + 1 &&
            element.getBoundingClientRect().height > 0
          );
        }).length,
    );
    expect(scrolling, "vertical scrolling areas").toBe(1);
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
test("phone maps show several rows of the map tree until a map is chosen", async ({ appPage: page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/maps");
  const tree = page.getByTestId("maps-tree");
  await expect(tree).toBeVisible();
  await expect(page.getByTestId("maps-context-empty")).toBeVisible();
  const visibleRows = await tree.evaluate((element) => {
    const bar = document.querySelector('[data-testid="phone-navigation"]')?.getBoundingClientRect().top ?? innerHeight;
    let top = 0;
    let bottom = bar;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (getComputedStyle(parent).overflowY === "visible") continue;
      const bounds = parent.getBoundingClientRect();
      top = Math.max(top, bounds.top);
      bottom = Math.min(bottom, bounds.bottom);
    }
    return [...element.querySelectorAll("[data-testid]")].filter((row) => {
      const rect = row.getBoundingClientRect();
      return rect.height > 0 && rect.top >= top - 0.5 && rect.bottom <= bottom + 0.5;
    }).length;
  });
  expect(visibleRows, "map tree rows visible without scrolling").toBeGreaterThanOrEqual(3);
  await expectFitsWidth(page);
});

// @verifies-requirement HALL-FR-LAY-010
test("phone settings categories stay on one row that scrolls sideways", async ({ appPage: page }) => {
  await page.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/app/settings");
  const tabs = page.getByTestId("settings-tabs");
  const triggers = tabs.getByTestId(/^settings-tab-/);
  await expect(triggers.first()).toBeVisible();
  const rows = await triggers.evaluateAll(
    (elements) => new Set(elements.map((element) => Math.round(element.getBoundingClientRect().top))).size,
  );
  expect(rows, "category rows").toBe(1);
  expect(await tabs.evaluate((element) => getComputedStyle(element).overflowX)).toBe("auto");
  const last = triggers.last();
  await last.scrollIntoViewIfNeeded();
  await last.tap();
  await expect(last).toHaveAttribute("data-state", "active");
  await expectFitsWidth(page);
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
test("a focused field shows one sober mark on its own border, without a frame around it", async ({ appPage: page }) => {
  for (const viewport of [
    { width: 360, height: 740 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/app/meetings");
    const search = page.getByTestId("collection-search");
    const searchMarks = await focusMarks(search, page.locator(".collection-search", { has: search }));
    expect(searchMarks.field.outline, "search field outline").toBe(false);
    expect(searchMarks.field.shadow, "search field ring").toBe("none");
    expect(searchMarks.frame.outline, "search container outline").toBe(false);
    expect(searchMarks.frame.shadow, "search container ring").toBe("none");
    expect(searchMarks.frame.border, "search container border on focus").not.toBe(searchMarks.before.border);

    await page.goto("/app/contacts");
    await page.getByTestId("contacts-add").click();
    const firstName = page.getByTestId("contact-first-name");
    const fieldMarks = await focusMarks(firstName, firstName);
    expect(fieldMarks.field.outline, "form field outline").toBe(false);
    expect(fieldMarks.field.shadow, "form field ring").toBe("none");
    expect(fieldMarks.field.border, "form field border on focus").not.toBe(fieldMarks.before.border);
    await page.keyboard.press("Escape");
  }
});

// @verifies-requirement HALL-FR-LAY-010
test("phone form can be completed and submitted without horizontal overflow", async ({ appPage: page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/app/contacts");
  // The search keeps the width beside the creation button.
  await expect(page.getByTestId("collection-search")).toBeVisible();
  const searchBox = (await page.locator(".collection-search").boundingBox())!;
  const addBox = (await page.getByTestId("contacts-add").boundingBox())!;
  expect(Math.abs(searchBox.y + searchBox.height / 2 - (addBox.y + addBox.height / 2)), "same row").toBeLessThan(4);
  expect(searchBox.width + addBox.width, "search and button over the width").toBeGreaterThanOrEqual(360 - 24 - 16);
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
    await page.getByTestId("phone-document-action-edit").click();
  };
  await page.goto(url);
  await editNote();
  const compact = page.getByTestId("markdown-editor-compact").first();
  await expect(compact.getByTestId("editor-choose-image")).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await compact.getByTestId("editor-choose-image").click();
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
  await compact.getByTestId("editor-open-enriched").click();
  const enriched = page.getByTestId("markdown-editor-enriched");
  await expect(enriched.getByTestId("editor-camera-file")).toHaveAttribute("capture", "environment");
  const camera = page.waitForEvent("filechooser");
  await enriched.getByTestId("editor-take-photo").click();
  await (await camera).setFiles({ name: "camera.png", mimeType: "image/png", buffer: png });
  await expect(enriched.locator(".editor-image-node")).toHaveCount(2);
  await page.getByTestId("editor-enriched-dialog").getByTestId("dialog-close").click();
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
  await expect(page.getByTestId("phone-document-action-edit")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("editor-choose-image")).toHaveCount(0);
  await expect(page.getByTestId("editor-take-photo")).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});
