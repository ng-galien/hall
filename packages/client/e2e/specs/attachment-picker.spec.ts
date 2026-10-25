import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/application";

async function businessResourceIds(page: Page, businessId: string) {
  const response = await page.request.get(`/api/council-business/resource-items?councilBusinessId=${businessId}`);
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const items = (
    Array.isArray(body) ? body : (body.entities ?? []).map((entry: { properties: unknown }) => entry.properties)
  ) as Array<{ id: string }>;
  return items.map(({ id }) => id);
}

// @verifies-requirement HALL-FR-SRC-050
test("one attachment picker attaches and creates documents from the business view and from the workspace tree", async ({
  appPage: page,
}) => {
  const marker = crypto.randomUUID().slice(0, 8);
  const created = await page.request.post("/api/council-business", {
    data: { path: "seed", name: `Pièces ${marker}`, reportName: "Report", reportContent: "" },
  });
  expect(created.ok()).toBeTruthy();
  const business = (await created.json()).properties as { id: string };
  const existing: Record<string, string> = {};
  for (const [kind, extra] of [
    ["text", { content: "Note existante" }],
    ["geographic", {}],
    ["remote", { target: { kind: "url", url: "https://example.org" } }],
  ] as const) {
    const response = await page.request.post("/api/resources", {
      data: { kind, path: "seed", name: `Existant ${kind} ${marker}`, ...extra },
    });
    expect(response.ok()).toBeTruthy();
    existing[kind] = (await response.json()).properties.id;
  }

  await page.goto(`/app/workspace?path=seed&councilBusiness=${business.id}`);
  await page.getByTestId("business-category-documents-toggle").click();
  await page.getByTestId("attachment-picker-open").click();
  const panel = page.getByTestId("attachment-picker-panel");
  await expect(panel).toBeVisible();
  for (const kind of ["text", "spreadsheet", "remote", "geographic", "event", "legalReference", "file"]) {
    await expect(panel.getByTestId(`attachment-picker-create-${kind}`)).toBeVisible();
  }
  await page.getByTestId("attachment-picker-search-input").fill(`Existant geographic ${marker}`);
  const results = panel.getByTestId("attachment-picker-search-result");
  await expect(results).toHaveCount(1);
  await results.first().click();
  await expect(panel).toBeHidden();
  await expect(page.getByTestId(`business-attached-resource-${existing.geographic}`)).toBeVisible();
  await expect.poll(() => businessResourceIds(page, business.id)).toContain(existing.geographic);

  await page.getByTestId("attachment-picker-open").click();
  await page.getByTestId("attachment-picker-create-remote").click();
  await page.getByTestId("workspace-create-name").fill(`Lien créé ${marker}`);
  const remoteCreated = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/api/resources"),
  );
  await page.getByTestId("workspace-create-submit").click();
  const remoteResponse = await remoteCreated;
  expect(remoteResponse.request().postDataJSON()).toMatchObject({ councilBusinessId: business.id, kind: "remote" });
  const remote = (await remoteResponse.json()).properties as { id: string };
  await page.getByTestId("resource-preview-close").click();
  await expect(page.getByTestId(`business-attached-resource-${remote.id}`)).toBeVisible();

  // The tree offers business actions once the business capabilities are loaded.
  const capabilitiesLoaded = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/council-business/${business.id}`) && response.request().method() === "GET",
  );
  await page.goto("/app/workspace?path=seed");
  const row = page.getByTestId(`workspace-business-${business.id}`);
  await expect(row).toBeVisible();
  await capabilitiesLoaded;
  await row.click({ button: "right" });
  await page.getByTestId("workspace-tree-attach-document").click();
  await expect(panel).toBeVisible();
  for (const kind of ["text", "remote", "geographic", "file"]) {
    await expect(panel.getByTestId(`attachment-picker-create-${kind}`)).toBeVisible();
  }
  await page.getByTestId("attachment-picker-search-input").fill(`Existant text ${marker}`);
  await expect(results).toHaveCount(1);
  await results.first().click();
  await expect(panel).toBeHidden();
  await expect.poll(() => businessResourceIds(page, business.id)).toContain(existing.text);

  await row.click({ button: "right" });
  await page.getByTestId("workspace-tree-attach-document").click();
  await expect(panel).toBeVisible();
  await page.getByTestId("attachment-picker-search-input").fill(marker);
  await expect(results.filter({ hasText: `Existant text ${marker}` })).toHaveCount(0);
  await expect(results.filter({ hasText: `Existant remote ${marker}` })).toHaveCount(1);
  await page.getByTestId("attachment-picker-create-text").click();
  await page.getByTestId("workspace-create-name").fill(`Texte créé ${marker}`);
  const textCreated = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/api/resources"),
  );
  await page.getByTestId("workspace-create-submit").click();
  const textResponse = await textCreated;
  expect(textResponse.request().postDataJSON()).toMatchObject({ councilBusinessId: business.id, kind: "text" });
  const text = (await textResponse.json()).properties as { id: string };
  await expect.poll(() => businessResourceIds(page, business.id)).toContain(text.id);
});
