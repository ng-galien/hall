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

test("a reload that resolves after the user edits keeps the edited draft", async () => {
  const temporary = mkdtempSync(join(clientRoot, ".tmp-resource-session-"));
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
  const resourceId = "22222222-2222-4222-8222-222222222222";
  const textResource = (content) => ({
    id: resourceId,
    kind: "text",
    name: "note",
    path: "",
    tags: [],
    content,
    autosaveEnabled: true,
  });
  const pendingOpens = [];
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
    useWorkspaceResourcesStore.setState({
      open: () => new Promise((resolveOpen) => pendingOpens.push(resolveOpen)),
    });
    let session;
    function Harness() {
      session = useResourceSession({ resourceId });
      return null;
    }
    const answerOpen = async (content) => {
      await act(async () => {
        pendingOpens.shift()({ data: textResource(content), representation: null });
      });
    };

    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(createElement(Harness)));
    await answerOpen("");
    assert.equal(session.content, "");

    let reloaded;
    await act(async () => {
      reloaded = session.reload();
    });
    await act(async () => session.setContent("Typed while the server answer is pending"));
    await answerOpen("");
    assert.equal(await reloaded, true);
    assert.equal(session.content, "Typed while the server answer is pending");
    assert.equal(session.dirty, true);

    await act(async () => session.setContent(""));
    await act(async () => {
      reloaded = session.reload();
    });
    await answerOpen("Changed in another session");
    assert.equal(await reloaded, true);
    assert.equal(session.content, "Changed in another session", "an unedited draft adopts the server content");
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
