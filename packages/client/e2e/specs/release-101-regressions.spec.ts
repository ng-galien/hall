import { expect, test } from "../fixtures/application";

// @verifies-requirement HALL-FR-LAY-010
test("photo actions stay on mobile without occupying the desktop text editor", async ({ appPage: page }, testInfo) => {
  const created = await page.request.post("/api/resources", {
    data: { kind: "text", path: "seed", name: `Photo controls ${crypto.randomUUID()}`, content: "Fictional note." },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()).properties;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/app/workspace?path=seed&resource=${id}`);
  const editor = page.getByTestId("markdown-editor-compact").first();
  await expect(editor.getByTestId("editor-writing-area")).toBeVisible();
  await expect(editor.getByTestId("editor-choose-image")).toBeHidden();
  await expect(editor.getByTestId("editor-take-photo")).toBeHidden();
  await expect(editor.locator(".editor-image-file-controls")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("desktop-photo-controls.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor.getByTestId("editor-choose-image")).toBeVisible();
  await expect(editor.getByTestId("editor-take-photo")).toBeVisible();
  await expect(editor.getByTestId("editor-camera-file")).toHaveAttribute("capture", "environment");
  await page.screenshot({ path: testInfo.outputPath("mobile-photo-controls.png"), animations: "disabled" });
});

// @verifies-requirement HALL-FR-DOC-480
test("a business spreadsheet shows editable cells inline and keeps their saved content", async ({
  appPage: page,
}, testInfo) => {
  test.setTimeout(60_000);
  const created = await page.request.post("/api/council-business", {
    data: { path: "seed", name: `Inline grid ${crypto.randomUUID()}`, reportName: "Report", reportContent: "" },
  });
  expect(created.status()).toBe(201);
  const business = (await created.json()).properties;
  const imported = await page.request.post("/api/resources/spreadsheets/import", {
    multipart: {
      path: "seed",
      councilBusinessId: business.id,
      file: { name: "Inline grid.csv", mimeType: "text/csv", buffer: Buffer.from("Nom;Montant\nLigne;10\n") },
    },
  });
  expect(imported.status(), await imported.text()).toBe(201);
  const resource = (await imported.json()).properties;
  const url = `/app/workspace?path=seed&councilBusiness=${business.id}`;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url);
  await page.getByTestId("business-category-documents-toggle").click();
  await page.getByTestId(`business-attached-resource-${resource.id}-open`).click();
  const grid = page.getByTestId("spreadsheet-grid");
  await expect(grid).toBeVisible();
  await expect(grid).toHaveAttribute("aria-readonly", "false");
  await expect(page.getByTestId("resource-preview")).toHaveCount(0);
  await expect.poll(() => grid.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(300);
  await expect
    .poll(() =>
      grid
        .locator("canvas")
        .evaluateAll((canvases) => Math.max(...canvases.map((canvas) => canvas.getBoundingClientRect().height))),
    )
    .toBeGreaterThan(200);
  await page.screenshot({ path: testInfo.outputPath("business-inline-grid.png"), animations: "disabled" });
  await grid.click({ position: { x: 100, y: 265 } });
  await page.keyboard.press("F2");
  await page.keyboard.insertText("Inline saved value");
  await page.keyboard.press("Enter");
  const saved = async () =>
    (await (await page.request.get(`/api/resources/${resource.id}`)).json()).properties.document;
  await expect.poll(async () => JSON.stringify(await saved()), { timeout: 15_000 }).toContain("Inline saved value");
  await page.reload();
  await page.getByTestId("business-category-documents-toggle").click();
  await page.getByTestId(`business-attached-resource-${resource.id}-open`).click();
  await expect(grid).toBeVisible();
  await expect.poll(() => grid.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(300);
  expect(JSON.stringify(await saved())).toContain("Inline saved value");
});

// @verifies-requirement HALL-FR-USR-010
test("user creation generates a fresh passphrase on reopening and reports generation failures", async ({
  appPage: page,
}) => {
  await page.goto("/app/users");
  const options = await page.request.get("/api/roles/options");
  expect(options.status()).toBe(200);
  await page.getByTestId("users-add").click();
  await expect(page.getByTestId("passphrase-value")).toBeVisible();
  const first = await page.getByTestId("passphrase-value").textContent();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("passphrase-value")).toHaveCount(0);
  await page.getByTestId("users-add").click();
  await expect(page.getByTestId("passphrase-value")).toBeVisible();
  await expect(page.getByTestId("passphrase-value")).not.toHaveText(first!);
  await page.getByTestId("user-display-name").fill("Fixture retained name");
  await page.route("**/api/users/passphrases", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/problem+json",
      body: JSON.stringify({ code: "server_unavailable", status: 503 }),
    }),
  );
  await page.getByTestId("passphrase-generate").click();
  await expect(page.getByTestId("user-create-form").getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("user-display-name")).toHaveValue("Fixture retained name");
  await expect(page.getByTestId("passphrase-value")).toHaveCount(0);
  await expect(page.getByTestId("user-create-submit")).toBeDisabled();
});
