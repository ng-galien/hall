import { expect, runItemCommand, test } from "../fixtures/application";

// @verifies-requirement HALL-FR-DOC-280
test("opens recorded history for a non-text resource and its folder", async ({ appPage: page }) => {
  const folderName = `Audit history ${Date.now()}`;
  const folderResponse = await page.request.post("/api/resources", {
    data: { kind: "folder", path: "", name: folderName },
  });
  expect(folderResponse.status()).toBe(201);
  const folder = (await folderResponse.json()).properties;
  const createdResponse = await page.request.post("/api/resources", {
    data: { kind: "remote", path: folderName, name: "Tracked reference", target: { kind: "unconfigured" } },
  });
  expect(createdResponse.status()).toBe(201);
  let resource = (await createdResponse.json()).properties;
  for (const suffix of ["first", "second"]) {
    const response = await page.request.put(`/api/resources/${resource.id}/content`, {
      data: {
        kind: "remote",
        expectedVersion: resource.version,
        target: { kind: "url", url: `https://example.org/${suffix}` },
      },
    });
    expect(response.status()).toBe(200);
    resource = (await response.json()).properties;
  }
  try {
    await page.goto(`/app/workspace?resource=${resource.id}`);
    await runItemCommand(page, "resource-changes-trigger");
    const panel = page.getByTestId("resource-changes-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("resource-changes-item")).toHaveCount(3);
    await expect(panel.locator("time")).toHaveCount(3);
    await page.keyboard.press("Escape");
    await page.goto(`/app/workspace?path=${encodeURIComponent(folderName)}`);
    await runItemCommand(page, "resource-changes-trigger");
    await expect(page.getByTestId("resource-changes-panel").getByTestId("resource-changes-item")).toHaveCount(1);
  } finally {
    await page.request.delete(`/api/resources/${resource.id}`);
    await page.request.delete(`/api/resources/${folder.id}`);
  }
});
