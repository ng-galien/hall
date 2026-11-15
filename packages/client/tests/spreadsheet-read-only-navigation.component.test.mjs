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
export class Univer { registerPlugin(plugin) { calls.push(["plugin", plugin.name]); } dispose() {} }
export class UniverUIPlugin {}
export class UniverSheetsUIPlugin {}
export class UniverMobileUIPlugin {}
export class UniverSheetsMobileUIPlugin {}
export const UniverSheetsCorePreset = () => ({ plugins: [UniverUIPlugin, [UniverSheetsUIPlugin, {}]] });
export const handlers = {};
export const content = { cells: { A1: "Date" } };
const range = { setValue() {}, setFormula() {}, clearContent() {}, setFontWeight() {}, setFontStyle() {} };
const sheet = {
  getActiveRange: () => range,
  getRange: () => range,
  insertRowAfter() {},
  insertColumnAfter() {},
  deleteRow() {},
  deleteColumn() {},
};
const workbook = {
  getId: () => "w",
  getActiveCell: () => null,
  getActiveSheet: () => sheet,
  getSheetBySheetId: () => sheet,
  save: () => JSON.parse(JSON.stringify(content)),
  getWorkbookPermission: () => ({
    setMode: async (mode) => { calls.push(["mode", mode]); },
    setPoint: async (point, value) => { calls.push(["point", point, value]); },
  }),
};
export const FUniver = {
  newAPI: () => ({
    Event: { CommandExecuted: "CommandExecuted", Undo: "Undo", Redo: "Redo" },
    undo: async () => true,
    redo: async () => true,
    Enum: { WorkbookPermissionPoint: { CopyContent: "WorkbookCopy" } },
    createWorkbook: () => workbook,
    addEvent: (name, handler) => {
      if (name) handlers[name] = handler;
      return { dispose() {} };
    },
    setPermissionDialogVisible: (visible) => { calls.push(["dialog", visible]); },
    toggleDarkMode() {},
    dispose() {},
  }),
};
export const workbookFromSpreadsheetDocument = () => ({});
export const spreadsheetSnapshotFromWorkbook = (saved) => ({
  signature: JSON.stringify(saved),
  document: { schemaVersion: 2, workbook: saved },
});
export default {};
`;

async function renderAdapter(readOnly, phone = false, scenario = async () => undefined) {
  const temporary = mkdtempSync(join(clientRoot, ".tmp-spreadsheet-read-only-"));
  const entry = join(temporary, "entry.tsx");
  const stub = join(temporary, "univer.mjs");
  const output = join(temporary, "entry.mjs");
  writeFileSync(stub, univerStub);
  writeFileSync(
    entry,
    `export { UniverSpreadsheetAdapter } from ${JSON.stringify(join(clientRoot, "src/features/spreadsheet/UniverSpreadsheetAdapter.tsx"))};\n` +
      `export { calls, content, handlers } from ${JSON.stringify(stub)};\n`,
  );
  const dom = new JSDOM('<!doctype html><div id="root"></div><div id="slot"></div>', {
    url: "http://localhost/app/",
    pretendToBeVisual: true,
  });
  const names = [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Node",
    "MutationObserver",
    "requestAnimationFrame",
    "cancelAnimationFrame",
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
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
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
    const { UniverSpreadsheetAdapter, calls, content, handlers } = await import(pathToFileURL(output).href);
    const slot = dom.window.document.getElementById("slot");
    root = createRoot(dom.window.document.getElementById("root"));
    const changes = [];
    const engine = { cells: null, flush: null };
    let currentLayout = phone;
    let currentReadOnly = readOnly;
    const render = (layout = currentLayout, nextReadOnly = currentReadOnly) =>
      act(async () => {
        currentLayout = layout;
        currentReadOnly = nextReadOnly;
        root.render(
          createElement(UniverSpreadsheetAdapter, {
            key: layout ? "phone" : "pointer",
            mountElement: slot,
            readDocument: () => ({ schemaVersion: 2, workbook: { id: "w", sheetOrder: [], sheets: {} } }),
            readOnly: nextReadOnly,
            locale: "fr",
            phone: layout,
            onCells: (cells) => {
              engine.cells = cells;
            },
            onRegisterFlush: (flush) => {
              engine.flush = flush;
            },
            onChange: (document) => changes.push(document),
            onEditingChange: () => undefined,
          }),
        );
      });
    await render(phone);
    await scenario({
      changes,
      content,
      engine,
      setPhone: (layout) => render(layout),
      setReadOnly: (nextReadOnly) => render(currentLayout, nextReadOnly),
      gesture: (type) =>
        act(async () => {
          slot
            .querySelector(".univer-spreadsheet-instance")
            .dispatchEvent(new dom.window.Event(type, { bubbles: true }));
        }),
      fire: (event) => act(async () => handlers.CommandExecuted(event)),
      undo: () => act(async () => handlers.Undo({})),
      settle: () => act(() => new Promise((resolve) => setTimeout(resolve, 150))),
    });
    const grid = slot.querySelector('[data-testid="spreadsheet-grid"]');
    const editable = dom.window.document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    await act(async () => {
      grid.querySelector(".univer-spreadsheet-instance").append(editable);
    });
    return {
      inert: grid.hasAttribute("inert"),
      ariaReadOnly: grid.getAttribute("aria-readonly"),
      calls: calls.filter(([kind]) => kind !== "plugin"),
      plugins: calls.filter(([kind]) => kind === "plugin").map(([, name]) => name),
      editableInputMode: editable.getAttribute("inputmode"),
    };
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

// @verifies-requirement HALL-FR-LAY-180
test("on a phone the grid takes the touch interface and no text area of the library opens the keyboard", async () => {
  const reader = await renderAdapter(true, true);
  assert.deepEqual(reader.plugins, ["UniverMobileUIPlugin", "UniverSheetsMobileUIPlugin"]);
  assert.equal(reader.editableInputMode, "none");
});

test("on a tablet or a computer the grid keeps the interface and the keyboard of the library", async () => {
  const writer = await renderAdapter(false);
  assert.deepEqual(writer.plugins, ["UniverUIPlugin", "UniverSheetsUIPlugin"]);
  assert.equal(writer.editableInputMode, null);
});

const cellEditorMutation = { type: 2, id: "doc.mutation.rich-text-editing", params: { unitId: "__INTERNAL_EDITOR__" } };
const workbookMutation = { type: 2, id: "sheet.mutation.set-range-values", params: { unitId: "w" } };

// @verifies-requirement HALL-FR-LAY-180
test("opening a spreadsheet and recreating its grid at another width writes nothing", async () => {
  let written = null;
  await renderAdapter(false, false, async ({ changes, fire, setPhone, settle }) => {
    await fire(cellEditorMutation);
    await settle();
    await setPhone(true);
    await fire(cellEditorMutation);
    await settle();
    await setPhone(false);
    await settle();
    written = changes.length;
  });
  assert.equal(written, 0);
});

// @verifies-requirement HALL-FR-LAY-180
test("a real change of the workbook is published, even when the grid is recreated before its delay", async () => {
  let written = null;
  await renderAdapter(false, false, async ({ changes, content, fire, setPhone, settle }) => {
    content.cells.A2 = "Changé";
    await fire(workbookMutation);
    await setPhone(true);
    await settle();
    written = changes.map((document) => document.workbook.cells.A2);
  });
  assert.deepEqual(written, ["Changé"]);
});

const formulaResult = {
  type: 2,
  id: "sheet.mutation.set-range-values",
  params: { unitId: "w" },
  options: { onlyLocal: true, fromFormula: true, applyFormulaCalculationResult: true },
};

// @verifies-requirement HALL-FR-LAY-180
test("the formula results the library computes at opening write nothing; a change of the person carries them", async () => {
  let written = null;
  let afterChange = null;
  await renderAdapter(false, false, async ({ changes, content, fire, settle }) => {
    content.cells.E2 = 40;
    await fire(formulaResult);
    await settle();
    written = changes.length;
    content.cells.C2 = 21;
    await fire(workbookMutation);
    content.cells.E2 = 42;
    await fire(formulaResult);
    await settle();
    afterChange = changes.map((document) => [document.workbook.cells.C2, document.workbook.cells.E2]);
  });
  assert.equal(written, 0);
  assert.deepEqual(afterChange, [[21, 42]]);
});

const cell = { sheetId: "s", row: 0, column: 0, name: "A1", display: "", input: "", bold: false, italic: false };

/** Publishes the content saved after a person's action followed by a result the library computes and applies locally. */
async function savedAfter(action) {
  let written = null;
  await renderAdapter(false, false, async (context) => {
    context.content.cells.E2 = 40;
    await context.fire(formulaResult);
    await context.settle();
    await action(context);
    context.content.cells.E3 = 4242;
    await context.fire(formulaResult);
    await context.settle();
    written = context.changes.map((document) => document.workbook.cells.E3);
  });
  return written;
}

// @verifies-requirement HALL-FR-LAY-180
test("every way a person changes the spreadsheet is saved, whatever the library marks on its mutations", async () => {
  const paths = {
    "cell field of the phone": ({ engine }) => engine.cells.write(cell, "4242"),
    "tools of the phone": ({ engine }) => engine.cells.run("bold"),
    "row and column commands": ({ engine }) => engine.cells.run("deleteRow"),
    "touch or click in the grid": ({ gesture }) => gesture("pointerdown"),
    "keyboard in the grid": ({ gesture }) => gesture("keydown"),
    paste: ({ gesture }) => gesture("paste"),
    undo: ({ undo }) => undo(),
  };
  for (const [path, action] of Object.entries(paths))
    assert.deepEqual(await savedAfter(action), [4242], `${path} is saved`);
});

// @verifies-requirement HALL-FR-LAY-180
test("a change still waiting for its delay is published at once before a save and when writing ends", async () => {
  let flushed = null;
  let ended = null;
  await renderAdapter(false, false, async ({ changes, content, engine, fire, setReadOnly }) => {
    content.cells.C2 = 4242;
    await fire(workbookMutation);
    engine.flush();
    flushed = changes.length;
    content.cells.C3 = 21;
    await fire(workbookMutation);
    await setReadOnly(true);
    ended = changes.length;
  });
  assert.equal(flushed, 1, "the save that follows « Terminé » carries the change");
  assert.equal(ended, 2, "returning to reading publishes the change before the grid is locked");
});
