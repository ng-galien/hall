import { expect, test } from "../fixtures/application";

test.describe("navigation and settings", () => {
  test("loads every lazy route from the primary navigation", async ({ appPage: page }) => {
    const routes = [
      ["meetings", /\/app\/meetings$/, "Council meetings"],
      ["minutes", /\/app\/minutes$/, "Minutes"],
      ["council-decisions", /\/app\/council-decisions$/, "Council decisions"],
      ["workspace", /\/app\/workspace$/, null],
      ["contacts", /\/app\/contacts$/, "Contacts"],
      ["council-members", /\/app\/council-members$/, "Council composition"],
      ["council-committees", /\/app\/council-committees$/, null],
    ] as const;

    for (const [linkName, url, heading] of routes) {
      await page.getByTestId(`navigation-${linkName}`).click();
      await expect(page).toHaveURL(url);
      if (heading) await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }

    await page.getByTestId("navigation-settings").click();
    await expect(page).toHaveURL(/\/app\/settings$/);
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  });

  test("persists the selected interface language after a reload", async ({ appPage: page }) => {
    await page.getByTestId("navigation-settings").click();
    await page.getByTestId("settings-language").click();
    await page.getByTestId("settings-language-fr").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Paramètres", exact: true })).toBeVisible();
    await page.getByTestId("settings-language").click();
    await page.getByTestId("settings-language-en").click();

    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle("Mairie, municipal council");

    await page.reload();

    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByTestId("settings-language")).toContainText("English");
    await expect(page.getByTestId("navigation-meetings")).toHaveText("Meetings");
  });

  test("keeps authentication credentials out of application settings", async ({ appPage: page }) => {
    await page.getByTestId("navigation-settings").click();
    await expect(page.getByTestId("settings-language")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Appearance", exact: true })).toBeVisible();
    await expect(page.getByLabel("Access token", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save access", exact: true })).toHaveCount(0);
    await expect(page.getByText("Server access has been saved and verified.", { exact: true })).toHaveCount(0);
  });
});
