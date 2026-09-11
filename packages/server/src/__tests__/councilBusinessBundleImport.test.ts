import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { decodeCouncilBusinessBundle, encodeCouncilBusinessBundle } from "../services/councilBusinessBundleArchive.js";
import { startLocalHttpServer } from "../core/localServer.js";

it("transfers a whole business between isolated installations and refuses duplicate imports", async () => {
  const sourceDirectory = await mkdtemp(join(tmpdir(), "hall-bundle-source-"));
  const targetDirectory = await mkdtemp(join(tmpdir(), "hall-bundle-target-"));
  const source = await startLocalHttpServer({ dataDirectory: sourceDirectory });
  let target: Awaited<ReturnType<typeof startLocalHttpServer>> | undefined;
  try {
    target = await startLocalHttpServer({ dataDirectory: targetDirectory });
    const connection = (url: string) => {
      let cookie = "";
      return async (path: string, method = "GET", body?: unknown, status = 200) => {
        const response = await fetch(`${url}/api${path}`, { method, headers: { origin: url, cookie,
          ...(body instanceof FormData ? {} : { "content-type": "application/json" }) },
          ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
        if (response.headers.has("set-cookie")) cookie = response.headers.get("set-cookie")!.split(";", 1)[0]!;
        if (response.headers.get("content-type")?.includes("gzip")) {
          expect(response.status).toBe(status); return { bytes: Buffer.from(await response.arrayBuffer()) };
        }
        const data = await response.json();
        expect(response.status, JSON.stringify(data)).toBe(status);
        return data;
      };
    };
    const a = connection(source.url); const b = connection(target.url);
    const bootstrap = { email: "admin@example.test", displayName: "Admin", password: "Bundle-test-password-2026!" };
    await a("/auth/bootstrap", "POST", bootstrap, 201); await b("/auth/bootstrap", "POST", bootstrap, 201);
    const business = (await a("/council-business", "POST", { path: "Travaux", name: "Captage", reportName: "Rapport", reportContent: "État du captage" }, 201)).properties;
    await a("/resources", "POST", { kind: "folder", path: "Travaux/Captage", name: "Études" }, 201);
    const text = (await a("/resources", "POST", { kind: "text", path: "Travaux/Captage/Études", name: "Note", content: "Mesures", councilBusinessId: business.id }, 201)).properties;
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6uAAAAABJRU5ErkJggg==", "base64");
    const picture = new FormData(); picture.set("path", "Travaux/Captage/Études"); picture.set("name", "Photo"); picture.set("councilBusinessId", business.id); picture.set("file", new Blob([png], { type: "image/png" }), "photo.png");
    await a("/resources/documents", "POST", picture, 201);
    const assetForm = new FormData(); assetForm.set("ownerKind", "textResourceContent"); assetForm.set("ownerId", text.id); assetForm.set("title", "Plan"); assetForm.set("file", new Blob([png], { type: "image/png" }), "plan.png");
    const asset = (await a("/resources/editor-assets", "POST", assetForm, 201)).properties;
    await a(`/resources/${text.id}/content`, "PUT", { kind: "text", expectedVersion: 1, content: `Mesures\n\n::image[Plan]{#${asset.id}}\n\n:resource[Rapport]{#${business.reportResourceId}}` });
    const exported = await a(`/council-business/${business.id}/bundle?firstName=Epona&lastName=Arverna`);
    const form = () => { const f = new FormData(); f.set("file", new Blob([exported.bytes]), "captage.hallbundle"); return f; };
    const invalid = decodeCouncilBusinessBundle(exported.bytes);
    invalid.manifest.resources.find(({ data }) => data.id === text.id)!.data.name = "Rapport";
    invalid.manifest.resources.find(({ data }) => data.id === text.id)!.data.path = "Travaux/Captage";
    invalid.manifest.resources.find(({ data }) => data.id === text.id)!.data.fullPath = "Travaux/Captage/Rapport";
    const invalidForm = new FormData(); invalidForm.set("file", new Blob([new Uint8Array(encodeCouncilBusinessBundle(invalid))]), "conflict.hallbundle");
    await b("/council-business/import-bundle", "POST", invalidForm, 409);
    expect((await b("/council-business/workspace-items")).entities).toHaveLength(0);
    const imported = (await b("/council-business/import-bundle", "POST", form(), 201)).properties;
    expect(imported.id).toBe(business.id);
    expect(imported.reportResourceId).not.toBe(business.reportResourceId);
    const report = (await b(`/resources/${imported.reportResourceId}`)).properties;
    expect(report.content).toBe("État du captage");
    expect(report.path).toBe("Imports/arverna-epona/Captage");
    const linked = (await b(`/council-business/${imported.id}/resources`)).entities.map((e: { properties: { resourceId: string } }) => e.properties.resourceId);
    expect(linked).toHaveLength(2); expect(linked).not.toContain(text.id);
    const details = await Promise.all(linked.map(async (id: string) => (await b(`/resources/${id}`)).properties));
    const importedText = details.find((r: { kind: string }) => r.kind === "text");
    expect(importedText.content).toContain(`:resource[Rapport]{#${imported.reportResourceId}}`);
    expect(importedText.content).not.toContain(asset.id);
    const importedAssetId = /::image\[Plan\]\{#([^}]+)\}/.exec(importedText.content)![1];
    const importedAsset = (await b(`/resources/editor-assets/${importedAssetId}`)).properties;
    expect(importedAsset.owner.id).toBe(importedText.id);
    expect(importedAsset.contentSha256).toBe(asset.contentSha256);
    expect(details.every((r: { path: string }) => r.path === "Imports/arverna-epona/Captage/Études")).toBe(true);
    await b(`/resources/${imported.folderResourceId}`, "DELETE", undefined, 409);
    await b("/council-business/import-bundle", "POST", form(), 409);
    expect((await b("/council-business/workspace-items")).entities).toHaveLength(1);
    await b("/resources", "POST", { kind: "folder", path: "", name: "Archives" }, 201);
    const document = details.find((r: { kind: string }) => r.kind === "document");
    await b(`/resources/${document.id}/location`, "PATCH", { path: "Archives", name: "Photo conservée" });
    const other = (await b("/council-business", "POST", { path: "Travaux", name: "Autre affaire", reportName: "Rapport", reportContent: "Autre" }, 201)).properties;
    await b(`/council-business/${other.id}/resources`, "POST", { resourceId: importedText.id }, 201);
    await b(`/council-business/${imported.id}`, "DELETE", undefined, 409);
    expect((await b(`/resources/${importedText.id}`)).properties.id).toBe(importedText.id);
    expect((await b(`/council-business/${imported.id}`)).properties.id).toBe(imported.id);
    await b(`/council-business/${other.id}/resources/dissociate`, "POST", { resourceId: importedText.id });
    await b(`/council-business/${imported.id}`, "DELETE", undefined, 409);
    for (const resource of details) await b(`/council-business/${imported.id}/resources/dissociate`, "POST", { resourceId: resource.id });
    await b(`/council-business/${imported.id}`, "DELETE", undefined, 409);
    const folders = (await b("/resources?path=Imports%2Farverna-epona%2FCaptage")).entities.map((e: { properties: any }) => e.properties);
    const nestedFolder = folders.find((r: { fullPath: string }) => r.fullPath === "Imports/arverna-epona/Captage/Études");
    await b(`/resources/${nestedFolder.id}/location`, "PATCH", { path: "Archives", name: "Études conservées" });
    await b(`/council-business/${imported.id}`, "DELETE");
    expect((await b(`/resources/${document.id}`)).properties.path).toBe("Archives");
    expect((await b(`/resources/${importedText.id}`)).properties.path).toBe("Archives/Études conservées");
    await b("/council-business/import-bundle", "POST", form(), 201);
    await b(`/council-business/${other.id}`, "DELETE");
    const preparedBusiness = (await b("/council-business", "POST", { path: "Travaux", name: "Affaire délibération", reportName: "Rapport", reportContent: "À examiner" }, 201)).properties;
    const proposal = (await b(`/council-business/${preparedBusiness.id}/prepared-subjects`, "POST", { kind: "councilDecisionProposal", name: "Projet", content: "Délibération préparée" }, 201));
    expect(proposal).toBeTruthy();
    await b(`/council-business/${preparedBusiness.id}`, "DELETE", undefined, 409);

  } finally {
    await target?.close(); await source.close();
    await rm(sourceDirectory, { recursive: true, force: true }); await rm(targetDirectory, { recursive: true, force: true });
  }
}, 60000);
