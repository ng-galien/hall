import { expect, request as requestFactory, test } from "@playwright/test";
import { clearTestDatabase, openMenuEntry } from "../fixtures/application";

// Each journey bootstraps the first administrator of an empty Hall.
test.beforeEach(() => clearTestDatabase());

test("edits account identity with autosave and safely changes and resets passwords with real sessions", async ({
  page,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("mairie.locale", "en"));
  const initialPassword = "Hall-account-initial!";
  const bootstrap = await page.request.post("/api/auth/bootstrap", {
    data: { displayName: "Account administrator", email: "account-admin@example.test", password: initialPassword },
  });
  expect(bootstrap.status()).toBe(201);
  const admin = (await bootstrap.json()).properties;
  const contactIds: string[] = [];
  for (const lastName of ["Initial", "Updated"]) {
    const response = await page.request.post("/api/contacts", {
      data: {
        firstName: "Contact",
        lastName,
        organizationName: null,
        jobTitle: null,
        email: null,
        mobilePhone: null,
        personalPhone: null,
        professionalPhone: null,
        notes: "",
      },
    });
    expect(response.status()).toBe(201);
    contactIds.push((await response.json()).properties.id);
  }
  const created = await page.request.post("/api/users", {
    data: {
      displayName: "Reader account",
      email: "account-reader@example.test",
      password: initialPassword,
      roles: ["contributor"],
      contactId: contactIds[0],
    },
  });
  expect(created.status()).toBe(201);
  const user = (await created.json()).properties;
  const readerSession = await requestFactory.newContext({ baseURL });
  expect(
    (await readerSession.post("/api/auth/login", { data: { email: user.email, password: initialPassword } })).status(),
  ).toBe(200);
  await page.goto(`/app/users/${user.id}`);
  await expect(page.getByTestId("user-display-name")).toHaveValue("Reader account");
  await page.getByTestId("user-display-name").fill("Updated reader account");
  await page.getByTestId("user-email").fill("account-reader-updated@example.test");
  await page.getByTestId("user-contact-select").click();
  await page
    .getByTestId("user-contact-select-search-result")
    .and(page.locator(`[data-reference-id="${contactIds[1]}"]`))
    .click();
  const flushed = page.waitForResponse(
    (response) => response.url().endsWith(`/users/${user.id}`) && response.request().method() === "PUT",
  );
  await openMenuEntry(page, "users");
  expect((await flushed).status()).toBe(200);
  await page.getByTestId(`user-open-${user.id}`).click();
  await expect(page.getByTestId("user-display-name")).toHaveValue("Updated reader account");
  await expect(page.getByTestId("user-email")).toHaveValue("account-reader-updated@example.test");
  await expect(page.getByTestId("user-contact-link")).toHaveAttribute("href", `/app/contacts/${contactIds[1]}`);
  await page.screenshot({ path: testInfo.outputPath("identity-edited.png") });
  await page.getByTestId("user-display-name").fill("");
  await openMenuEntry(page, "users");
  await expect(page.getByTestId("user-display-name-error")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/users/${user.id}$`));
  await page.getByTestId("user-display-name").fill("Updated reader account");
  const heldAddress = page.waitForResponse(
    (response) => response.url().endsWith(`/users/${user.id}`) && response.request().method() === "PUT",
  );
  await page.getByTestId("user-email").fill("account-admin@example.test");
  expect((await heldAddress).status()).toBe(409);
  await expect(page.getByTestId("user-email-error")).toHaveText("Address already used by another account.");
  await expect(page.locator(".error-banner")).toHaveCount(0);
  await expect(page.getByTestId("user-save-retry")).toHaveCount(0);
  await expect(page.getByTestId("user-email")).toHaveValue("account-admin@example.test");
  await page.getByTestId("user-email").fill("account-reader-updated@example.test");
  await expect(page.getByTestId("user-email-error")).toHaveCount(0);
  await expect(page.getByTestId("user-save-state")).toHaveText("Saved");
  const refusedSaves: string[] = [];
  const recordSave = (sent: import("@playwright/test").Request) => {
    if (sent.method() === "PUT" && sent.url().endsWith(`/users/${user.id}`)) refusedSaves.push(sent.url());
  };
  page.on("request", recordSave);
  await page.getByTestId("user-email").fill("account-reader-updated@");
  await expect(page.getByTestId("user-email-error")).toBeVisible();
  await openMenuEntry(page, "users");
  await expect(page).toHaveURL(new RegExp(`/users/${user.id}$`));
  await expect(page.getByTestId("user-email-error")).toBeVisible();
  await page.getByTestId("user-email").fill("account-reader-updated@example.test");
  await expect(page.getByTestId("user-email-error")).toHaveCount(0);
  page.off("request", recordSave);
  expect(refusedSaves).toEqual([]);
  await expect(page.getByTestId("user-save-state")).toHaveText("Saved");
  await page.getByTestId("user-reset-password").click();
  await page.getByTestId("password-new").fill("Hall-reader-reset!");
  await page.getByTestId("password-confirmation").fill("Hall-reader-mismatch!");
  await page.getByTestId("password-submit").click();
  await expect(page.getByTestId("password-mismatch")).toBeVisible();
  await expect(page.getByTestId("password-new")).toHaveValue("Hall-reader-reset!");
  await page.getByTestId("password-confirmation").fill("Hall-reader-reset!");
  await page.getByTestId("password-submit").click();
  await expect(page.getByTestId("password-reset-success")).toBeVisible();
  expect((await readerSession.get("/api/auth/session")).status()).toBe(401);
  expect(
    (
      await readerSession.post("/api/auth/login", {
        data: { email: "account-reader-updated@example.test", password: "Hall-reader-reset!" },
      })
    ).status(),
  ).toBe(200);
  await readerSession.dispose();
  await page.getByTestId("user-reset-password").click();
  await expect(page.getByTestId("password-new")).toHaveValue("");
  await page.keyboard.press("Escape");
  await page.getByTestId("navigation-settings").click();
  await page.getByTestId("settings-change-password").click();
  await page.getByTestId("password-current").fill("Hall-incorrect-current!");
  await page.getByTestId("password-new").fill("Hall-admin-changed!");
  await page.getByTestId("password-confirmation").fill("Hall-admin-changed!");
  await page.getByTestId("password-submit").click();
  await expect(page.getByTestId("password-dialog").getByRole("alert")).toHaveText("The current password is incorrect.");
  await expect(page.getByTestId("password-new")).toHaveValue("Hall-admin-changed!");
  await page.screenshot({ path: testInfo.outputPath("personal-password.png") });
  await page.getByTestId("password-current").fill(initialPassword);
  await page.getByTestId("password-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible();
  await page.getByTestId("auth-email").fill("account-admin@example.test");
  await page.getByTestId("auth-password").fill("Hall-admin-changed!");
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("settings-change-password")).toBeVisible();
  await page.goto(`/app/users/${admin.id}`);
  await page.getByTestId("user-reset-password").click();
  await page.getByTestId("password-new").fill("Hall-admin-reset!");
  await page.getByTestId("password-confirmation").fill("Hall-admin-reset!");
  await page.getByTestId("password-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible();
  await page.getByTestId("auth-email").fill("account-admin@example.test");
  await page.getByTestId("auth-password").fill("Hall-admin-reset!");
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("user-detail")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

// @verifies-requirement HALL-FR-USR-070
test("marks a hand-delivered password temporary and requires a different personal password before Hall access", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
  expect(
    (
      await page.request.post("/api/auth/bootstrap", {
        data: {
          displayName: "Administrateur",
          email: "temporary-admin@example.test",
          password: "Admin-password-2026!",
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto("/app/users");
  await page.getByTestId("users-add").click();
  await page.getByTestId("user-access-hand-delivered").check();
  await expect(page.getByTestId("passphrase-value")).toBeVisible();
  const phrase = (await page.getByTestId("passphrase-value").textContent())!.trim();
  await page.getByTestId("user-display-name").fill("Compte temporaire");
  await page.getByTestId("user-email").fill("temporary-person@example.test");
  await page.getByTestId("user-role-contributor").check();
  await page.getByTestId("user-temporary-password").check();
  await page.getByTestId("passphrase-handed-over").check();
  await page.getByTestId("user-create-submit").click();
  await expect(page.getByTestId("user-detail")).toBeVisible();
  await expect(page.getByTestId("user-temporary-password")).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath("temporary-password-account.png"), animations: "disabled" });
  const accountUrl = page.url();
  const recipient = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    const member = await recipient.newPage();
    await member.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
    await member.goto("/app/");
    await member.getByTestId("auth-email").fill("temporary-person@example.test");
    await member.getByTestId("auth-password").fill(phrase);
    await member.getByTestId("auth-submit").click();
    await expect(member.getByTestId("password-replacement-required")).toBeVisible();
    await expect(member.getByTestId("password-current")).toHaveCount(0);
    await expect(member.getByTestId("navigation-settings")).toHaveCount(0);
    expect((await member.request.get("/api/contacts")).status()).toBe(403);
    await member.reload();
    await expect(member.getByTestId("password-replacement-required")).toBeVisible();
    await member.screenshot({ path: testInfo.outputPath("temporary-password-required.png"), animations: "disabled" });
    await member.getByTestId("password-new").fill(phrase);
    await member.getByTestId("password-confirmation").fill(phrase);
    await member.getByTestId("password-submit").click();
    await expect(member.getByRole("alert")).toHaveText(
      "Le nouveau mot de passe doit être différent du mot de passe temporaire.",
    );
    const chosen = "Personal-password-2026!";
    await member.getByTestId("password-new").fill(chosen);
    await member.getByTestId("password-submit").click();
    await expect(member.getByTestId("password-mismatch")).toBeVisible();
    await member.getByTestId("password-confirmation").fill(chosen);
    await member.screenshot({ path: testInfo.outputPath("temporary-password-mobile.png"), animations: "disabled" });
    expect(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await member.getByTestId("password-submit").click();
    await expect(member.getByTestId("auth-email")).toBeVisible();
    await member.getByTestId("auth-email").fill("temporary-person@example.test");
    await member.getByTestId("auth-password").fill(phrase);
    await member.getByTestId("auth-submit").click();
    await expect(member.getByTestId("auth-error")).toBeVisible();
    await member.getByTestId("auth-password").fill(chosen);
    await member.getByTestId("auth-submit").click();
    await expect(member.getByTestId("phone-navigation-home")).toBeVisible();
    await expect(member.getByTestId("password-replacement-required")).toHaveCount(0);
    expect((await member.request.get("/api/contacts")).status()).toBe(200);
    await page.goto(accountUrl);
    await expect(page.getByTestId("user-temporary-password")).not.toBeChecked();
    const marked = page.waitForResponse(
      (response) => response.url().includes("/api/users/") && response.request().method() === "PUT",
    );
    await page.getByTestId("user-temporary-password").click();
    expect((await marked).status()).toBe(200);
    await expect(page.getByTestId("user-temporary-password")).toBeChecked();
    await member.reload();
    await expect(member.getByTestId("auth-email")).toBeVisible();
    await member.getByTestId("auth-email").fill("temporary-person@example.test");
    await member.getByTestId("auth-password").fill(chosen);
    await member.getByTestId("auth-submit").click();
    await expect(member.getByTestId("password-replacement-required")).toBeVisible();
    await member.getByTestId("password-replacement-logout").click();
    await expect(member.getByTestId("auth-email")).toBeVisible();
  } finally {
    await recipient.close();
  }
});

test("titles an unusable password link « Lien expiré » and offers a new link", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
  for (const token of ["jeton-inutilisable", "A".repeat(43)]) {
    await page.goto(`/app/password-link#${token}`);
    const screen = page.getByTestId("password-link");
    await expect(screen.getByTestId("password-link-unusable")).toHaveText(
      "Ce lien n’est plus utilisable. Demandez un nouveau lien.",
    );
    await expect(screen.getByTestId("password-link-title")).toHaveText("Lien expiré");
    await expect(screen.getByTestId("password-link-request-new")).toBeVisible();
  }
});

// @verifies-requirement HALL-FR-USR-090
test("writes the cause of an account email that was not sent beside its result, on the same line", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mairie.locale", "fr"));
  const bootstrap = await page.request.post("/api/auth/bootstrap", {
    data: { displayName: "Mail administrator", email: "mail-admin@example.test", password: "Hall-mail-initial!" },
  });
  expect(bootstrap.status()).toBe(201);
  const created = await page.request.post("/api/users", {
    data: {
      displayName: "Mail recipient",
      email: "mail-recipient@example.test",
      password: "Hall-mail-initial!",
      roles: ["contributor"],
      contactId: null,
    },
  });
  expect(created.status()).toBe(201);
  const user = (await created.json()).properties;
  await page.goto(`/app/users/${user.id}`);
  await page.getByTestId("user-send-password-link").click();
  const line = page.getByTestId("user-account-mail");
  await expect(line.getByTestId("user-account-mail-outcome")).toHaveAttribute("data-outcome", /^(failed|unknown)$/);
  const cause = line.getByTestId("user-account-mail-cause");
  await expect(cause).toBeVisible();
  await expect(cause).not.toHaveText(/_/);
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await expect(cause).toBeVisible();
    const outcome = await line.getByTestId("user-account-mail-outcome").boundingBox();
    const written = await cause.boundingBox();
    expect(outcome && written).toBeTruthy();
    if (!outcome || !written) continue;
    const middle = written.y + written.height / 2;
    expect(middle).toBeGreaterThan(outcome.y);
    expect(middle).toBeLessThan(outcome.y + outcome.height);
    expect(written.x).toBeGreaterThan(outcome.x);
  }
});
