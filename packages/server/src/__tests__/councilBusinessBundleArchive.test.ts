import { randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { resourceDetailSchema, type CouncilBusinessBundleManifest } from "@hall/api-contract";
import { createCouncilBusinessBundleExportService } from "../services/councilBusinessBundleExportService.js";
import {
  bundleContentHash, decodeCouncilBusinessBundle, encodeCouncilBusinessBundle,
} from "../services/councilBusinessBundleArchive.js";

function fixture() {
  const id = randomUUID();
  const folderId = randomUUID();
  const manifest: CouncilBusinessBundleManifest = {
    format: "hall-council-business", version: 1,
    sender: { firstName: "Epona", lastName: "Arverna", slug: "arverna-epona" },
    business: { sourceId: randomUUID(), folderSourceId: folderId, name: "Eau potable", reportSourceId: id, resourceSourceIds: [] },
    resources: [{ data: {
      id, kind: "text", slug: "rapport", path: "Eau", name: "Rapport", fullPath: "Eau/Rapport",
      tags: [], state: { readiness: "ready", availability: null }, autosaveEnabled: true,
      createdAt: "2026-09-10T10:00:00Z", updatedAt: "2026-09-10T10:00:00Z", content: "Le rapport", version: 1,
    } }],
    files: [], editorAssets: [], externalReferenceIds: [],
  };
  manifest.resources.push({ data: resourceDetailSchema.parse({ ...manifest.resources[0]!.data, id: folderId, kind: "folder", name: "Eau",
    path: "", fullPath: "Eau", slug: "eau" }) });
  return { manifest, files: new Map<string, Buffer>() };
}

function changeEnvelope(archive: Buffer, change: (value: any) => void): Buffer {
  const value = JSON.parse(gunzipSync(archive).toString());
  change(value);
  value.manifestSha256 = bundleContentHash(Buffer.from(JSON.stringify(value.manifest)));
  return gzipSync(JSON.stringify(value));
}

describe("council business bundle archive", () => {
  it("exports the business report and fails rather than silently omitting a missing associated piece", async () => {
    const input = fixture();
    const report = input.manifest.resources[0]!.data;
    const folderId = input.manifest.business.folderSourceId;
    const folder = input.manifest.resources[1]!.data;
    const missingId = randomUUID();
    let missingAssociation = false;
    const service = createCouncilBusinessBundleExportService({
      councilClient: {
        openBusiness: async () => ({ id: input.manifest.business.sourceId, folderResourceId: folderId, reportResourceId: report.id }),
        listBusinessResources: async () => missingAssociation
          ? [{ councilBusinessId: input.manifest.business.sourceId, resourceId: missingId, position: 1 }] : [],
      },
      resourcesClient: {
        open: async (id) => {
          const data = id === report.id ? report : id === folderId ? folder : null;
          return data ? { data, representation: { class: ["resource"], properties: data, links: [] } } : null;
        },
        listAll: async () => ({ data: [], representation: { class: [], links: [] } }),
        readDocumentContent: async () => null,
        openEditorAsset: async () => null,
        readEditorAssetContent: async () => null,
      },
    });
    const exported = decodeCouncilBusinessBundle(await service.export(input.manifest.business.sourceId, input.manifest.sender));
    expect(exported.manifest.business.reportSourceId).toBe(report.id);
    expect(exported.manifest.resources).toEqual([input.manifest.resources[1], input.manifest.resources[0]]);
    missingAssociation = true;
    await expect(service.export(input.manifest.business.sourceId, input.manifest.sender)).rejects.toThrow();
  });

  it("round trips source identities, rich text and unchanged binary bytes", () => {
    const input = fixture();
    const bytes = Buffer.from([0, 255, 10, 20]);
    const sha256 = bundleContentHash(bytes);
    const path = `blobs/${sha256}`;
    input.manifest.files.push({ path, sha256, byteSize: bytes.length, mediaType: "application/pdf" });
    input.files.set(path, bytes);
    const result = decodeCouncilBusinessBundle(encodeCouncilBusinessBundle(input));
    expect(result).toEqual(input);
  });

  it("rejects a binary changed without changing its digest", () => {
    const input = fixture();
    const content = Buffer.from("original");
    const sha256 = bundleContentHash(content);
    input.manifest.files.push({ path: `blobs/${sha256}`, sha256, byteSize: 8, mediaType: "application/pdf" });
    input.files.set(`blobs/${sha256}`, content);
    const archive = changeEnvelope(encodeCouncilBusinessBundle(input), (value) => {
      value.files[0].base64 = Buffer.from("modified").toString("base64");
    });
    expect(() => decodeCouncilBusinessBundle(archive)).toThrow("integrity");
  });

  it.each(["../secret", "/tmp/secret", "blobs/../../secret", "C:\\secret"])("rejects unsafe entry %s", (path) => {
    const archive = changeEnvelope(encodeCouncilBusinessBundle(fixture()), (value) => {
      value.files.push({ path, base64: "" });
    });
    expect(() => decodeCouncilBusinessBundle(archive)).toThrow();
  });

  it("rejects duplicate identities, missing reports and dangling associations", () => {
    const input = fixture();
    const archive = encodeCouncilBusinessBundle(input);
    for (const change of [
      (value: any) => value.manifest.resources.push(value.manifest.resources[0]),
      (value: any) => { value.manifest.business.reportSourceId = randomUUID(); },
      (value: any) => value.manifest.business.resourceSourceIds.push(randomUUID()),
    ]) expect(() => decodeCouncilBusinessBundle(changeEnvelope(archive, change))).toThrow();
  });

  it("rejects arbitrary bytes and truncated gzip instead of partially importing", () => {
    expect(() => decodeCouncilBusinessBundle(Buffer.from("not a bundle"))).toThrow();
    const archive = encodeCouncilBusinessBundle(fixture());
    expect(() => decodeCouncilBusinessBundle(archive.subarray(0, archive.length - 5))).toThrow();
  });
});
