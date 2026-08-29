import type { Locator, Page } from "@playwright/test";
import { editorControl, expect, primaryNavigationLink, test } from "../fixtures/application";

/**
 * L'éditeur est central : il porte les rapports, les projets de délibération et les textes.
 * Ces tests remplacent la vérification manuelle qu'on refaisait à chaque changement.
 *
 * Ils s'appuient sur le seed de démonstration, qui contient un sujet outillé (« Éclairage public »)
 * avec des pièces jointes, et un texte contenant un tableau (« Bilan des subventions 2025 »).
 */

/** Le premier établi ouvert dans l'espace de travail. */
function inlineEditor(page: Page): Locator {
  return page.locator(".markdown-editor-compact").first();
}

function enrichedEditor(page: Page): Locator {
  return page.locator(".markdown-editor-large");
}

async function openWorkspaceItem(page: Page, itemTitle: string): Promise<void> {
  await primaryNavigationLink(page, "Espace de travail").click();
  await page.getByPlaceholder("Rechercher un sujet, un document, une séance…").fill(itemTitle);
  await page
    .getByRole("button", { name: new RegExp(itemTitle) })
    .first()
    .click();
}

async function openEnrichedEditor(page: Page): Promise<Locator> {
  await editorControl(inlineEditor(page), "Édition enrichie").click();
  const enriched = enrichedEditor(page);
  await expect(enriched).toBeVisible();
  return enriched;
}

test.describe("éditeur markdown", () => {
  test("n'expose en écriture rapide que le strict minimum, et le reste en édition enrichie", async ({
    appPage: page,
  }) => {
    await openWorkspaceItem(page, "Éclairage public");

    const inline = inlineEditor(page);
    // Quatre contrôles et pas un de plus : la barre en ligne ne doit pas dériver vers une barre complète.
    await expect(inline.locator('[role="toolbar"] button')).toHaveCount(4);
    for (const name of ["Gras", "Italique", "Liste à puces", "Édition enrichie"]) {
      await expect(editorControl(inline, name)).toBeVisible();
    }
    await expect(editorControl(inline, "Insérer un tableau")).toHaveCount(0);
    await expect(editorControl(inline, "Insérer un lien")).toHaveCount(0);

    const enriched = await openEnrichedEditor(page);
    for (const name of [
      "Annuler",
      "Rétablir",
      "Gras",
      "Italique",
      "Souligné",
      "Liste à puces",
      "Liste numérotée",
      "Insérer un lien",
      "Insérer un tableau",
      "Insérer une image",
      "Insérer une pièce",
    ]) {
      await expect(editorControl(enriched, name)).toBeVisible();
    }
  });

  /* DÉFAUT CONNU, non corrigé — ces deux tests l'encadrent précisément.
     Après avoir écrit dans la surimpression puis l'avoir fermée, l'éditeur en ligne continue
     d'afficher l'ancien texte. Les assertions intermédiaires montrent que le texte existe bien
     dans la surimpression et que le changement remonte jusqu'à l'établi (« Enregistrer »
     s'active), mais l'enregistrement ne retient pas la saisie.
     Deux pistes écartées : remonter l'éditeur par une `key` sur la valeur courante, et passer
     par `MDXEditorMethods.setMarkdown`, qui est pourtant la voie documentée.
     À reprendre : instrumenter `onChange` des deux instances pour voir laquelle gagne au retour. */
  test.fixme("insère un tableau, le remplit, et le conserve après enregistrement", async ({ appPage: page }) => {
    /* On vérifie notre intégration — plugin actif, sérialisation, persistance — et non la
       mécanique de manipulation des lignes et colonnes, qui appartient à MDXEditor. */
    await openWorkspaceItem(page, "Éclairage public");
    const enriched = await openEnrichedEditor(page);

    // Cliquer le paragraphe et non le conteneur : Lexical ne pose le curseur que dans le texte.
    await enriched.locator('[contenteditable="true"] p').first().click();
    await page.keyboard.press("End");
    await editorControl(enriched, "Insérer un tableau").click();

    const table = enriched.locator("table");
    await expect(table).toHaveCount(1);
    await expect(table.locator("tr").first().locator("th, td")).not.toHaveCount(0);

    const cellText = `Subvention ${Date.now()}`;
    await page.keyboard.type(cellText);
    await expect(table).toContainText(cellText);

    await page.getByRole("button", { name: "Fermer", exact: true }).click();
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await page.reload();
    await openWorkspaceItem(page, "Éclairage public");

    const persisted = inlineEditor(page).locator("table");
    await expect(persisted).toHaveCount(1);
    await expect(persisted).toContainText(cellText);
  });

  test("affiche un tableau existant comme un tableau, y compris en écriture rapide", async ({ appPage: page }) => {
    // Sans le plugin dans les deux modalités, le markdown s'afficherait en barres verticales.
    await openWorkspaceItem(page, "Bilan des subventions 2025");

    const table = inlineEditor(page).locator("table");
    await expect(table).toHaveCount(1);
    await expect(table).toContainText("Les Tilleuls");
    await expect(table).toContainText("2 400 €");
    await expect(inlineEditor(page)).not.toContainText("| --- |");
  });

  test("propose les pièces jointes du sujet et insère un lien vers celle qu'on choisit", async ({ appPage: page }) => {
    await openWorkspaceItem(page, "Éclairage public");
    const enriched = await openEnrichedEditor(page);
    await enriched.locator('[contenteditable="true"] p').first().click();

    await editorControl(enriched, "Insérer une pièce").click();
    const attachment = "Rapport — éclairage public tranche 2";
    // Seuls les documents sont proposés : une pièce de type texte n'est pas insérable comme lien.
    await expect(page.getByRole("menuitem", { name: "Note de cadrage — éclairage public" })).toHaveCount(0);
    await page.getByRole("menuitem", { name: attachment }).click();

    const link = enriched.getByRole("link", { name: attachment });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", /\/api\/resources\/[0-9a-f-]+/);
  });

  test.fixme("conserve le texte écrit en surimpression après enregistrement et rechargement", async ({
    appPage: page,
  }) => {
    // Le point le plus sensible : l'éditeur normalise le markdown, un aller-retour pourrait
    // réécrire ou perdre du contenu.
    await openWorkspaceItem(page, "Éclairage public");
    const marker = `Mention de contrôle ${Date.now()}`;

    const enriched = await openEnrichedEditor(page);
    await enriched.locator('[contenteditable="true"] p').first().click();
    await page.keyboard.press("End");
    await page.keyboard.type(` ${marker}`);
    // Le texte doit d'abord exister dans la surimpression elle-même.
    await expect(enriched).toContainText(marker);
    await page.getByRole("button", { name: "Fermer", exact: true }).click();

    // Puis remonter jusqu'à l'établi : le bouton d'enregistrement s'active.
    await expect(page.getByRole("button", { name: "Enregistrer", exact: true })).toBeEnabled();
    // Et se voir dans l'éditeur en ligne, qui se remonte sur la valeur courante.
    await expect(inlineEditor(page)).toContainText(marker);

    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await page.reload();
    await openWorkspaceItem(page, "Éclairage public");

    await expect(inlineEditor(page)).toContainText(marker);
    // Le texte d'origine n'a pas été emporté par la normalisation.
    await expect(inlineEditor(page)).toContainText("tranche 2 couvre le centre-bourg");
  });
});
