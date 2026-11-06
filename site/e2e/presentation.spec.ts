import { expect, test } from "@playwright/test";

/* Page de présentation : la gouttière montre les cinq lieux, et un clic sur un lieu mène à sa première sous-étape. */
test("la gouttière mène à la première sous-étape d’un lieu", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "telephone", "La gouttière est masquée sur téléphone.");
  await page.goto("./");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  /* La gouttière apparaît dès que le récit commence. */
  await page.evaluate(() =>
    window.scrollTo(0, (document.querySelector(".p-scroll") as HTMLElement).offsetHeight * 0.06),
  );
  await expect(page.getByTestId("gutter")).not.toHaveClass(/is-hidden/);
  for (let i = 0; i < 5; i++) await expect(page.getByTestId(`gutter-place-${i}`)).toBeVisible();
  await page.getByTestId("gutter-place-2").click();
  await expect(page.getByTestId("gutter-sub-assistant")).toHaveClass(/is-current/);
  await expect(page.getByTestId("step-panel-title")).toHaveText("Votre assistant IA, relié à vos dossiers");
  await page.getByTestId("gutter-place-3").click();
  await expect(page.getByTestId("gutter-sub-appel")).toHaveClass(/is-current/);
  await expect(page.getByTestId("step-panel-title")).toHaveText("Appel et quorum");
});

test("la page se charge et se lit sur téléphone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "telephone", "Parcours téléphone.");
  await page.goto("./");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.evaluate(() =>
    window.scrollTo(0, (document.querySelector(".p-scroll") as HTMLElement).offsetHeight * 0.2),
  );
  await expect(page.getByTestId("step-panel-title")).not.toHaveText("", { timeout: 15_000 });
});

/* Carte d'étape : la flèche d'ouverture lance le récit, les flèches de la carte passent d'une sous-étape à l'autre. */
test("la flèche d’ouverture et les flèches de la carte font avancer le récit", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  await page.getByTestId("story-start").click();
  await expect(page.getByTestId("step-panel-title")).toHaveText("Création de l'affaire", { timeout: 15_000 });
  await expect(page.getByTestId("step-card-previous")).toBeDisabled();
  await page.getByTestId("step-card-next").click();
  await expect(page.getByTestId("step-panel-title")).toHaveText("Devis et budget", { timeout: 15_000 });
  await page.getByTestId("step-card-previous").click();
  await expect(page.getByTestId("step-panel-title")).toHaveText("Création de l'affaire", { timeout: 15_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
