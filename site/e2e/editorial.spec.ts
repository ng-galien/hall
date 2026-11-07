import { expect, test } from "@playwright/test";

const stories = [
  "ouverture",
  "veille",
  "carte",
  "grenier",
  "ouvrages",
  "defense",
  "convocation",
  "appel",
  "rationnement",
  "motion",
  "actes",
] as const;
const modernNarrative =
  /\b(?:PDF|Outlook|Hall|IGN|tableur|téléphone|courriel|quorum|maire|commission|délibération)\b|procès-verbal|ordre du jour|document figé|\b425\b|\b120 sacs\b|quinaires|\d+ voix/i;

for (const view of ["plain", "3d"] as const) {
  test(`${view}: all eleven stories reserve software explanations for the captures`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`./demonstration/?view=${view}`);
    if (view === "3d") await expect(page.getByTestId("terrain-stage")).toHaveAttribute("data-ready", "true");
    for (const [index, id] of stories.entries()) {
      if (view === "3d") {
        if (index > 0) {
          const group = page.getByTestId(`menu-group-${index <= 5 ? "preparer" : "sieger"}`);
          if ((await group.getAttribute("aria-expanded")) !== "true") await group.click();
        }
        await page.getByTestId(`menu-item-${id}`).click();
      }
      const article = page.getByTestId(`scenario-${id}`);
      await expect(article).toBeVisible();
      const narrative = (await article.locator(".scenario-head, .scenario-lead, .steps").allTextContents()).join(" ");
      expect(narrative, id).not.toMatch(modernNarrative);
      await expect(article.locator(".scenario-feature")).toHaveCount(0);
      if (id !== "ouverture") {
        const scope = view === "plain" ? page.locator(`#lieu-${id}`) : article;
        const captions = await scope.locator(".captures figcaption").allTextContents();
        expect(captions.length, id).toBeGreaterThan(0);
        for (const caption of captions) {
          expect(caption, id).not.toMatch(/Dans Hall|envoi reste|ne vaut|contrôle de légalité/i);
          expect(caption.trim().length, id).toBeGreaterThan(0);
          expect(caption.trim().length, id).toBeLessThanOrEqual(80);
        }
      }
    }
    const opening = view === "plain" ? page.getByTestId("scenario-ouverture") : page.locator("body");
    await expect(opening).not.toContainText("Vercingétorix devient maire");
    await expect(page.getByTestId("scenario-actes").getByRole("heading")).toHaveText("La missive au proconsul");
  });
}
