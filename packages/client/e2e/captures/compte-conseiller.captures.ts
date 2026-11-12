import { capture, expect, switchAccount, test } from "./fixtures";

test.setTimeout(3 * 60_000);
test.use({ seedScenario: "preparation" });

test("compte et dossier personnel d’un conseiller", async ({ docsPage: page }) => {
  const journey = "compte-conseiller";
  // Accounts are created by the administrator; the secretariat follows the councillor's folder and term.
  await switchAccount(page, "administrateur");
  await page.goto("/app/users");
  await expect(page.getByTestId("users-collection")).toBeVisible();
  await capture(page, `${journey}/01-utilisateurs`);

  await page.getByTestId("users-add").click();

  await page.getByTestId("user-access-hand-delivered").check();
  await expect(page.getByTestId("user-create-form")).toBeVisible();
  await page.getByTestId("user-display-name").fill("Épasnactos l’Arverne");
  await page.getByTestId("user-email").fill("epasnactos@alesia.example");
  await page.getByTestId("user-role-councillor").check();
  await page.getByTestId("user-contact-select").click();
  await page.getByRole("option", { name: /Luctérios/ }).click();
  await page.getByTestId("passphrase-generate").click();
  await expect(page.getByTestId("passphrase-value")).toBeVisible();
  await page.getByTestId("passphrase-handed-over").check();
  await capture(page, `${journey}/02-creer-un-utilisateur`);
  await page.getByTestId("user-create-submit").click();
  await expect(page.getByTestId("user-detail")).toBeVisible();
  await capture(page, `${journey}/03-compte-cree`);
  const account = page.url();

  await switchAccount(page, "secretariat");
  await page.goto("/app/workspace");
  await page.waitForLoadState("networkidle");
  const personal = page.getByText("Espaces personnels").first();
  if (await personal.count()) await personal.click();
  await page.waitForTimeout(1000);
  await capture(page, `${journey}/04-espaces-personnels`);

  await page.goto("/app/council-members");
  await page
    .getByTestId(/^member-open-/)
    .first()
    .click();
  await expect(page.getByTestId("member-term-end")).toBeVisible();
  await capture(page, `${journey}/05-fin-de-mandat`);

  await switchAccount(page, "administrateur");
  await page.goto(account);
  await page.getByTestId("user-revoke-access").click();
  await expect(page.getByTestId("user-revoke-access-confirm")).toBeVisible();
  await capture(page, `${journey}/06-revoquer-l-acces`);
  await page.getByTestId("user-revoke-access-confirm").click();
  await expect(page.getByTestId("user-status")).toHaveText("Désactivé");
  await page.getByTestId("user-reactivate").click();
  await expect(page.getByTestId("user-reactivated")).toBeVisible();
  await capture(page, `${journey}/07-reactiver`);
  await page.getByTestId("passphrase-handed-over").check();
  await page.getByTestId("user-reactivated-close").click();
  await expect(page.getByTestId("user-status")).toHaveText("Actif");
});
