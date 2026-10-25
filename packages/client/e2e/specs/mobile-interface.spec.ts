import { expect, test } from "../fixtures/application";

test.use({ hasTouch: true });

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEElEQVR42mNk+M+ABzDhkAIAEwQCAiV7nNwAAAAASUVORK5CYII=",
  "base64",
);

// @verifies-requirement HALL-FR-LAY-010
test("phone navigation and sections fit the viewport and preserve desktop navigation", async ({
  appPage: page,
}, testInfo) => {
  test.setTimeout(60_000);
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/app/");
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
      if (width === 360 && destination === "contacts")
        await page.screenshot({ path: testInfo.outputPath("phone-menu.png"), animations: "disabled" });
      await menu.getByTestId(`navigation-${destination}`).tap();
      await expect(menu).toBeHidden();
      await expect(page.getByTestId("application-main")).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      if (width === 360 && ["contacts", "maps", "calendar"].includes(destination))
        await page.screenshot({ path: testInfo.outputPath(`phone-${destination}.png`), animations: "disabled" });
      await expect
        .poll(() =>
          page.getByTestId("application-main").evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        )
        .toBe(true);
    }
    await page.getByTestId("navigation-toggle").click();
    await page.getByTestId("mobile-navigation").getByTestId("dialog-close").click();
    await expect(page.getByTestId("mobile-navigation")).toBeHidden();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByTestId("navigation-workspace")).toBeVisible();
  await expect(page.getByTestId("mobile-navigation")).toHaveCount(0);
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
  await page.goto(url);
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
  await expect(page.getByTestId("editor-choose-image")).toHaveCount(0);
  await expect(page.getByTestId("editor-take-photo")).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});
