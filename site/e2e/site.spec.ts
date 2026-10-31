import { expect, type Page, test } from "@playwright/test";

const places = ["mairie", "conseil", "place", "ecole", "territoire"] as const;
const releases = "https://github.com/ng-galien/hall/releases";
const documentation = "https://github.com/ng-galien/hall/tree/main/packages/client/src/docs/content/fr";

async function expectCapturesLoaded(page: Page, scope: string) {
  const images = page.locator(`${scope} img`);
  const count = await images.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const image = images.nth(i);
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0);
  }
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectLinks(page: Page) {
  await expect(page.getByTestId("download-link")).toHaveAttribute("href", releases);
  await expect(page.getByTestId("documentation-link")).toHaveAttribute("href", documentation);
  await expect(page.getByTestId("footer-download-link")).toHaveAttribute("href", releases);
  await expect(page.getByTestId("footer-documentation-link")).toHaveAttribute("href", documentation);
}

test.describe("commune en 3D", () => {
  test("chaque lieu ouvre son scénario avec ses captures de Hall", async ({ page }) => {
    await page.goto("./");
    await expect(page.locator("html")).toHaveAttribute("data-view", "town");
    await expect(page.getByTestId("town-stage")).toHaveAttribute("data-ready", "true");
    const canvas = page.getByTestId("town-canvas");
    await expect(canvas).toBeVisible();
    expect(await canvas.evaluate((c: HTMLCanvasElement) => c.width > 0 && c.height > 0)).toBe(true);
    await expectLinks(page);
    await expectNoHorizontalScroll(page);

    for (const place of places) {
      await page.getByTestId(`place-${place}`).click();
      await expect(page.getByTestId("scenario-panel")).toBeVisible();
      await expect(page.getByTestId(`scenario-${place}`)).toBeVisible();
      await expect(page.getByTestId(`place-${place}`)).toHaveAttribute("aria-pressed", "true");
      await expectCapturesLoaded(page, `[data-testid="scenario-${place}"]`);
      await expectNoHorizontalScroll(page);
      await page.getByTestId("scenario-close").click();
      await expect(page.getByTestId("scenario-panel")).toBeHidden();
    }
  });

  test("un clic sur la mairie dans la scène ouvre son scénario", async ({ page }) => {
    await page.goto("./");
    await expect(page.getByTestId("town-stage")).toHaveAttribute("data-ready", "true");
    await page.waitForTimeout(1500);
    const label = page.getByTestId("town-label-mairie");
    const x = Number(await label.getAttribute("data-hit-x"));
    const y = Number(await label.getAttribute("data-hit-y"));
    const box = await page.getByTestId("town-stage").boundingBox();
    if (!box) throw new Error("Scène absente");
    await page.mouse.click(box.x + x, box.y + y);
    await expect(page.getByTestId("scenario-mairie")).toBeVisible();
  });
});

test.describe("version sans 3D", () => {
  test("préférence pour moins de mouvement", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("./");
    await expect(page.locator("html")).toHaveAttribute("data-view", "plain");
    await expect(page.getByTestId("town-canvas")).toHaveCount(0);
    await expect(page.getByTestId("view-switch")).toBeVisible();
    await expectLinks(page);
    for (const place of places) {
      await expect(page.getByTestId(`scenario-${place}`)).toBeVisible();
      await expectCapturesLoaded(page, `#lieu-${place}`);
    }
    await expectNoHorizontalScroll(page);
  });

  test("appareil sans WebGL", async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type.startsWith("webgl")) return null;
        return (original as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await page.goto("./");
    await expect(page.locator("html")).toHaveAttribute("data-view", "plain");
    await expect(page.getByTestId("town-canvas")).toHaveCount(0);
    await expect(page.getByTestId("plain-notice")).toBeVisible();
    await expect(page.getByTestId("view-switch")).toHaveCount(0);
    await expectLinks(page);
    for (const place of places) {
      await page.getByTestId(`plain-link-${place}`).click();
      await expect(page.getByTestId(`scenario-${place}`)).toBeInViewport();
      await expectCapturesLoaded(page, `#lieu-${place}`);
    }
    await expectNoHorizontalScroll(page);
  });
});
