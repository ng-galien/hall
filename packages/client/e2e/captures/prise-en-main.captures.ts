import { capture, expect, test, waitForPageEntrance } from "./fixtures";

/** The getting-started guide: sign-in, overview, menu, quick search, and Hall on a phone. */
test.setTimeout(4 * 60_000);
test.use({ seedScenario: "default" });

test("prise en main de Hall", async ({ docsPage: page }) => {
  const journey = "prise-en-main";

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 401, contentType: "application/problem+json", body: '{"status":401}' }),
  );
  await page.reload();
  await expect(page.getByTestId("auth-submit")).toBeVisible();
  await capture(page, `${journey}/01-connexion`);
  await page.unroute("**/api/auth/session");

  await page.goto("/app/");
  await expect(page.getByTestId("application-sync-status")).toHaveAttribute("data-sync-state", "synchronized");
  await expect(page.getByText("Affaires en préparation").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await waitForPageEntrance(page);
  await capture(page, `${journey}/02-vue-d-ensemble`);

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

  // The development sign-in has no session to close: the session answer receives the actions of a signed-in account.
  await page.route("**/api/auth/session", async (route) => {
    const { "if-none-match": _cached, ...headers } = route.request().headers();
    const response = await route.fetch({ headers });
    const entity = (await response.json()) as { actions?: unknown[] };
    entity.actions = [
      ...(entity.actions ?? []),
      { name: "session.logout", method: "POST", href: "/api/auth/logout", type: "application/json" },
      { name: "session.change-password", method: "POST", href: "/api/auth/change-password", type: "application/json" },
    ];
    await route.fulfill({ response, body: JSON.stringify(entity) });
  });
  await page.goto("/app/settings");
  await expect(page.getByRole("heading", { name: "Paramètres" })).toBeVisible();
  await expect(page.getByTestId("settings-logout")).toBeVisible();
  await page.getByTestId("settings-logout").scrollIntoViewIfNeeded();
  await page.waitForLoadState("networkidle");
  await capture(page, `${journey}/05-parametres`);
  await page.unroute("**/api/auth/session");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/");
  await expect(page.getByText("Affaires en préparation").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await waitForPageEntrance(page);
  await capture(page, `${journey}/06-telephone`);

  await page.getByTestId("navigation-toggle").click();
  await expect(page.getByTestId("mobile-navigation")).toBeVisible();
  await page.waitForTimeout(500);
  await capture(page, `${journey}/07-telephone-menu`);
});
