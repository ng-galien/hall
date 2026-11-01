import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import { expect, test } from "../fixtures/application";

test("exports a business archive and imports an incoming archive with duplicate refusal", async ({ appPage: page }) => {
  test.setTimeout(60_000);
  const created = await page.request.post("/api/council-business", {
    data: { path: "seed", name: "Affaire échanges", reportName: "Rapport", reportContent: "Rapport à transmettre" },
  });
  expect(created.ok()).toBeTruthy();
  const business = (await created.json()).properties;
  const uploaded = await page.request.post("/api/resources/documents", {
    multipart: {
      path: "seed/Affaire échanges/Pièces",
      councilBusinessId: business.id,
      file: { name: "annexe.txt", mimeType: "text/plain", buffer: Buffer.from("Pièce jointe conservée") },
    },
  });
  expect(uploaded.ok()).toBeTruthy();
  await page.goto("/app/workspace?path=seed");
  const row = page.getByTestId(`workspace-business-${business.id}`);
  await expect(row).toHaveAttribute("data-folder-import-enabled", "true", { timeout: 15_000 });
  await row.click({ button: "right" });
  await page.getByTestId("workspace-tree-export-bundle").click();
  await page.getByTestId("bundle-last-name").fill("Martin");
  await page.getByTestId("bundle-first-name").fill("Alice");
  await mkdir("/tmp/hall-business-bundles", { recursive: true });
  await page.screenshot({ animations: "disabled", path: "/tmp/hall-business-bundles/export.png" });
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("bundle-export-submit").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("affaire.hallbundle");
  const bytes = await readFile((await download.path())!);
  const archive = JSON.parse(gunzipSync(bytes).toString());
  expect(archive.manifest.business.sourceId).toBe(business.id);
  expect(archive.manifest.sender.slug).toBe("martin-alice");
  expect(
    archive.manifest.resources.some((entry: { data: { name: string } }) => entry.data.name === "annexe.txt"),
  ).toBeTruthy();
  const openImport = async () => {
    await page.goto("/app/workspace?path=seed");
    await expect(page.getByTestId("workspace-tree-root")).toHaveAttribute("data-state", "closed");
    await page.getByTestId("workspace-tree-root").click({ button: "right" });
    await page.getByTestId("workspace-tree-import-bundle").click();
  };
  await openImport();
  await page
    .getByTestId("bundle-import-file")
    .setInputFiles({ name: "affaire.hallbundle", mimeType: "application/gzip", buffer: bytes });
  await page.getByTestId("bundle-import-submit").click();
  await expect(page.getByTestId("bundle-import-conflict")).toBeVisible();
  await expect(page.getByTestId("bundle-import-file")).not.toHaveValue("");
  await page.screenshot({ animations: "disabled", path: "/tmp/hall-business-bundles/duplicate.png" });

  // Simulate the identity of a business exported by another installation; retain its complete payload.
  const incomingId = randomUUID();
  archive.manifest.business.sourceId = incomingId;
  archive.manifestSha256 = createHash("sha256").update(JSON.stringify(archive.manifest)).digest("hex");
  const incomingBytes = gzipSync(Buffer.from(JSON.stringify(archive)));
  await page
    .getByTestId("bundle-import-file")
    .setInputFiles({ name: "incoming.hallbundle", mimeType: "application/gzip", buffer: incomingBytes });
  await page.getByTestId("bundle-import-submit").click();
  await expect(page.getByTestId("bundle-import-dialog")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`councilBusiness=${incomingId}`));
  const imported = await page.request.get(`/api/council-business/${incomingId}`);
  expect(imported.ok()).toBeTruthy();
  const data = (await imported.json()).properties;
  expect(data.folderResourceId).not.toBe(business.folderResourceId);
  const catalog = (await (await page.request.get("/api/resources/catalog")).json()).entities.map(
    (entry: { properties: unknown }) => entry.properties,
  );
  const document = catalog.find(
    (entry: { name: string; path: string }) =>
      entry.name === "annexe.txt" && entry.path.startsWith("Imports/martin-alice/"),
  );
  expect(document).toBeTruthy();
  await page.screenshot({ animations: "disabled", path: "/tmp/hall-business-bundles/imported.png" });
  await openImport();
  await page
    .getByTestId("bundle-import-file")
    .setInputFiles({ name: "incoming.hallbundle", mimeType: "application/gzip", buffer: incomingBytes });
  await page.getByTestId("bundle-import-submit").click();
  await expect(page.getByTestId("bundle-import-conflict")).toBeVisible();
});

test("refuses deleting linked businesses without data loss and deletes only after documents are moved and unlinked", async ({
  appPage: page,
}) => {
  test.setTimeout(60_000);
  const created = await page.request.post("/api/council-business", {
    data: {
      path: "seed",
      name: "Affaire à supprimer",
      reportName: "Rapport",
      reportContent: "Rapport conservé tant que bloqué",
    },
  });
  expect(created.ok()).toBeTruthy();
  const business = (await created.json()).properties;
  const upload = await page.request.post("/api/resources/documents", {
    multipart: {
      path: "seed/Affaire à supprimer",
      councilBusinessId: business.id,
      file: { name: "à-conserver.txt", mimeType: "text/plain", buffer: Buffer.from("Conserver intégralement") },
    },
  });
  expect(upload.ok()).toBeTruthy();
  const document = (await upload.json()).properties;
  await page.goto("/app/workspace?path=seed");
  const row = page.getByTestId(`workspace-business-${business.id}`);
  await expect(row).toHaveAttribute("data-folder-import-enabled", "true", { timeout: 15_000 });
  const openMenu = async () => {
    await page.goto("/app/workspace?path=seed");
    await expect(row).toHaveAttribute("data-folder-import-enabled", "true", { timeout: 15_000 });
    await row.click({ button: "right" });
    await expect(page.getByTestId("workspace-tree-rename")).toBeVisible();
  };
  await openMenu();
  await expect(page.getByTestId("workspace-tree-delete-business")).toHaveCount(0);
  const blocked = await page.request.delete(`/api/council-business/${business.id}`);
  expect(blocked.status()).toBe(409);
  for (const id of [business.reportResourceId, business.folderResourceId, document.id]) {
    expect((await page.request.get(`/api/resources/${id}`)).ok()).toBeTruthy();
  }
  const unlink = await page.request.post(`/api/council-business/${business.id}/resources/dissociate`, {
    data: { resourceId: document.id },
  });
  expect(unlink.ok()).toBeTruthy();
  await openMenu();
  await expect(page.getByTestId("workspace-tree-delete-business")).toHaveCount(0);
  expect((await page.request.get(`/api/resources/${business.reportResourceId}`)).ok()).toBeTruthy();
  const moved = await page.request.patch(`/api/resources/${document.id}/location`, {
    data: { path: "seed", name: "à-conserver.txt" },
  });
  expect(moved.ok()).toBeTruthy();
  await openMenu();
  await page.getByTestId("workspace-tree-delete-business").click();
  const allowed = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/council-business/${business.id}`) && response.request().method() === "DELETE",
  );
  await page.getByTestId("business-delete-confirm").click();
  expect((await allowed).status()).toBe(200);
  await expect(page.getByTestId("business-delete-dialog")).toHaveCount(0);
  await expect(page.getByTestId(`workspace-business-${business.id}`)).toHaveCount(0);
  expect((await page.request.get(`/api/council-business/${business.id}`)).status()).toBe(404);
  const preserved = await page.request.get(`/api/resources/${document.id}`);
  expect(preserved.ok()).toBeTruthy();
  const preservedData = await preserved.json();
  expect(preservedData.properties.path).toBe("seed");
  const content = preservedData.links.find((link: { rel: string[] }) => link.rel.includes("content"));
  expect(await (await page.request.get(content.href)).text()).toBe("Conserver intégralement");
  for (const id of [business.reportResourceId, business.folderResourceId]) {
    expect((await page.request.get(`/api/resources/${id}`)).status()).toBe(404);
  }
});
