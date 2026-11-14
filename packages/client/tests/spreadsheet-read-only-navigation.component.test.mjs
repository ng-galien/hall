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

/** The spreadsheet engine and its workbook conversion, reduced to the calls the adapter makes, record the permissions it receives. */
const univerStub = `
export const calls = [];
export const CommandType = { MUTATION: 2 };
export const LocaleType = { FR_FR: "frFR", EN_US: "enUS" };
export const CalculationMode = { FORCED: 0 };
export class Univer { registerPlugin() {} dispose() {} }
export const UniverSheetsCorePreset = () => ({ plugins: [] });
const workbook = {
  save: () => ({}),
  getWorkbookPermission: () => ({
    setMode: async (mode) => { calls.push(["mode", mode]); },
    setPoint: async (point, value) => { calls.push(["point", point, value]); },
  }),
};
export const FUniver = {
  newAPI: () => ({
    Event: {},
    Enum: { WorkbookPermissionPoint: { CopyContent: "WorkbookCopy" } },
    createWorkbook: () => workbook,
    addEvent: () => ({ dispose() {} }),
    setPermissionDialogVisible: (visible) => { calls.push(["dialog", visible]); },
    toggleDarkMode() {},
    dispose() {},
  }),
};
export const workbookFromSpreadsheetDocument = () => ({});
export const spreadsheetSnapshotFromWorkbook = () => ({ signature: "", document: {} });
export default {};
`;

async function renderAdapter(readOnly) {
  const temporary = mkdtempSync(join(clientRoot, ".tmp-spreadsheet-read-only-"));
  const entry = join(temporary, "entry.tsx");
  const stub = join(temporary, "univer.mjs");
  const output = join(temporary, "entry.mjs");
  writeFileSync(stub, univerStub);
  writeFileSync(
    entry,
    `export { UniverSpreadsheetAdapter } from ${JSON.stringify(join(clientRoot, "src/features/spreadsheet/UniverSpreadsheetAdapter.tsx"))};\n` +
      `export { calls } from ${JSON.stringify(stub)};\n`,
  );
  const dom = new JSDOM('<!doctype html><div id="root"></div><div id="slot"></div>', { url: "http://localhost/app/" });
  const names = [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Node",
    "MutationObserver",
    "IS_REACT_ACT_ENVIRONMENT",
  ];
  const originals = Object.fromEntries(names.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
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
      plugins: [
        {
          name: "univer-stub",
          setup(builder) {
            builder.onResolve({ filter: /^@univerjs\/|\/univerWorkbook$/ }, () => ({ path: stub }));
          },
        },
      ],
    });
    const { UniverSpreadsheetAdapter, calls } = await import(pathToFileURL(output).href);
    const slot = dom.window.document.getElementById("slot");
    root = createRoot(dom.window.document.getElementById("root"));
    await act(async () => {
      root.render(
        createElement(UniverSpreadsheetAdapter, {
          mountElement: slot,
          document: { schemaVersion: 2, workbook: { id: "w", sheetOrder: [], sheets: {} } },
          readOnly,
          locale: "fr",
          onChange: () => undefined,
          onEditingChange: () => undefined,
        }),
      );
    });
    const grid = slot.querySelector('[data-testid="spreadsheet-grid"]');
    return { inert: grid.hasAttribute("inert"), ariaReadOnly: grid.getAttribute("aria-readonly"), calls: [...calls] };
  } finally {
    await act(async () => root?.unmount());
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    rmSync(temporary, { recursive: true, force: true });
  }
}

test("a reader moves through a spreadsheet; only its modification is refused", async () => {
  const reader = await renderAdapter(true);
  assert.equal(reader.inert, false, "the read-only grid receives the pointer, the wheel, the touch and the keyboard");
  assert.equal(reader.ariaReadOnly, "true");
  assert.deepEqual(reader.calls, [
    ["dialog", false],
    ["mode", "viewer"],
    ["point", "WorkbookCopy", true],
  ]);
});

test("a person who may modify the spreadsheet keeps the engine's default permissions", async () => {
  const writer = await renderAdapter(false);
  assert.equal(writer.inert, false);
  assert.equal(writer.ariaReadOnly, "false");
  assert.deepEqual(writer.calls, []);
});
