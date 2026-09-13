import { expect, request as requestFactory, test } from "@playwright/test";

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
        phone: null,
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
      roles: ["reader"],
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
  await page.getByTestId("user-contact-select-search-result").and(page.locator(`[data-reference-id="${contactIds[1]}"]`)).click();
  const flushed = page.waitForResponse(
    (response) => response.url().endsWith(`/users/${user.id}`) && response.request().method() === "PUT",
  );
  await page.getByTestId("navigation-users").click();
  expect((await flushed).status()).toBe(200);
  await page.getByTestId(`user-open-${user.id}`).click();
  await expect(page.getByTestId("user-display-name")).toHaveValue("Updated reader account");
  await expect(page.getByTestId("user-email")).toHaveValue("account-reader-updated@example.test");
  await expect(page.getByTestId("user-contact-link")).toHaveAttribute("href", `/app/contacts/${contactIds[1]}`);
  await page.screenshot({ path: testInfo.outputPath("identity-edited.png") });
  await page.getByTestId("user-display-name").fill("");
  await page.getByTestId("navigation-users").click();
  await expect(page.getByTestId("user-identity-error")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/users/${user.id}$`));
  await page.getByTestId("user-display-name").fill("Updated reader account");
  await page.getByTestId("user-email").fill("account-admin@example.test");
  await expect(page.getByTestId("user-save-retry")).toBeVisible();
  await expect(page.getByTestId("user-email")).toHaveValue("account-admin@example.test");
  await page.getByTestId("user-email").fill("account-reader-updated@example.test");
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
