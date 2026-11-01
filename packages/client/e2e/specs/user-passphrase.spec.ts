import { expect, request as requestFactory, test } from "@playwright/test";
import { clearTestDatabase } from "../fixtures/application";

// Each journey bootstraps the first administrator of an empty Hall.
test.beforeEach(() => clearTestDatabase());

// @verifies-requirement HALL-FR-USR-010
// @verifies-requirement HALL-FR-USR-020
test("creates an account with a generated passphrase shown once, then revokes its access", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
  const bootstrap = await page.request.post("/api/auth/bootstrap", {
    data: { displayName: "Administrateur", email: "passphrase-admin@example.test", password: "Hall-account-initial!" },
  });
  expect(bootstrap.status()).toBe(201);

  await page.setViewportSize({ width: 1498, height: 1314 });
  await page.goto("/app/users");
  const generation = page.waitForResponse(
    (response) => response.url().endsWith("/api/users/passphrases") && response.request().method() === "POST",
  );
  await page.getByTestId("users-add").click();
  expect((await generation).status()).toBe(200);
  await expect(page.getByTestId("passphrase-value")).toBeVisible();
  const tops = await page
    .locator('[data-testid="user-display-name"], [data-testid="user-email"], [data-testid="user-password"]')
    .evaluateAll((fields) => fields.map((field) => field.getBoundingClientRect().top));
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(1);
  await page.screenshot({ path: testInfo.outputPath("create-user-desktop.png"), animations: "disabled" });
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("user-password")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("create-user-mobile.png"), animations: "disabled" });
  await page.setViewportSize(viewport);
  await page.getByTestId("user-display-name").fill("Élue de test");
  await page.getByTestId("user-email").fill("elue@example.test");
  await page.getByTestId("user-role-contributor").check();
  const passphrase = (await page.getByTestId("passphrase-value").textContent())!.trim();
  expect(passphrase).toMatch(/^[a-z]{4,8}(-[a-z]{4,8}){4}$/);
  await expect(page.getByTestId("user-password")).toHaveValue(passphrase);
  await expect(page.getByTestId("user-create-submit")).toBeDisabled();
  await page.getByTestId("passphrase-copy").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(passphrase);
  await page.getByTestId("passphrase-handed-over").check();
  await page.getByTestId("user-create-submit").click();
  await expect(page).toHaveURL(/\/app\/users\/[^/]+$/);
  await expect(page.getByTestId("passphrase-value")).toHaveCount(0);
  await expect(page.getByText(passphrase)).toHaveCount(0);

  const elected = await requestFactory.newContext({ baseURL });
  expect(
    (await elected.post("/api/auth/login", { data: { email: "elue@example.test", password: passphrase } })).status(),
  ).toBe(200);
  expect((await elected.get("/api/auth/session")).status()).toBe(200);

  await page.getByTestId("user-revoke-access").click();
  await page.getByTestId("user-revoke-access-confirm").click();
  await expect(page.getByTestId("user-status")).toHaveValue("Désactivé");
  expect((await elected.get("/api/auth/session")).status()).toBe(401);
  expect(
    (await elected.post("/api/auth/login", { data: { email: "elue@example.test", password: passphrase } })).status(),
  ).toBe(401);

  await page.getByTestId("user-reactivate").click();
  await expect(page.getByTestId("user-reactivated")).toBeVisible();
  const renewed = (await page.getByTestId("passphrase-value").textContent())!.trim();
  expect(renewed).not.toBe(passphrase);
  await expect(page.getByTestId("user-reactivated-close")).toBeDisabled();
  await page.getByTestId("passphrase-handed-over").check();
  await page.getByTestId("user-reactivated-close").click();
  await expect(page.getByTestId("passphrase-value")).toHaveCount(0);
  await expect(page.getByTestId("user-status")).toHaveValue("Actif");
  expect(
    (await elected.post("/api/auth/login", { data: { email: "elue@example.test", password: renewed } })).status(),
  ).toBe(200);
  await elected.dispose();
});
