import { expect, test } from "@playwright/test";

test("presents MCP assistance and opens its rendered, searchable manual", async ({ page }) => {
  await page.goto("/#documentation");
  await expect(page.getByTestId("ai-presentation")).toContainText("Un agent IA connecté par MCP");
  await page.getByTestId("ai-guide-link").click();
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
