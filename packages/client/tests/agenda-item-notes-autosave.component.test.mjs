import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, test } from "vitest";

// @verifies-requirement HALL-FR-MTG-380
const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const names = ["window", "document", "navigator", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"];
let temporary;
let originals;
let useAgendaItemNotesAutosave;
let delay;

beforeAll(async () => {
  temporary = mkdtempSync(join(clientRoot, ".tmp-agenda-notes-"));
  const entry = join(temporary, "entry.ts");
  const output = join(temporary, "entry.mjs");
  writeFileSync(
    entry,
    `export { useAgendaItemNotesAutosave, AGENDA_ITEM_NOTES_AUTOSAVE_DELAY_MS } from ${JSON.stringify(join(clientRoot, "src/hooks/useAgendaItemNotesAutosave.ts"))};\n`,
  );
  await build({
    entryPoints: [entry],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    logLevel: "silent",
  });
  ({ useAgendaItemNotesAutosave, AGENDA_ITEM_NOTES_AUTOSAVE_DELAY_MS: delay } = await import(
    pathToFileURL(output).href
  ));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/app/" });
  originals = Object.fromEntries(names.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
});

afterAll(() => {
  for (const [key, descriptor] of Object.entries(originals ?? {})) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  if (temporary) rmSync(temporary, { recursive: true, force: true });
});

function mountNotes(initial) {
  const saves = [];
  const view = { current: null, props: { ...initial } };
  const save = async (itemId, notes, options) => {
    saves.push({ itemId, notes, clearConfirmed: options.clearConfirmed });
    return true;
  };
  function Probe(props) {
    view.current = useAgendaItemNotesAutosave({ ...props, save });
    return null;
  }
  const root = createRoot(document.getElementById("root"));
  const render = async (changes = {}) => {
    view.props = { ...view.props, ...changes };
    await act(async () => root.render(createElement(Probe, view.props)));
  };
  return { view, saves, render, unmount: () => act(async () => root.unmount()) };
}

async function wait(milliseconds) {
  await act(async () => {
    await new Promise((resolveWait) => window.setTimeout(resolveWait, milliseconds));
  });
}

test("a view that the user did not edit adopts every server text and sends nothing", async () => {
  const notes = mountNotes({ itemId: "item-1", serverText: "", active: true });
  await notes.render();
  await notes.render({ serverText: "Texte de l'autre vue" });
  assert.equal(notes.view.current.text, "Texte de l'autre vue");
  await notes.render({ serverText: "Texte de l'autre vue, suite" });
  await wait(delay + 200);
  assert.equal(notes.view.current.text, "Texte de l'autre vue, suite");
  assert.deepEqual(notes.saves, []);
  assert.equal(await act(() => notes.view.current.flush()), true);
  assert.deepEqual(notes.saves, []);
  await notes.unmount();
});

test("typed text is saved once after the delay, then the view follows the server again", async () => {
  const notes = mountNotes({ itemId: "item-1", serverText: "Début", active: true });
  await notes.render();
  await act(async () => notes.view.current.edit("Début et suite"));
  await notes.render({ serverText: "Texte d'une autre vue" });
  assert.equal(notes.view.current.text, "Début et suite", "unsaved typing is kept");
  await wait(delay + 200);
  assert.deepEqual(notes.saves, [{ itemId: "item-1", notes: "Début et suite", clearConfirmed: false }]);
  await notes.render({ serverText: "Début et suite" });
  await notes.render({ serverText: "Texte suivant d'une autre vue" });
  assert.equal(notes.view.current.text, "Texte suivant d'une autre vue");
  await wait(delay + 200);
  assert.equal(notes.saves.length, 1, "a server change never triggers a save");
  await notes.unmount();
});

test("only a deliberate clear by the user carries the clear confirmation", async () => {
  const notes = mountNotes({ itemId: "item-1", serverText: "Notes", active: true });
  await notes.render();
  await act(async () => notes.view.current.edit(""));
  assert.equal(await act(() => notes.view.current.flush()), true);
  assert.deepEqual(notes.saves, [{ itemId: "item-1", notes: "", clearConfirmed: true }]);
  await notes.unmount();
});

test("no save leaves after the item leaves discussion or another item is selected", async () => {
  const notes = mountNotes({ itemId: "item-1", serverText: "", active: true });
  await notes.render();
  await act(async () => notes.view.current.edit("Saisie avant clôture"));
  assert.equal(await act(() => notes.view.current.flush()), true, "the typed text is saved before completion");
  assert.equal(notes.saves.length, 1);
  await act(async () => notes.view.current.edit("Saisie tardive"));
  await notes.render({ active: false });
  await wait(delay + 200);
  assert.equal(notes.saves.length, 1, "a completed item receives no further save");
  await notes.render({ active: true, itemId: "item-2", serverText: "Point suivant" });
  await act(async () => notes.view.current.edit("Point suivant, notes"));
  await notes.render({ itemId: "item-3", serverText: "" });
  await wait(delay + 200);
  assert.equal(notes.saves.length, 1, "changing the selected item cancels the pending save");
  assert.equal(notes.view.current.text, "");
  await notes.unmount();
});
