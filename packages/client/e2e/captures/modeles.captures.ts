import type { Page } from "@playwright/test";
import { capture, expect, test, waitForPageEntrance } from "./fixtures";

/** The document templates of Alésia: the list and the meeting notice template with a logo in its header. */
test.use({ seedScenario: "default" });

const blason = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIklEQVR42mNkYPhfz0AEYBxVSF+FjP//ExXGqAqHVjEwhgAAiAgP8WOfu5gAAAAASUVORK5CYII=",
  "base64",
);

async function templates(page: Page) {
  const response = await page.request.get("/api/templates");
  expect(response.ok()).toBeTruthy();
  return ((await response.json()).entities as Array<{ properties: { id: string; documentType: string } }>).map(
    (entity) => entity.properties,
  );
}

// @verifies-requirement HALL-FR-DOC-580
test("modèles de documents : la liste et la convocation avec son logo", async ({ docsPage: page }) => {
  const notice = (await templates(page)).find((entry) => entry.documentType === "meeting-notice")!;
  await page.goto("/app/templates");
  await expect(page.getByTestId(`template-row-${notice.id}`)).toBeVisible();
  await waitForPageEntrance(page);
  await capture(page, "ecrans/modeles-de-documents");

  await page.getByTestId(`template-row-${notice.id}`).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("template-header-insert-image").click();
  await (await chooser).setFiles({ name: "blason.png", mimeType: "image/png", buffer: blason });
  await expect(page.getByTestId("template-header-source")).toHaveValue(/^<img src="data:image\/png/);
  await waitForPageEntrance(page);
  await capture(page, "ecrans/modele-de-document");
});
