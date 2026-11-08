import { expect, test } from "@playwright/test";

test("discover opens Alésia through the same scene navigation", async ({ page }, testInfo) => {
  await page.goto("./demonstration/?view=3d");
  await expect(page.getByTestId("terrain-stage")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("intro-discover")).toHaveCSS("opacity", "1", { timeout: 15_000 });
  await expect(page.getByTestId("battle-intro-gaul")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("alesia-entry.png") });
  await page.getByTestId("intro-discover").click();
  await expect(page.getByTestId("scenario-ouverture")).toBeVisible();
  await expect(page).toHaveURL(/#ouverture$/);
  await expect(page.getByTestId("menu-item-ouverture")).toHaveAttribute("aria-current", "step");
});

test("returning from stories restores the current battle introduction", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./#en-savoir-plus");
  await page.getByTestId("nav-demonstration").click();
  const stage = page.getByTestId("terrain-stage");
  await expect(stage).toHaveAttribute("data-intro", "ready");
  for (const id of ["veille", "ouvrages"]) {
    await page.getByTestId("menu-group-preparer").click();
    await page.getByTestId(`menu-item-${id}`).click();
    await expect(page.getByTestId(`scenario-${id}`)).toBeVisible();
    await expect(stage).toHaveAttribute("data-intro", "off");
    await page.getByTestId("nav-demonstration").click();
    await expect(page.getByTestId("scenario-panel")).toBeHidden();
    await expect(stage).toHaveAttribute("data-intro", "ready");
    await expect(page.getByTestId("battle-intro-copy")).toBeVisible();
    await expect(page.getByTestId("battle-intro-roman")).toBeVisible();
    await expect(page.getByTestId("battle-intro-gaul")).toBeVisible();
    await expect(page.getByTestId("intro-discover")).toHaveCSS("opacity", "1");
  }
  await page.getByTestId("intro-discover").click();
  await expect(page.getByTestId("scenario-ouverture")).toBeVisible();
  await page.getByTestId("nav-telecharger").click();
  await expect(page.getByTestId("section-telecharger")).toBeInViewport();
  await page.getByTestId("nav-demonstration").click();
  await expect(stage).toHaveAttribute("data-intro", "ready");
  await expect(page.getByTestId("intro-discover")).toBeInViewport();
});

test("the demonstration header contains its controls and keeps content below", async ({ page }) => {
  await page.goto("./demonstration/");
  await expect(page.getByTestId("menu-group-preparer")).toBeVisible();
  for (const width of [320, 360, 390, 768, 820, 1024, 1180, 1280, 1300, 1440, 1600]) {
    await page.setViewportSize({ width, height: 913 });
    for (const id of ["menu-item-ouverture", "menu-group-preparer", "menu-group-sieger"])
      await expect(page.getByTestId(id).locator(".discovery-icon svg")).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect
      .poll(() =>
        page.getByTestId("site-header").evaluate((header) => {
          const box = header.getBoundingClientRect();
          const controls = [...header.querySelectorAll("a, button")]
            .filter((node) => node.getClientRects().length)
            .map((node) => node.getBoundingClientRect());
          const centers = controls.map((control) => control.top + control.height / 2);
          return (
            Math.max(...centers) - Math.min(...centers) <= 3 &&
            controls.every(
              (control) =>
                control.top >= box.top - 1 &&
                control.bottom <= box.bottom + 1 &&
                control.left >= box.left - 1 &&
                control.right <= box.right + 1,
            )
          );
        }),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.getByTestId("intro").evaluate((intro) => {
          const header = document.querySelector('[data-testid="site-header"]');
          return intro.getBoundingClientRect().top + window.scrollY >= (header?.getBoundingClientRect().height ?? 0);
        }),
      )
      .toBe(true);
  }
  await page.setViewportSize({ width: 820, height: 913 });
  await page.getByTestId("menu-group-preparer").click();
  await page.getByTestId("menu-item-veille").click();
  await expect(page.getByTestId("scenario-panel")).toBeVisible();
  await expect
    .poll(() =>
      page.getByTestId("scenario-panel").evaluate((panel) => {
        const header = document.querySelector('[data-testid="site-header"]');
        return panel.getBoundingClientRect().top >= (header?.getBoundingClientRect().bottom ?? 0);
      }),
    )
    .toBe(true);
  await page.getByTestId("nav-telecharger").click();
  await expect(page.getByTestId("section-telecharger")).toBeInViewport();
});

test("section links keep the address and browser history aligned", async ({ page, context }) => {
  await page.goto("./demonstration/");
  await page.getByTestId("nav-fonctionnalites").click();
  await expect(page).toHaveURL(/#en-savoir-plus$/);
  const current = (name: string) => expect(page.getByTestId(`nav-${name}`)).toHaveAttribute("aria-current", "page");
  await current("fonctionnalites");
  await page.getByTestId("nav-parcours").click();
  await expect(page).toHaveURL(/#haut$/);
  await current("parcours");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.goBack();
  await expect(page).toHaveURL(/#en-savoir-plus$/);
  await current("fonctionnalites");
  await page.goForward();
  await expect(page).toHaveURL(/#haut$/);
  await current("parcours");
  await page.getByTestId("nav-fonctionnalites").click();
  await expect(page).toHaveURL(/#en-savoir-plus$/);
  await current("fonctionnalites");
  const copied = await context.newPage();
  await copied.goto(page.url());
  await expect(copied.getByTestId("nav-fonctionnalites")).toHaveAttribute("aria-current", "page");
  await copied.close();
  await page.reload();
  await current("fonctionnalites");
  await page.getByTestId("nav-parcours").click();
  await expect(page).toHaveURL(/#haut$/);
  await page.reload();
  await current("parcours");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
