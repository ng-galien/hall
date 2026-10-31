import { expect, type Page, test } from "@playwright/test";

const proposals = ["assemblage", "relief", "trace"] as const;

function watchExternalRequests(page: Page): string[] {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol === "data:" || url.protocol === "blob:") return;
    if (url.hostname !== "127.0.0.1") external.push(request.url());
  });
  return external;
}

async function finalAt(page: Page, timeout: number): Promise<number> {
  await page.waitForFunction(() => document.documentElement.dataset.state === "final", undefined, {
    timeout,
    polling: 50,
  });
  return Number(await page.locator("html").getAttribute("data-final-at"));
}

async function expectFinalScreen(page: Page) {
  await expect(page.getByTestId("launch-name")).toHaveText("Hall");
  await expect(page.getByTestId("launch-name")).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId("launch-loader")).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId("launch-note")).toBeHidden();
  const brandOpacity = await page.getByTestId("launch-brand").evaluate((node) => getComputedStyle(node).opacity);
  expect(Number(brandOpacity)).toBe(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("écrans de lancement", () => {
  test("l'index liste les trois propositions", async ({ page }) => {
    const external = watchExternalRequests(page);
    await page.goto("./");
    for (const name of proposals) {
      await expect(page.getByTestId(`proposal-${name}`)).toBeVisible();
      await expect(page.getByTestId(`open-${name}`)).toHaveAttribute("href", `./${name}/`);
    }
    expect(external).toEqual([]);
  });

  for (const name of proposals) {
    test(`${name} : état final atteint entre quatre et dix secondes, sans réseau externe`, async ({ page }) => {
      const external = watchExternalRequests(page);
      await page.goto(`./${name}/`);
      await expect(page.locator("html")).toHaveAttribute("data-state", "playing");
      const reached = await finalAt(page, 10_000);
      expect(reached).toBeGreaterThanOrEqual(4_000);
      expect(reached).toBeLessThan(10_000);
      await expectFinalScreen(page);
      expect(external).toEqual([]);
    });

    test(`${name} : état final immédiat avec la réduction des animations`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const external = watchExternalRequests(page);
      await page.goto(`./${name}/`);
      const reached = await finalAt(page, 2_000);
      expect(reached).toBeLessThan(1_000);
      await expectFinalScreen(page);
      await page.waitForTimeout(1_500);
      await expect(page.locator("html")).toHaveAttribute("data-state", "final");
      expect(external).toEqual([]);
    });
  }
});
