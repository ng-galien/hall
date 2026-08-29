import { expect, primaryNavigationLink, test } from "../fixtures/application";

test.describe("navigation and settings", () => {
  test("loads every lazy route from the primary navigation", async ({ appPage: page }) => {
    const routes = [
      ["Séances", /\/app\/meetings$/, "Séances du conseil"],
      ["Délibérations", /\/app\/council-decisions$/, "Délibérations"],
      ["Espace de travail", /\/app\/workspace$/, null],
      ["Membres du conseil", /\/app\/council-members$/, "Composition du conseil"],
    ] as const;

    for (const [linkName, url, heading] of routes) {
      await primaryNavigationLink(page, linkName).click();
      await expect(page).toHaveURL(url);
      if (heading) await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }

    await page.getByRole("link", { name: "Paramètres de l’application", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/settings$/);
    await expect(page.getByRole("heading", { name: "Paramètres", exact: true })).toBeVisible();
  });

  test("persists the selected interface language after a reload", async ({ appPage: page }) => {
    await page.getByRole("link", { name: "Paramètres de l’application", exact: true }).click();
    await page.getByRole("combobox", { name: "Langue", exact: true }).click();
    await page.getByRole("option", { name: "Anglais", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle("Mairie, municipal council");

    await page.reload();

    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Language", exact: true })).toContainText("English");
    await expect(primaryNavigationLink(page, "Meetings")).toBeVisible();
  });

  test("keeps authentication credentials out of application settings", async ({ appPage: page }) => {
    await page.getByRole("link", { name: "Paramètres de l’application", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Langue", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Apparence", exact: true })).toBeVisible();
    await expect(page.getByLabel("Jeton d’accès", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Enregistrer l’accès", exact: true })).toHaveCount(0);
    await expect(page.getByText("L’accès au serveur a été enregistré et vérifié.", { exact: true })).toHaveCount(0);
  });
});
