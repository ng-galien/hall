import { expect, primaryNavigationLink, test } from "../fixtures/application";

test.describe("navigation and settings", () => {
  test("loads every lazy route from the primary navigation", async ({ appPage: page }) => {
    const loadedModules: string[] = [];
    page.on("response", (response) => loadedModules.push(response.url()));

    const routes = [
      ["Séances", /\/app\/meetings$/, "Séances du conseil", "CouncilMeetingsPage.tsx"],
      ["Délibérations", /\/app\/council-decisions$/, "Délibérations", "CouncilDecisionsPage.tsx"],
      ["Dossiers", /\/app\/case-files$/, "Dossiers préparatoires", "CaseFilesPage.tsx"],
      ["Documents", /\/app\/documents$/, "Documents", "DocumentsPage.tsx"],
      ["Membres du conseil", /\/app\/council-members$/, "Composition du conseil", "CouncilMembersPage.tsx"],
    ] as const;

    for (const [linkName, url, heading, moduleName] of routes) {
      await primaryNavigationLink(page, linkName).click();
      await expect(page).toHaveURL(url);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      expect(loadedModules.some((loadedUrl) => loadedUrl.includes(moduleName))).toBe(true);
    }

    await page.getByRole("link", { name: "Paramètres de l’application", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/settings$/);
    await expect(page.getByRole("heading", { name: "Paramètres", exact: true })).toBeVisible();
    expect(loadedModules.some((loadedUrl) => loadedUrl.includes("SettingsPage.tsx"))).toBe(true);
  });

  test("persists the selected interface language after a reload", async ({ appPage: page }) => {
    await page.getByRole("link", { name: "Paramètres de l’application", exact: true }).click();
    await page.getByLabel("Langue", { exact: true }).selectOption("en");

    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle("Mairie — Municipal council");

    await page.reload();

    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByLabel("Language", { exact: true })).toHaveValue("en");
    await expect(primaryNavigationLink(page, "Meetings")).toBeVisible();
  });

  test("reports an invalid server token without displaying a false success", async ({ appPage: page }) => {
    await page.getByRole("link", { name: "Paramètres de l’application", exact: true }).click();
    await page.getByLabel("Jeton d’accès", { exact: true }).fill("invalid-token");
    await page.getByRole("button", { name: "Enregistrer l’accès", exact: true }).click();

    await expect(page.getByRole("alert")).toHaveText("Une authentification est nécessaire pour accéder à ce serveur.");
    await expect(page.getByText("Authentification nécessaire", { exact: true })).toBeVisible();
    await expect(page.getByText("L’accès au serveur a été enregistré et vérifié.", { exact: true })).toHaveCount(0);
  });
});
