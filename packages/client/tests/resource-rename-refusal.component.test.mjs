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

// @verifies-requirement HALL-FR-DOC-590
test("a rename keeps the name written by the server; a refused rename or content is announced once, with its reason", async () => {
  const temporary = mkdtempSync(join(clientRoot, ".tmp-resource-rename-"));
  const entry = join(temporary, "entry.tsx");
  const output = join(temporary, "entry.mjs");
  writeFileSync(
    entry,
    `export { useResourceSession } from ${JSON.stringify(join(clientRoot, "src/features/resources/useResourceSession.ts"))};\n` +
      `export { useWorkspaceResourcesStore } from ${JSON.stringify(join(clientRoot, "src/stores/workspaceResourcesStore.ts"))};\n`,
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
  const resourceId = "44444444-4444-4444-8444-444444444444";
  const representation = {
    class: ["resource"],
    properties: {},
    links: [],
    actions: ["resource.update-metadata", "resource.update-content"].map((name) => ({
      name,
      method: "POST",
      href: `/api/resources/${resourceId}`,
    })),
  };
  const photo = (name) => ({
    id: resourceId,
    kind: "text",
    name,
    path: "photos",
    slug: "photo",
    tags: [],
    content: "",
    autosaveEnabled: false,
  });
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
    const { useResourceSession, useWorkspaceResourcesStore } = await import(pathToFileURL(output).href);
    const answers = [];
    useWorkspaceResourcesStore.setState({
      error: null,
      open: async () => ({ data: photo("Rapoutier"), representation }),
      updateMetadata: async (_id, input) => answers.shift()(input),
    });
    let session;
    function Harness() {
      session = useResourceSession({ resourceId });
      return null;
    }
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(createElement(Harness)));
    assert.equal(session.title, "Rapoutier");

    answers.push(() => {
      useWorkspaceResourcesStore.setState({ error: "resource_name_reserved" });
      return null;
    });
    let saved;
    await act(async () => {
      saved = await session.save("..");
    });
    assert.equal(saved, false);
    assert.equal(session.actionError, "resource_name_reserved");
    assert.equal(useWorkspaceResourcesStore.getState().error, null, "the screen banner of the store stays empty");
    assert.equal(session.saveStatus, "idle", "the save state does not repeat the refusal");
    assert.equal(session.title, "Rapoutier");

    answers.push((input) => photo(input.name.replaceAll("/", "∕")));
    await act(async () => {
      saved = await session.save("Rapoutier dessous 17/11/2026");
    });
    assert.equal(saved, true);
    assert.equal(session.actionError, null);
    assert.equal(session.title, "Rapoutier dessous 17∕11∕2026");
    assert.equal(session.dirty, false);

    useWorkspaceResourcesStore.setState({
      updateContent: async () => {
        useWorkspaceResourcesStore.setState({ error: "permission_denied" });
        return null;
      },
    });
    await act(async () => session.setContent("Coupe le 17/11"));
    await act(async () => {
      saved = await session.save();
    });
    assert.equal(saved, false);
    assert.equal(session.actionError, "permission_denied");
    assert.equal(useWorkspaceResourcesStore.getState().error, null, "a refused content is announced once");
    assert.equal(
      session.saveStatus,
      "dirty",
      "the save state says the content is not recorded, without a second error",
    );
  } finally {
    if (root) await act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
    rmSync(temporary, { recursive: true, force: true });
  }
}, 60_000);
