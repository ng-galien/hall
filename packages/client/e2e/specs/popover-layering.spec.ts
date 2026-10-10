import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";

/** Every sampled point of the overlap between the floating element and the editor belongs to the floating element. */
async function expectOnTopOf(page: Page, floating: Locator, covered: Locator) {
  const top = await floating.boundingBox();
  const below = await covered.boundingBox();
  if (!top || !below) throw new Error("Both elements must be rendered");
  const left = Math.max(top.x, below.x);
  const right = Math.min(top.x + top.width, below.x + below.width);
  const upper = Math.max(top.y, below.y);
  const lower = Math.min(top.y + top.height, below.y + below.height);
  expect(right - left, "The floating element must overlap the editor horizontally").toBeGreaterThan(20);
  expect(lower - upper, "The floating element must overlap the editor vertically").toBeGreaterThan(20);
  const points = [0.1, 0.5, 0.9].flatMap((x) =>
    [0.1, 0.5, 0.9].map((y) => ({ x: left + (right - left) * x, y: upper + (lower - upper) * y })),
  );
  const handle = await floating.elementHandle();
  const results = await page.evaluate(
    ({ element, samples }) =>
      samples.map(({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return Boolean(hit && element?.contains(hit));
      }),
    { element: handle, samples: points },
  );
  expect(results).toEqual(points.map(() => true));
}

// @verifies-requirement HALL-TR-LAY-010
// @verifies-requirement HALL-FR-SRC-040
test("the document picker and the editor menu open above an open subject editor, with readable rows", async ({
  appPage: page,
}) => {
  const marker = crypto.randomUUID().slice(0, 8);
  const created = await page.request.post("/api/council-business", {
    data: { path: "seed", name: `Layering ${marker}`, reportName: "Report", reportContent: "Rapport court." },
  });
  expect(created.ok()).toBeTruthy();
  const business = (await created.json()).properties as { id: string };
  const subjectContent = Array.from(
    { length: 14 },
    (_, index) => `Paragraphe ${index + 1} de la question, rédigé pour vérifier la superposition.`,
  ).join("\n\n");
  const subjectResponse = await page.request.post(`/api/council-business/${business.id}/prepared-subjects`, {
    data: { kind: "openQuestion", name: `Question à examiner ${Date.now()}`, content: subjectContent },
  });
  expect(subjectResponse.status()).toBe(201);
  const subject = (await subjectResponse.json()).properties as { id: string; textResourceId: string };
  const readableName = `Compte rendu de la commission travaux du 12 septembre ${marker}`;
  const longName = `${"Délibération relative à la convention de déneigement des voies ".repeat(2)}${marker}`;
  for (const name of [readableName, longName]) {
    const response = await page.request.post("/api/resources", {
      data: { kind: "text", path: "seed", name, content: "Document à joindre" },
    });
    expect(response.ok()).toBeTruthy();
  }

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/app/workspace?path=seed&councilBusiness=${business.id}`);
  await page.getByTestId(`business-subject-${subject.id}-open`).click();
  const subjectArea = page
    .getByTestId(`business-inline-resource-${subject.textResourceId}`)
    .getByTestId("editor-writing-area");
  await expect(subjectArea).toContainText("Paragraphe 14");

  await page.getByTestId("business-category-documents").evaluate((element) => element.scrollIntoView({ block: "end" }));
  await page.getByTestId("attachment-picker-open").click();
  const panel = page.getByTestId("attachment-picker-panel");
  await expect(panel).toBeVisible();
  await page.getByTestId("attachment-picker-search-input").fill(marker);
  const results = panel.getByTestId("attachment-picker-search-result");
  await expect(results).toHaveCount(2);
  expect((await panel.boundingBox())?.width).toBeGreaterThanOrEqual(600);
  await expectOnTopOf(page, panel, subjectArea);

  const readable = results.filter({ hasText: readableName });
  const readableTitle = readable.getByTestId("search-hit-title");
  await expect(readableTitle).toHaveText(readableName);
  expect(await readableTitle.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const titleBox = await readableTitle.boundingBox();
  const metaBox = await readable.getByTestId("search-hit-meta").boundingBox();
  expect(metaBox && titleBox && metaBox.y >= titleBox.y + titleBox.height - 1).toBe(true);
  await expect(readable.getByTestId("search-hit-meta")).toContainText("Text · seed");
  await expect(readable).not.toHaveAttribute("title");

  const truncated = results.filter({ hasText: marker }).filter({ hasNotText: readableName });
  expect(
    await truncated.getByTestId("search-hit-title").evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
  await truncated.hover();
  await expect(truncated).toHaveAttribute("title", longName);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  await subjectArea.click();
  await page
    .getByTestId(`business-inline-resource-${subject.textResourceId}`)
    .getByTestId("editor-formatting-menu")
    .click();
  const menu = page.getByTestId("editor-formatting-menu-content");
  await expect(menu).toBeVisible();
  await expectOnTopOf(page, menu, subjectArea);
});
