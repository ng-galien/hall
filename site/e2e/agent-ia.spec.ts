import { expect, test } from "@playwright/test";

test("the public site stays non-technical and links the user guide", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByTestId("section-documentation")).toBeAttached();
  const text = (await page.locator("main").textContent()) ?? "";
  for (const term of [/\bMCP\b/, /\bHTTP\b/, /\bAPI\b/, /\bSiren\b/, /agent IA/, /\bstdio\b/]) {
    expect(text).not.toMatch(term);
  }
  await expect(page.getByTestId("documentation-link")).toContainText("Guide d’utilisation");
});

test("the rendered manual still documents the MCP assistant", async ({ page }) => {
  await page.goto("./documentation/index.html#/docs/assistant-ia");
  await expect(page.locator("h1")).toHaveText("Connecter un agent IA par MCP");
  await expect(page.locator("article")).toContainText("terminal privé");
  await expect(page.locator("article")).toContainText("22.12");
  await expect(page.locator("article")).toContainText("npm install --prefix");
  await expect(page.locator("article")).toContainText("aucun téléchargement public");
  await expect(page.getByTestId("docs-page-assistant-ia")).toBeVisible();
  await page.getByTestId("docs-search").fill("hall_learn");
  await page.getByTestId("docs-search-result-assistant-ia").click();
  await expect(page).toHaveURL(/#\/docs\/assistant-ia$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
