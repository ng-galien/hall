import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, test } from "vitest";

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => JSON.stringify(join(clientRoot, "src", path));

/** Modules of the opened item that this test replaces: the body, the header, the dialogs and the layout. */
const stubs = {
  "features/documents/ResourcePreview": "export function ResourcePreviewWithSession() { return null; }",
  "features/documents/useWorkspaceResourceImageUpload":
    "export function useWorkspaceResourceImageUpload() { return { canUpload: false, uploadImage: async () => null }; }",
  "features/resources/ResourcePresentationBody": "export function ResourcePresentationBody() { return null; }",
  "features/resources/ResourceChangesControl": "export function ResourceChangesControl() { return null; }",
  "hooks/useReferenceMentionables": "export function useReferenceMentionables() { return []; }",
  "i18n/I18nProvider": "export function useI18n() { return { t: (key) => key, formatDate: (value) => value }; }",
  "pages/workspace/ResourcePhoneView": "export function ResourcePhoneView() { return null; }",
  "pages/workspace/ResourceWorkbenchHeader": "export function ResourceWorkbenchHeader() { return null; }",
  "shell/usePhoneLayout": "export function usePhoneLayout() { return false; }",
};

const stubPlugin = {
  name: "stubs",
  setup(builder) {
    builder.onResolve({ filter: /./ }, (args) => {
      const key = Object.keys(stubs).find((path) => args.path.endsWith(path.split("/").at(-1)));
      return key && args.kind !== "entry-point" ? { path: key, namespace: "stub" } : undefined;
    });
    builder.onLoad({ filter: /./, namespace: "stub" }, (args) => ({ contents: stubs[args.path], loader: "js" }));
  },
};

const resourceId = "33333333-3333-4333-8333-333333333333";
const representation = {
  class: ["resource"],
  properties: {},
  links: [],
  actions: ["resource.update-metadata", "resource.update-content", "resource.delete"].map((name) => ({
    name,
    method: "POST",
    href: `/api/resources/${resourceId}`,
  })),
};
const textResource = (content) => ({
  id: resourceId,
  kind: "text",
  name: "note",
  path: "",
  slug: "note",
  tags: [],
  content,
  autosaveEnabled: true,
});

let temporary;
let modules;
let dom;
let originals;

async function bundle(name, contents, plugins) {
  const entry = join(temporary, `${name}.tsx`);
  const output = join(temporary, `${name}.mjs`);
  writeFileSync(entry, contents);
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
    plugins,
  });
  return import(pathToFileURL(output).href);
}

beforeAll(async () => {
  temporary = mkdtempSync(join(clientRoot, ".tmp-resource-commands-"));
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/app/" });
  const names = ["window", "document", "navigator", "localStorage", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"];
  originals = Object.fromEntries(names.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
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
  modules = {
    view: await bundle(
      "view",
      `export { ResourceWorkbench } from ${source("pages/workspace/ResourceWorkbench.tsx")};\n` +
        `export { useSessionControls } from ${source("pages/workspace/useSessionControls.tsx")};\n` +
        `export { TooltipProvider } from ${source("components/ui/tooltip.tsx")};\n`,
      [stubPlugin],
    ),
    session: await bundle(
      "session",
      `export { useResourceSession } from ${source("features/resources/useResourceSession.ts")};\n` +
        `export { useWorkspaceResourcesStore } from ${source("stores/workspaceResourcesStore.ts")};\n`,
    ),
  };
}, 60_000);

afterAll(() => {
  for (const [key, descriptor] of Object.entries(originals ?? {})) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  dom?.window.close();
  if (temporary) rmSync(temporary, { recursive: true, force: true });
});

/** The state of a command as the person sees it: present, enabled or not, and its label. */
function commandState(testId) {
  const element = document.querySelector(`[data-testid="${testId}"]`);
  return element ? { disabled: element.disabled, label: element.textContent.trim() } : null;
}

test("the commands of an opened item keep their label and state while it saves", async () => {
  const { ResourceWorkbench, useSessionControls, TooltipProvider } = modules.view;
  const session = (submitting) => ({
    resource: textResource("Texte"),
    representation,
    capabilities: { deleteResource: true, updateMetadata: true, updateContent: true },
    title: "note",
    tags: [],
    content: "Texte",
    submitting,
    saveStatus: submitting ? "saving" : "saved",
    autosaveEnabled: true,
    canConfigureAutosave: true,
    dirty: false,
    editable: true,
    mode: "edit",
    flush: async () => true,
    save: async () => true,
    reload: async () => true,
    setActionError: () => undefined,
    updateAutosave: () => undefined,
  });
  function Item({ submitting }) {
    const current = session(submitting);
    const controls = useSessionControls(current);
    return createElement(
      TooltipProvider,
      null,
      createElement(ResourceWorkbench, { session: current, onSelect: () => undefined }),
      controls.visible,
    );
  }
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () => root.render(createElement(Item, { submitting: false })));
    const idle = ["resource-delete", "resource-autosave-toggle"].map(commandState);
    assert.deepEqual(idle[0], { disabled: false, label: "workspace.deleteResource" });
    assert.equal(idle[1]?.disabled, false);

    await act(async () => root.render(createElement(Item, { submitting: true })));
    const saving = ["resource-delete", "resource-autosave-toggle"].map(commandState);
    assert.deepEqual(saving, idle, "a save on its way leaves the delete command and the autosave switch unchanged");
  } finally {
    await act(async () => root.unmount());
  }
});

test("a delete confirmed while the text saves is sent once the save has ended", async () => {
  const { useResourceSession, useWorkspaceResourcesStore } = modules.session;
  const pendingUpdates = [];
  const removed = [];
  useWorkspaceResourcesStore.setState({
    open: async () => ({ data: textResource(""), representation }),
    updateContent: () => new Promise((resolveUpdate) => pendingUpdates.push(resolveUpdate)),
    remove: async (reference) => {
      removed.push({ reference, savesOnTheirWay: pendingUpdates.length });
      return true;
    },
  });
  let session;
  function Harness() {
    session = useResourceSession({ resourceId });
    return null;
  }
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => session.setContent("Texte saisi"));
    let saved;
    await act(async () => {
      saved = session.save();
    });
    assert.equal(session.submitting, true);
    assert.equal(pendingUpdates.length, 1);

    let deleted;
    await act(async () => {
      deleted = session.remove();
    });
    assert.deepEqual(removed, [], "the delete waits for the save on its way");

    await act(async () => {
      pendingUpdates.shift()(textResource("Texte saisi"));
      pendingUpdates.length = 0;
    });
    assert.equal(await saved, true);
    assert.equal(await deleted, true);
    assert.deepEqual(removed, [{ reference: resourceId, savesOnTheirWay: 0 }]);
  } finally {
    await act(async () => root.unmount());
  }
});
