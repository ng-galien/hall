import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { act, createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// @verifies-requirement HALL-FR-MTG-320
test("a passive reader returns to the server's current item after conduct events and reconnection", async () => {
  const temporary = mkdtempSync(join(clientRoot, "scripts", ".tmp-meeting-live-follow-"));
  const entry = join(temporary, "entry.ts");
  const output = join(temporary, "entry.mjs");
  writeFileSync(
    entry,
    `export { useConductAgendaSelection } from ${JSON.stringify(join(clientRoot, "src/pages/council-meetings/live/useConductAgendaSelection.ts"))};\n` +
      `export { subscribeLiveUpdates } from ${JSON.stringify(join(clientRoot, "src/services/liveUpdates.ts"))};\n`,
  );
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/app/" });
  const globals = ["window", "document", "WebSocket", "HTMLElement", "Event", "IS_REACT_ACT_ENVIRONMENT"];
  const originals = Object.fromEntries(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const sockets = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      sockets.push(this);
    }
    addEventListener(type, listener) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
    emit(type, event = {}) {
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
    close() {}
  }
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    WebSocket: FakeWebSocket,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  const meetingId = "11111111-1111-4111-8111-111111111111";
  const itemA = { id: "item-a", position: 1, status: "inProgress" };
  const itemB = { id: "item-b", position: 2, status: "scheduled" };
  let canonicalItems = [itemA, itemB];
  let reads = 0;
  let root;
  try {
    await build({
      entryPoints: [entry],
      outfile: output,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      logLevel: "silent",
    });
    const { useConductAgendaSelection, subscribeLiveUpdates } = await import(pathToFileURL(output).href);
    function Reader() {
      const [items, setItems] = useState(canonicalItems);
      const [liveRevision, setLiveRevision] = useState(0);
      const selection = useConductAgendaSelection(items, liveRevision);
      useEffect(() => {
        const reread = () => {
          reads += 1;
          setItems(canonicalItems);
          setLiveRevision((revision) => revision + 1);
        };
        return subscribeLiveUpdates({ kind: "meeting", id: meetingId }, reread, reread);
      }, []);
      return createElement(
        "div",
        null,
        createElement("output", { "data-testid": "selected-item" }, selection.openingSelected ? "opening" : selection.selectedItem?.id),
        createElement("button", { "data-testid": "choose-a", onClick: () => selection.setSelectedItemId(itemA.id) }, "A"),
        createElement("button", { "data-testid": "choose-b", onClick: () => selection.setSelectedItemId(itemB.id) }, "B"),
      );
    }
    root = createRoot(dom.window.document.getElementById("root"));
    await act(async () => root.render(createElement(Reader)));
    const selected = () => dom.window.document.querySelector('[data-testid="selected-item"]').textContent;
    const choose = async (name) => act(async () => dom.window.document.querySelector(`[data-testid="choose-${name}"]`).click());
    assert.equal(sockets.length, 1);
    assert.equal(new URL(sockets[0].url).searchParams.get("id"), meetingId);
    await act(async () => sockets[0].emit("open"));
    assert.equal(selected(), itemA.id);
    await choose("b");
    assert.equal(selected(), itemB.id, "the reader can navigate between conduct signals");
    await choose("a");

    canonicalItems = [
      { ...itemA, status: "examined" },
      { ...itemB, status: "inProgress" },
    ];
    await act(async () =>
      sockets[0].emit("message", { data: JSON.stringify({ type: "meeting.changed", meetingId }) }),
    );
    assert.equal(reads, 2, "opening and the conduct event reread the canonical server state");
    assert.equal(selected(), itemB.id, "the newly current point takes priority over the reader's old position");

    await choose("a");
    assert.equal(selected(), itemA.id);
    sockets[0].emit("close");
    const reconnectDeadline = Date.now() + 2000;
    while (sockets.length < 2 && Date.now() < reconnectDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(sockets.length, 2, "the subscription reconnects");
    await act(async () => sockets[1].emit("open"));
    assert.equal(reads, 3, "reconnection rereads the canonical server state");
    assert.equal(selected(), itemB.id, "the current point also retakes priority after reconnection");
  } finally {
    if (root) await act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
    rmSync(temporary, { recursive: true, force: true });
  }
});
