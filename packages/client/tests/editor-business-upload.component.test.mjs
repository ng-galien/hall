import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { test } from "vitest";

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => JSON.stringify(join(clientRoot, "src", path));

// @verifies-requirement HALL-FR-DOC-500
// @verifies-requirement HALL-FR-DOC-510
test("a file dropped in the report of a business opened directly is uploaded into the folder of the business", async () => {
  const temporary = mkdtempSync(join(clientRoot, ".tmp-editor-business-upload-"));
  const entry = join(temporary, "entry.tsx");
  const output = join(temporary, "entry.mjs");
  writeFileSync(
    entry,
    `export { useEditorDocumentUpload } from ${source("features/documents/useEditorDocumentUpload.ts")};\n` +
      `export { useWorkspaceResourcesStore } from ${source("stores/workspaceResourcesStore.ts")};\n` +
      `export { useCouncilBusinessStore } from ${source("stores/councilBusinessStore.ts")};\n`,
  );
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/app/" });
  const names = ["window", "document", "navigator", "localStorage", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"];
  const originals = Object.fromEntries(names.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    localStorage: dom.window.localStorage,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const originalFetch = globalThis.fetch;
  const sent = [];
  let root;
  try {
    await build({
      entryPoints: [entry],
      outfile: output,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      alias: { "@": join(clientRoot, "src") },
      loader: { ".css": "empty" },
      logLevel: "silent",
    });
    const { useEditorDocumentUpload, useWorkspaceResourcesStore, useCouncilBusinessStore } = await import(
      pathToFileURL(output).href
    );
    const businessRepresentation = {
      class: ["council-business"],
      properties: {},
      links: [],
      actions: [
        {
          name: "resource.create-document",
          method: "POST",
          href: "/api/resources/documents",
          type: "multipart/form-data",
          fields: [{ name: "file", type: "file", accept: ".pdf" }],
        },
      ],
    };
    useWorkspaceResourcesStore.setState({ collectionRepresentation: null, folderRepresentations: {} });
    useCouncilBusinessStore.setState({
      businesses: [{ id: "business", title: "Dépôt", folderPath: "seed", resources: [] }],
      representationsById: { business: businessRepresentation },
      loadResources: async () => true,
    });
    globalThis.fetch = async (url, init) => {
      sent.push({ url: String(url), path: init.body.get("path"), business: init.body.get("councilBusinessId") });
      return new Response(
        JSON.stringify({
          class: ["resource"],
          properties: {
            id: "10000000-0000-4000-8000-000000000001",
            slug: "plan-pdf",
            path: "seed/Dépôt",
            name: "plan.pdf",
            fullPath: "seed/Dépôt/plan.pdf",
            kind: "document",
            tags: [],
            state: { readiness: "ready", availability: null },
            createdAt: "2026-11-17T10:00:00Z",
            updatedAt: "2026-11-17T10:00:00Z",
            binary: { mediaType: "application/pdf", byteSize: 4, sha256: "0".repeat(64), fileName: "plan.pdf" },
            version: 1,
          },
          links: [],
          actions: [],
        }),
        { status: 201, headers: { "Content-Type": "application/vnd.siren+json" } },
      );
    };
    let upload;
    function Harness() {
      upload = useEditorDocumentUpload("seed", "business");
      return null;
    }
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(createElement(Harness)));
    assert.ok(upload, "the report accepts dropped files");
    await upload.upload(new dom.window.File(["%PDF"], "plan.pdf", { type: "application/pdf" })).catch(() => null);
    assert.deepEqual(sent, [{ url: "/api/resources/documents", path: "seed/Dépôt", business: "business" }]);
  } finally {
    globalThis.fetch = originalFetch;
    if (root) await act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
    rmSync(temporary, { recursive: true, force: true });
  }
}, 60_000);
