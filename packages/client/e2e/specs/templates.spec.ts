import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";

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
  await page.getByTestId("navigation-templates").click();
  await expect(page.getByTestId("templates-list")).toBeVisible();
  await expect(page.getByTestId(`template-row-${minutes.id}`)).toContainText("Minutes");
  await page.getByTestId(`template-row-${minutes.id}`).click();
  await expect(page.getByTestId("template-editor")).toBeVisible();

  await page.getByTestId("template-name").fill("Procès-verbal de la mairie");
  await page.getByTestId("template-header-source").fill('<div style="font-size:10px">Mairie d’Alésia</div>');
  const logo = page.waitForEvent("filechooser");
  await page.getByTestId("template-header-insert-image").click();
  await (await logo).setFiles({ name: "blason.png", mimeType: "image/png", buffer: png });
  await expect(page.getByTestId("template-header-source")).toHaveValue(/^<img src="data:image\/png;base64,/);

  const body = page.getByTestId("template-body");
  await body.getByTestId("editor-writing-area").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Texte ajouté au modèle.");
  const desktopViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  const bodyImage = page.waitForEvent("filechooser");
  await body.getByTestId("editor-choose-image").click();
  await (await bodyImage).setFiles({ name: "plan.png", mimeType: "image/png", buffer: png });
  await expect(body.locator(".editor-image-node")).toHaveCount(1);
  await page.setViewportSize(desktopViewport);

  await expect(page.getByTestId("template-unsaved")).toBeVisible();
  await page.getByTestId("template-save").click();
  await expect(page.getByTestId("template-saved")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("template-name")).toHaveValue("Procès-verbal de la mairie");
  await expect(page.getByTestId("template-header-source")).toHaveValue(/data:image\/png;base64,[\s\S]*Mairie d’Alésia/);
  await expect(page.getByTestId("template-body").locator(".editor-image-node")).toHaveCount(1);
  const saved = (await templates(page)).find((entry) => entry.id === minutes.id)!;
  expect(saved.bodyMarkdown).toContain("Texte ajouté au modèle.");
  expect(saved.bodyMarkdown).toMatch(/::image\[[^\]]*\]\{#[0-9a-f-]{36}/);
  expect(saved.bodyMarkdown.match(/::minutes\{section="?facts"?\}/g)).toHaveLength(1);
  expect(saved.bodyMarkdown.match(/::minutes\{section="?proceedings"?\}/g)).toHaveLength(1);

  await page.getByTestId("template-preview").click();
  const frame = page.frameLocator('[data-testid="template-preview-frame"]');
  await expect(frame.locator("header")).toContainText("Mairie d’Alésia");
  await expect(frame.locator('header img[src^="data:image/png"]')).toHaveCount(1);
  await expect(frame.locator("body")).toContainText("Texte ajouté au modèle.");
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
  expect(decisions[0]!.bodyMarkdown.match(/::council-decision/g)).toHaveLength(3);

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
