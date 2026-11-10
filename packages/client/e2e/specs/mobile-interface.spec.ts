import type { Page } from "@playwright/test";
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
  for (const [destination, route] of [
    ["meetings", "/meetings"],
    ["calendar", "/calendar"],
    ["documents", "/workspace"],
    ["home", "/"],
  ] as const) {
    await page.getByTestId(`phone-navigation-${destination}`).tap();
    await expect(page.getByTestId("application-main")).toHaveAttribute("data-route", route);
    await expect(page.getByTestId(`phone-navigation-${destination}`)).toHaveAttribute("aria-current", "page");
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
    if (destination === "council-decisions")
      await page.screenshot({ path: testInfo.outputPath("phone-more.png"), animations: "disabled" });
    await sheet.getByTestId(`phone-more-${destination}`).tap();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId("application-main")).toHaveAttribute("data-route", new RegExp(`^${route}(/|$)`));
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
test("phone form can be completed and submitted without horizontal overflow", async ({ appPage: page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/app/contacts");
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
    await page.getByTestId("phone-document-actions").click();
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
