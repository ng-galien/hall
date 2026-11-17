import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { test } from "vitest";

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// @verifies-requirement HALL-FR-WSP-090
test("an item moved to a business goes into its folder and a document is attached once", async () => {
  const temporary = mkdtempSync(join(clientRoot, ".tmp-move-into-business-"));
  const entry = join(temporary, "entry.ts");
  const output = join(temporary, "entry.mjs");
  writeFileSync(
    entry,
    `export { moveIntoBusiness } from ${JSON.stringify(join(clientRoot, "src/pages/workspace/workspaceOrg.ts"))};\n` +
      `export { useWorkspaceResourcesStore } from ${JSON.stringify(join(clientRoot, "src/stores/workspaceResourcesStore.ts"))};\n` +
      `export { useCouncilBusinessStore } from ${JSON.stringify(join(clientRoot, "src/stores/councilBusinessStore.ts"))};\n`,
  );
  const dom = new JSDOM("<!doctype html>", { url: "http://localhost/app/" });
  const names = ["window", "document", "navigator", "localStorage"];
  const originals = Object.fromEntries(names.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of names) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  }
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
    const { moveIntoBusiness, useWorkspaceResourcesStore, useCouncilBusinessStore } = await import(
      pathToFileURL(output).href
    );
    const photo = { id: "photo", kind: "document", path: "Voirie", name: "Rapoutier.jpg" };
    const business = {
      id: "coupe",
      title: "Coupe de bois",
      folderPath: "Voirie",
      folderResourceId: "coupe-folder",
      reportResourceId: "coupe-report",
      resources: [],
    };
    const relocations = [];
    const associations = [];
    useWorkspaceResourcesStore.setState({
      catalog: [photo],
      relocate: async (id, input) => {
        relocations.push([id, input.path]);
        photo.path = input.path;
        return { ...photo };
      },
    });
    useCouncilBusinessStore.setState({
      businesses: [business],
      loadResources: async () => true,
      associateResource: async (id, resourceId) => {
        associations.push([id, resourceId]);
        business.resources = [{ id: resourceId }];
        return true;
      },
    });

    assert.equal(await moveIntoBusiness({ kind: "resource", id: "photo" }, business), null);
    assert.deepEqual(relocations, [["photo", "Voirie/Coupe de bois"]]);
    assert.deepEqual(associations, [["coupe", "photo"]]);

    assert.equal(
      await moveIntoBusiness({ kind: "resource", id: "photo" }, business),
      null,
      "a second drop changes nothing",
    );
    assert.equal(relocations.length, 1);
    assert.equal(associations.length, 1);

    useWorkspaceResourcesStore.setState({
      catalog: [{ ...photo, path: "Voirie" }],
      relocate: async () => {
        useWorkspaceResourcesStore.setState({ error: "workspace_title_conflict" });
        return null;
      },
    });
    assert.equal(await moveIntoBusiness({ kind: "resource", id: "photo" }, business), "workspace_title_conflict");
    assert.equal(useWorkspaceResourcesStore.getState().error, null, "the refusal is announced once, by the gesture");
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
    rmSync(temporary, { recursive: true, force: true });
  }
}, 60_000);
