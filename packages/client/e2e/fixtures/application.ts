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

/**
 * Les sélecteurs ne sont plus des `<select>` natifs depuis le passage à shadcn : ce sont des
 * boutons qui ouvrent une liste en surimpression. `selectOption` ne s'y applique pas, il faut
 * ouvrir puis choisir l'option par son libellé.
 */
export async function chooseOption(trigger: Locator, optionLabel: string): Promise<void> {
  await trigger.click();
  await trigger.page().getByRole("option", { name: optionLabel, exact: true }).click();
  await expect(trigger).toContainText(optionLabel);
}

/**
 * Un contrôle de l'éditeur, désigné par son libellé.
 *
 * MDXEditor étiquette ses commandes tantôt par `aria-label`, tantôt par `title`, et ses bascules
 * sont des éléments de groupe (`role="radio"`) et non des boutons : viser l'attribut plutôt que le
 * rôle évite d'avoir à connaître le détail de chaque contrôle.
 */
export function editorControl(scope: Locator, label: string): Locator {
  return scope.locator(`[aria-label="${label}"], [title="${label}"]`);
}
