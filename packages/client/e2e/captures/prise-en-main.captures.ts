import { accounts, capture, demoPassword, expect, test, waitForPageEntrance } from "./fixtures";

/** The getting-started guide: sign-in, overview, menu, quick search, and Hall on a phone. */
test.setTimeout(4 * 60_000);
test.use({ seedScenario: "default" });

test("prise en main de Hall", async ({ docsPage: page }) => {
  const journey = "prise-en-main";

  // The secretariat signs out, then signs in again through the sign-in screen.
  await page.goto("/app/settings?category=preferences");
  await page.getByTestId("settings-logout").click();
  await expect(page.getByTestId("auth-submit")).toBeVisible();
  await capture(page, `${journey}/01-connexion`);
  await page.getByTestId("auth-email").fill(accounts.secretariat);
  await page.getByTestId("auth-password").fill(demoPassword);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("application-sync-status")).toHaveAttribute("data-sync-state", "synchronized");
  await page.goto("/app/");
  await expect(page.getByTestId("home-meeting")).toBeVisible();
  await expect(page.getByTestId(/^home-recent-document-/).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await waitForPageEntrance(page);
  await capture(page, `${journey}/02-vue-d-ensemble`);

  // The folders of Documents are listed under its entry of the menu once Documents is the current screen.
  await page.locator(".app-sidebar").getByTestId("navigation-workspace").click();
  await page.locator('[data-testid="workspace-sidebar-toggle"][data-path="Défense"]').click();
  await expect(page.locator('[data-testid="workspace-sidebar-link"][data-path^="Défense/"]').first()).toBeVisible();
  await page.locator('[data-testid="workspace-sidebar-link"][data-path="Défense"]').click();
  await expect(page.getByTestId("application-main").getByText("Défense du plateau").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await capture(page, `${journey}/03-menu-et-dossiers`);

  await page.keyboard.press("Control+K");
  await expect(page.getByTestId("search-palette")).toBeVisible();
  await page.getByTestId("palette-search-input").fill("grenier");
  await expect(page.getByTestId("search-palette").getByRole("option").first()).toBeVisible();
  await page.waitForTimeout(500);
  await capture(page, `${journey}/04-recherche-rapide`);
  await page.keyboard.press("Escape");

  await page.goto("/app/settings?category=preferences");
  await expect(page.getByRole("heading", { name: "Paramètres" })).toBeVisible();
  await expect(page.getByTestId("settings-logout")).toBeVisible();
  await page.getByTestId("settings-logout").scrollIntoViewIfNeeded();
  await page.waitForLoadState("networkidle");
  await capture(page, `${journey}/05-parametres`);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/");
  await expect(page.getByTestId("home-meeting")).toBeVisible();
  await expect(page.getByTestId(/^home-recent-document-/).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await waitForPageEntrance(page);
  await capture(page, `${journey}/06-telephone`);

  await page.getByTestId("phone-navigation-more").click();
  await expect(page.getByTestId("phone-more")).toBeVisible();
  await page.waitForTimeout(500);
  await capture(page, `${journey}/07-telephone-menu`);
});
