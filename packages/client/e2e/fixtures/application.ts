import { test as base, expect, type Page } from "@playwright/test";

interface ApplicationFixtures {
  appPage: Page;
}

export const test = base.extend<ApplicationFixtures>({
  appPage: async ({ page }, use) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      if (!localStorage.getItem("mairie.locale")) localStorage.setItem("mairie.locale", "en");
    });
    await page.goto("/app/");
    const synchronizationStatus = page.getByTestId("application-sync-status");
    await expect(synchronizationStatus).toHaveAttribute("data-sync-state", "synchronized");
    await use(page);
    expect(pageErrors, "The application must not emit uncaught browser errors").toEqual([]);
  },
});

export { expect };
