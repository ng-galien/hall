import type { Page } from "@playwright/test";
import { expect, openAdministrationEntry, test } from "../fixtures/application";

test.use({ seedScenario: "minutes", builtInPdfViewer: true });

/* Modèles de documents: the templates Hall generates from, edited with an embedded logo, and the missing one created. */

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEElEQVR42mNk+M+ABzDhkAIAEwQCAiV7nNwAAAAASUVORK5CYII=",
  "base64",
);

interface Template {
  id: string;
  kind: string;
  documentType: string;
  name: string;
  bodyMarkdown: string;
  headerHtml: string;
}

async function templates(page: Page): Promise<Template[]> {
  const response = await page.request.get("/api/templates");
  expect(response.ok()).toBeTruthy();
  return ((await response.json()).entities as Array<{ properties: Template }>).map((entity) => entity.properties);
}

// @verifies-requirement HALL-FR-DOC-580
test("an editor changes a template's name, text and header with a logo, then finds them after a reload", async ({
  appPage: page,
}) => {
  test.setTimeout(90_000);
  const minutes = (await templates(page)).find((entry) => entry.documentType === "minutes")!;
  await openAdministrationEntry(page, "templates");
  await expect(page.getByTestId("templates-list")).toBeVisible();
  await expect(page.getByTestId(`template-row-${minutes.id}`)).toContainText("Minutes");
  await page.getByTestId(`template-row-${minutes.id}`).click();
  await expect(page.getByTestId("template-editor")).toBeVisible();

  await page.getByTestId("template-name").fill("Procès-verbal de la mairie");
  await page.getByTestId("template-header-source").fill("Mairie d’Alésia");
  const logo = page.waitForEvent("filechooser");
  await page.getByTestId("template-header-insert-image").click();
  await (await logo).setFiles({ name: "blason.png", mimeType: "image/png", buffer: png });
  await expect(page.getByTestId("template-header-source")).toHaveValue(/^!\[blason.png\]\(data:image\/png;base64,/);

  const body = page.getByTestId("template-body-editor");
  const source = await body.inputValue();
  const edited = `${source}\n\nTexte ajouté au modèle.\n\n::page-break\n\n## Deuxième page imposée\n`;
  await body.fill(edited);
  const desktopViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(body).toBeVisible();
  await expect(body).toHaveValue(edited);
  await page.setViewportSize(desktopViewport);

  await expect(page.getByTestId("template-unsaved")).toBeVisible();
  await page.getByTestId("template-save").click();
  await expect(page.getByTestId("template-saved")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("template-name")).toHaveValue("Procès-verbal de la mairie");
  await expect(page.getByTestId("template-header-source")).toHaveValue(/data:image\/png;base64,[\s\S]*Mairie d’Alésia/);
  await expect(page.getByTestId("template-body-editor")).toHaveValue(edited);
  const saved = (await templates(page)).find((entry) => entry.id === minutes.id)!;
  expect(saved.bodyMarkdown).toContain("Texte ajouté au modèle.");
  expect(saved.bodyMarkdown).toBe(edited);
  expect(saved.bodyMarkdown).toContain("{% for point in minutes.points %}");
  expect(saved.bodyMarkdown).not.toContain("::minutes");

  await page.getByTestId("template-preview").click();
  const frame = page.getByTestId("template-preview-frame");
  await expect(frame).toHaveAttribute("src", /\/api\/templates\/preview-pdf\//);
  const pdf = await page.request.get((await frame.getAttribute("src"))!);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

// @verifies-requirement HALL-FR-DOC-580
test("the missing template of a document type is created from its starting text, and only that type is offered", async ({
  appPage: page,
}) => {
  const decision = (await templates(page)).find((entry) => entry.documentType === "council-decision")!;
  expect((await page.request.delete(`/api/templates/${decision.id}`)).status()).toBe(204);
  await page.goto("/app/templates");
  await page.getByTestId("templates-add").click();
  await page.getByTestId("templates-add-type").click();
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.getByTestId("templates-add-type-council-decision").click();
  await page.getByTestId("templates-add-name").fill("Délibération de la mairie");
  await page.getByTestId("templates-add-submit").click();
  await expect(page).toHaveURL(/\/app\/templates\/[^/]+$/);
  await expect(page.getByTestId("template-name")).toHaveValue("Délibération de la mairie");
  const decisions = (await templates(page)).filter((entry) => entry.documentType === "council-decision");
  expect(decisions).toHaveLength(1);
  expect(decisions[0]!.bodyMarkdown).toContain("decision.facts");
  expect(decisions[0]!.bodyMarkdown).toContain("decision.content | markdown");
  expect(decisions[0]!.bodyMarkdown).not.toContain("::council-decision");

  await page.goto("/app/templates");
  await page.getByTestId("templates-add").click();
  await expect(page.getByTestId("templates-all-present")).toBeVisible();
});

// @verifies-requirement HALL-FR-DOC-580
test("without the update action a template reads without any way to change it", async ({ appPage: page }) => {
  const [first] = await templates(page);
  await page.route("**/api/templates**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    body.actions = [];
    for (const entity of body.entities ?? []) entity.actions = [];
    await route.fulfill({ response, body: JSON.stringify(body) });
  });
  await page.goto("/app/templates");
  await expect(page.getByTestId("templates-add")).toHaveCount(0);
  await page.goto(`/app/templates/${first!.id}`);
  await expect(page.getByTestId("template-name")).toHaveAttribute("readonly", "");
  await expect(page.getByTestId("template-save")).toHaveCount(0);
  await expect(page.getByTestId("template-header-insert-image")).toHaveCount(0);
});
