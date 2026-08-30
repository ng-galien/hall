import type { Page } from "@playwright/test";
import { expect, formField, primaryNavigationLink, test } from "../fixtures/application";

function openDialog(page: Page) {
  return page.getByRole("dialog");
}

async function createMember(
  page: Page,
  firstName: string,
  lastName: string,
  role: "mayor" | "deputyMayor" | "councillor",
) {
  await page.getByRole("button", { name: "Ajouter un membre", exact: true }).click();
  const dialog = openDialog(page);
  await formField(dialog, "firstName").fill(firstName);
  await formField(dialog, "lastName").fill(lastName);
  await formField(dialog, "role").selectOption(role);
  await formField(dialog, "termStartedOn").fill("2026-03-15");
  await dialog.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(`${firstName} ${lastName}`, { exact: true })).toBeVisible();
}

test.describe("municipal council workflow", () => {
  test("keeps one council business mutation pending and ignores duplicate submissions", async ({ appPage: page }) => {
    await primaryNavigationLink(page, "Espace de travail").click();
    await page.getByRole("button", { name: "Nouveau", exact: true }).click();
    await page.getByTestId("workspace-create-business").click();
    const dialog = openDialog(page);
    await formField(dialog, "title").fill("Sujet soumis une seule fois");

    let postCount = 0;
    await page.route("**/api/council-business", async (route) => {
      if (route.request().method() === "POST") {
        postCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      await route.continue();
    });

    const form = dialog.locator("form");
    await dialog.getByRole("button", { name: "Créer", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Enregistrement…", exact: true })).toBeDisabled();
    await form.evaluate((element) => {
      element.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    await expect(page.getByRole("heading", { name: "Sujet soumis une seule fois", exact: true })).toBeVisible();
    expect(postCount).toBe(1);
  });

  test("prepares council business, conducts the live meeting, and records the ballot", async ({ appPage: page }) => {
    await primaryNavigationLink(page, "Membres du conseil").click();
    await createMember(page, "Camille", "Martin", "mayor");
    await createMember(page, "Jules", "Bernard", "councillor");

    await primaryNavigationLink(page, "Espace de travail").click();
    await page.getByRole("button", { name: "Nouveau", exact: true }).click();
    await page.getByTestId("workspace-create-business").click();
    const businessDialog = openDialog(page);
    await formField(businessDialog, "title").fill("Adoption du programme de rénovation");
    await businessDialog.getByRole("button", { name: "Créer", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Adoption du programme de rénovation", exact: true })).toBeVisible();

    await primaryNavigationLink(page, "Séances").click();
    await page.getByRole("button", { name: "Planifier une séance", exact: true }).click();
    const meetingDialog = openDialog(page);
    await formField(meetingDialog, "startsAt").fill("2026-09-01T18:30");
    await formField(meetingDialog, "secretaryMemberId").selectOption({ label: "Jules Bernard" });
    await expect(formField(meetingDialog, "chairMemberId")).toHaveValue(/.+/);
    await meetingDialog.getByRole("button", { name: "Créer", exact: true }).click();
    await page.getByRole("link", { name: /Conseil municipal .*01\/09\/2026/ }).click();

    await page
      .getByRole("listitem")
      .filter({ hasText: "Adoption du programme de rénovation" })
      .getByRole("button", { name: "Inscrire", exact: true })
      .click();
    await expect(page.locator(".composer-list")).toContainText("Adoption du programme de rénovation");
    const quickAdd = page.locator(".composer-quick-add");
    await quickAdd.getByRole("combobox").selectOption("openQuestion");
    await formField(quickAdd, "title").fill("Questions diverses");
    await quickAdd.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(page.locator(".composer-list")).toContainText("Questions diverses");

    await page.getByRole("button", { name: "Figer la composition et programmer", exact: true }).click();
    await page.getByRole("link", { name: "Passer en mode séance", exact: true }).click();

    await page.getByRole("button", { name: "Tout marquer présent", exact: true }).click();
    const openMeetingAction = page.getByRole("button", {
      name: "Constater le quorum et ouvrir la séance",
      exact: true,
    });
    await expect(openMeetingAction).toBeEnabled();
    await openMeetingAction.click();

    await page.getByRole("button", { name: "Démarrer ce sujet", exact: true }).click();
    await page.getByRole("button", { name: "Passer au vote", exact: true }).click();
    await page.getByRole("button", { name: "Tous les restants votent pour", exact: true }).click();
    await expect(page.getByText("Tous les votes sont pointés.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Enregistrer le résultat", exact: true }).click();
    await expect(page.locator(".conduct-result")).toContainText("Adoptée");

    await page.getByRole("button", { name: "Clôturer et passer au sujet suivant", exact: true }).click();
    await page.getByRole("button", { name: "Démarrer ce sujet", exact: true }).click();
    await page.getByRole("button", { name: "Passer au vote", exact: true }).click();
    await page.getByRole("button", { name: "Tous les restants votent pour", exact: true }).click();
    await page.getByRole("button", { name: "Enregistrer le résultat", exact: true }).click();
    await expect(page.locator(".conduct-result")).toContainText("Adoptée");
    await page.getByRole("button", { name: "Clôturer et passer au sujet suivant", exact: true }).click();
    await page.getByRole("button", { name: "Démarrer ce sujet", exact: true }).click();
    await page.getByRole("button", { name: "Clôturer et passer au sujet suivant", exact: true }).click();

    await page.getByRole("button", { name: "Clore la séance", exact: true }).click();
    await page.getByRole("button", { name: "Confirmer la clôture de la séance", exact: true }).click();
    await page.getByRole("link", { name: "Consulter le déroulé de la séance", exact: true }).click();

    await expect(page.getByText("Finaliser les actes", { exact: true })).toBeVisible();
    const report = page.locator(".report-timeline");
    await expect(report).toContainText("Adoption du programme de rénovation");
    await expect(report).toContainText("Adoptée");
    await expect(report).toContainText("Camille Martin");
  });

  test("records a quorum failure and reconvenes the meeting from the roll call", async ({ appPage: page }) => {
    await primaryNavigationLink(page, "Membres du conseil").click();
    await createMember(page, "Anne", "Petit", "mayor");
    await createMember(page, "Louis", "Roche", "councillor");

    await primaryNavigationLink(page, "Séances").click();
    await page.getByRole("button", { name: "Planifier une séance", exact: true }).click();
    const meetingDialog = openDialog(page);
    await formField(meetingDialog, "startsAt").fill("2026-08-30T18:30");
    await formField(meetingDialog, "chairMemberId").selectOption({ label: "Anne Petit" });
    await formField(meetingDialog, "secretaryMemberId").selectOption({ label: "Louis Roche" });
    await meetingDialog.getByRole("button", { name: "Créer", exact: true }).click();
    await page.getByRole("link", { name: /Conseil municipal .*30\/08\/2026/ }).click();

    await page.getByRole("button", { name: "Figer la composition et programmer", exact: true }).click();
    await page.getByRole("link", { name: "Passer en mode séance", exact: true }).click();

    const anneTile = page.locator(".rollcall-tile", { hasText: "Anne Petit" });
    await anneTile.getByRole("button", { name: "Présent", exact: true }).click();
    const louisTile = page.locator(".rollcall-tile", { hasText: "Louis Roche" });
    await louisTile.getByRole("button", { name: "Absent", exact: true }).click();

    await page.getByRole("button", { name: "Constater l’absence de quorum", exact: true }).click();
    await expect(page.getByText("L’absence de quorum a été formellement constatée.", { exact: true })).toBeVisible();

    await formField(page.locator(".rollcall-reconvene"), "startsAt").fill("2026-08-31T18:30");
    await page.getByRole("button", { name: "Créer la seconde convocation", exact: true }).click();

    await expect(page).toHaveURL(/\/app\/meetings\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: /Conseil municipal .*31\/08\/2026/ })).toBeVisible();
    await expect(
      page.getByText("L’ordre du jour de cette séance ne peut plus être modifié.", { exact: true }),
    ).toBeVisible();
  });
});
