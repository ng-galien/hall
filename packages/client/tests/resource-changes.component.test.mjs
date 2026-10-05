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

// @verifies-requirement HALL-FR-DOC-280
test("the separate history control reads the server on demand without changing cloud autosave", async () => {
  const temporary = mkdtempSync(join(clientRoot, ".tmp-resource-changes-"));
  const entry = join(temporary, "entry.tsx");
  const output = join(temporary, "entry.mjs");
  writeFileSync(
    entry,
    `export { ResourceChangesControl } from ${JSON.stringify(join(clientRoot, "src/features/resources/ResourceChangesControl.tsx"))};\n` +
      `export { ResourceAutosaveToggle } from ${JSON.stringify(join(clientRoot, "src/features/resources/ResourceAutosaveToggle.tsx"))};\n` +
      `export { I18nProvider } from ${JSON.stringify(join(clientRoot, "src/i18n/I18nProvider.tsx"))};\n` +
      `export { TooltipProvider } from ${JSON.stringify(join(clientRoot, "src/components/ui/tooltip.tsx"))};\n`,
  );
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/app/" });
  const names = [
    "window",
    "document",
    "navigator",
    "localStorage",
    "fetch",
    "WebSocket",
    "HTMLElement",
    "Element",
    "SVGElement",
    "HTMLInputElement",
    "Node",
    "NodeFilter",
    "MutationObserver",
    "ResizeObserver",
    "Event",
    "CustomEvent",
    "MouseEvent",
    "KeyboardEvent",
    "getComputedStyle",
    "IS_REACT_ACT_ENVIRONMENT",
  ];
  const originals = Object.fromEntries(names.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
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
    close() {
      return undefined;
    }
  }
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    localStorage: dom.window.localStorage,
    WebSocket: FakeWebSocket,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    SVGElement: dom.window.SVGElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    MutationObserver: dom.window.MutationObserver,
    ResizeObserver: class {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    },
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    MouseEvent: dom.window.MouseEvent,
    KeyboardEvent: dom.window.KeyboardEvent,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  dom.window.localStorage.setItem("mairie.locale", "en");
  const resourceId = "22222222-2222-4222-8222-222222222222";
  const actorId = "33333333-3333-4333-8333-333333333333";
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(url);
    assert.equal(url, `/api/resources/${resourceId}/changes`);
    return new Response(
      JSON.stringify({
        properties: {
          resourceId,
          changes: [
            {
              actor: { id: actorId, displayName: "Alice Martin" },
              kind: "content",
              fields: ["content"],
              occurredAt: "2026-09-18T10:00:00.000Z",
            },
          ],
        },
        links: [{ rel: ["self"], href: url }],
      }),
      { headers: { "content-type": "application/vnd.siren+json" } },
    );
  };
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
    const { ResourceChangesControl, ResourceAutosaveToggle, I18nProvider, TooltipProvider } = await import(
      pathToFileURL(output).href
    );
    const representation = {
      properties: { id: resourceId },
      links: [
        { rel: ["self"], href: `/api/resources/${resourceId}` },
        { rel: ["changes"], href: `/api/resources/${resourceId}/changes` },
      ],
    };
    let autosaveChanges = 0;
    let invalidations = 0;
    root = createRoot(dom.window.document.getElementById("root"));
    await act(async () => {
      root.render(
        createElement(
          I18nProvider,
          null,
          createElement(
            TooltipProvider,
            null,
            createElement(ResourceAutosaveToggle, {
              enabled: true,
              status: "saved",
              onChange: () => autosaveChanges++,
            }),
            createElement(ResourceChangesControl, {
              resourceId,
              representation,
              onInvalidated: () => invalidations++,
            }),
          ),
        ),
      );
    });
    const cloud = dom.window.document.querySelector('[data-testid="resource-autosave-toggle"]');
    const history = dom.window.document.querySelector('[data-testid="resource-changes-trigger"]');
    assert.ok(cloud);
    assert.ok(history);
    assert.notEqual(cloud, history);
    assert.equal(requests.length, 0, "history is not fetched at mount");
    await act(async () => cloud.click());
    assert.equal(autosaveChanges, 1);
    assert.equal(requests.length, 0);
    await act(async () => history.focus());
    assert.equal(requests.length, 1, "focus loads the history preview on demand");
    await act(async () => history.click());
    assert.equal(autosaveChanges, 1, "history activation leaves autosave unchanged");
    assert.equal(requests.length, 1);
    const panel = dom.window.document.querySelector('[data-testid="resource-changes-panel"]');
    assert.ok(panel, dom.window.document.body.innerHTML);
    assert.match(panel.textContent, /Alice Martin/);
    assert.match(panel.textContent, /content/);
    assert.equal(panel.querySelectorAll('[data-testid="resource-changes-item"]').length, 1);
    await act(async () => {
      sockets[0].emit("message", {
        data: JSON.stringify({
          type: "resource.changed",
          resourceId,
          actor: { id: actorId, displayName: "Alice Martin" },
          origin: null,
        }),
      });
    });
    assert.equal(invalidations, 1);
    assert.equal(requests.length, 2, "an open panel refreshes after a resource event");
  } finally {
    if (root) await act(async () => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 20));
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
    rmSync(temporary, { recursive: true, force: true });
  }
}, 60_000);
