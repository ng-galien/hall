import { test as base, expect, type Locator, type Page } from "@playwright/test";

interface ApplicationFixtures {
  appPage: Page;
}

export const test = base.extend<ApplicationFixtures>({
  appPage: async ({ page }, use) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      if (!localStorage.getItem("mairie.locale")) localStorage.setItem("mairie.locale", "fr");
    });
    await page.goto("/app/");
    const synchronizationStatus = page.getByRole("status").filter({ hasText: "Serveur connecté" });
    await expect(synchronizationStatus).toHaveAttribute("data-sync-state", "synchronized");
    await use(page);
    expect(pageErrors, "The application must not emit uncaught browser errors").toEqual([]);
  },
});

export { expect };

export function formWithHeading(page: Page, heading: string): Locator {
  return page.locator("form", { hasText: heading });
}

export function formField(form: Locator, name: string): Locator {
  return form.locator(`[name="${name}"]`);
}

export function primaryNavigationLink(page: Page, name: string): Locator {
  return page.locator("aside").getByRole("link", { name: new RegExp(`^${name}(?:\\s|$)`) });
}
