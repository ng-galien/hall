import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { test } from "vitest";

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sirenType = "application/vnd.siren+json";
const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const actor = { id: "33333333-3333-4333-8333-333333333333", displayName: "Agent A" };

function todayAt(hour) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour).toISOString();
}

function appointment(id, name, start, end, version) {
  return {
    id,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    path: "",
    name,
    fullPath: name,
    kind: "event",
    tags: [],
    state: { readiness: "ready", availability: null },
    createdAt: "2026-11-14T08:00:00.000Z",
    updatedAt: "2026-11-14T08:00:00.000Z",
    autosaveEnabled: true,
    document: { content: "", location: "", participants: [], schedule: { kind: "timed", start, end } },
    version,
  };
}

const emptyCss = {
  name: "empty-css",
  setup(builder) {
    builder.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: "empty-css" }));
    builder.onLoad({ filter: /.*/, namespace: "empty-css" }, () => ({ contents: "", loader: "css" }));
  },
};

// @verifies-requirement HALL-TR-LIV-010
// @verifies-requirement HALL-FR-CAL-210
test("an open calendar shows the appointments another session creates, moves, renames and deletes, and keeps the form being typed", async () => {
  const temporary = mkdtempSync(join(clientRoot, ".tmp-calendar-live-updates-"));
  const entry = join(temporary, "entry.ts");
  const output = join(temporary, "entry.mjs");
  writeFileSync(
    entry,
    `export { CalendarPage } from ${JSON.stringify(join(clientRoot, "src/features/calendar/CalendarPage.tsx"))};\n` +
      `export { useWorkspaceLiveUpdates } from ${JSON.stringify(join(clientRoot, "src/hooks/useWorkspaceLiveUpdates.ts"))};\n` +
      `export { I18nProvider } from ${JSON.stringify(join(clientRoot, "src/i18n/I18nProvider.tsx"))};\n` +
      `export { TooltipProvider } from ${JSON.stringify(join(clientRoot, "src/components/ui/tooltip.tsx"))};\n` +
      `export { ScreenActionsSlotContext, ScreenTitleSlotsContext } from ${JSON.stringify(join(clientRoot, "src/shell/headerTrail.tsx"))};\n`,
  );
  const dom = new JSDOM('<!doctype html><div id="actions"></div><div id="title-commands"></div><div id="root"></div>', {
    url: "http://localhost/app/calendar",
    pretendToBeVisual: true,
  });
  dom.window.matchMedia = (media) => ({
    media,
    matches: false,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  class FakeResizeObserver {
    observe() {
      return undefined;
    }
    unobserve() {
      return undefined;
    }
    disconnect() {
      return undefined;
    }
  }
  dom.window.ResizeObserver = FakeResizeObserver;
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
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "IS_REACT_ACT_ENVIRONMENT",
  ];
  const originals = Object.fromEntries(names.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const sockets = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = String(url);
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
    ResizeObserver: FakeResizeObserver,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    MouseEvent: dom.window.MouseEvent,
    KeyboardEvent: dom.window.KeyboardEvent,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  dom.window.localStorage.setItem("mairie.locale", "en");

  const appointments = new Map([
    [firstId, appointment(firstId, "Weekly review", todayAt(9), todayAt(10), 1)],
  ]);
  const siren = (body) => new Response(JSON.stringify(body), { headers: { "content-type": sirenType } });
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/resources" && !url.search) {
      return siren({
        class: ["resource-collection"],
        properties: {},
        entities: [],
        actions: [{ name: "resource.create", href: "/api/resources", method: "POST" }],
        links: [
          { rel: ["self"], href: "/api/resources?path=" },
          { rel: ["catalog"], href: "/api/resources/catalog" },
        ],
      });
    }
    if (url.pathname === "/api/resources/catalog") {
      return siren({
        class: ["resource-collection"],
        properties: {},
        entities: [...appointments.values()].map(({ id, slug, path, name, fullPath, kind }) => ({
          rel: ["item"],
          class: ["resource"],
          properties: { id, slug, path, name, fullPath, kind },
        })),
        links: [{ rel: ["self"], href: "/api/resources/catalog" }],
      });
    }
    const opened = url.pathname.match(/^\/api\/resources\/([0-9a-f-]{36})$/);
    if (opened && appointments.has(opened[1])) {
      return siren({
        class: ["resource"],
        properties: appointments.get(opened[1]),
        actions: [{ name: "resource.update-content", href: url.pathname, method: "PUT" }],
        links: [{ rel: ["self"], href: url.pathname }],
      });
    }
    if (url.pathname === "/api/council-meetings") {
      return siren({ class: ["council-meeting-collection"], properties: {}, entities: [], links: [] });
    }
    return new Response(JSON.stringify({ status: 404, code: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/problem+json" },
    });
  };

  const shown = () =>
    Object.fromEntries(
      [...dom.window.document.querySelectorAll('[data-testid^="calendar-event-"]')].map((element) => [
        element.dataset.testid.slice("calendar-event-".length),
        element.textContent.replace(/\s+/g, " ").trim(),
      ]),
    );
  const settle = async (milliseconds) => {
    await act(async () => {
      await new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
    });
  };
  const announceChange = async () => {
    await act(async () => {
      sockets[0].emit("message", { data: JSON.stringify({ type: "workspace.changed", actor, origin: null }) });
    });
    await settle(400);
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
      plugins: [emptyCss],
      logLevel: "silent",
    });
    const {
      CalendarPage,
      useWorkspaceLiveUpdates,
      I18nProvider,
      TooltipProvider,
      ScreenActionsSlotContext,
      ScreenTitleSlotsContext,
    } = await import(pathToFileURL(output).href);
    function OpenCalendar() {
      useWorkspaceLiveUpdates();
      return createElement(CalendarPage);
    }
    // react-dom decides at its first load whether the document supports input events, so it loads after jsdom.
    const { createRoot } = await import("react-dom/client");
    root = createRoot(dom.window.document.getElementById("root"));
    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          { initialEntries: ["/calendar"] },
          createElement(
            I18nProvider,
            null,
            createElement(
              TooltipProvider,
              null,
              createElement(
                ScreenActionsSlotContext.Provider,
                { value: dom.window.document.getElementById("actions") },
                createElement(
                  ScreenTitleSlotsContext.Provider,
                  {
                    value: {
                      icon: null,
                      commands: dom.window.document.getElementById("title-commands"),
                      facts: null,
                      hint: null,
                    },
                  },
                  createElement(OpenCalendar),
                ),
              ),
            ),
          ),
        ),
      );
    });
    await settle(300);
    assert.equal(sockets.length, 1);
    assert.match(sockets[0].url, /\/api\/live\?kind=workspace$/);
    await act(async () => sockets[0].emit("open"));
    await act(async () => {
      dom.window.document.querySelector('[data-testid="calendar-view-timeGridDay"]').click();
    });
    await act(async () => {
      dom.window.document.querySelector('[data-testid="calendar-today"]').click();
    });
    await settle(50);
    assert.deepEqual(Object.keys(shown()), [firstId], "the appointment read at opening is shown");
    const hoursBefore = shown()[firstId].split(" Weekly review")[0];

    await act(async () => {
      dom.window.document.querySelector('[data-testid="calendar-new"]').click();
    });
    const draftName = dom.window.document.querySelector('[data-testid="calendar-name"]');
    assert.ok(draftName, "the creation form is open");
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
      setValue.call(draftName, "Typed by the reader");
      draftName.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(draftName.value, "Typed by the reader");

    appointments.set(
      secondId,
      appointment(secondId, "Site visit", todayAt(11), todayAt(12), 1),
    );
    await announceChange();
    assert.ok(shown()[secondId]?.includes("Site visit"), "an appointment created elsewhere appears");

    appointments.set(
      firstId,
      appointment(firstId, "Weekly review moved", todayAt(14), todayAt(15), 2),
    );
    await announceChange();
    assert.match(shown()[firstId] ?? "", /Weekly review moved/, "an appointment renamed elsewhere changes");
    assert.notEqual(
      shown()[firstId].split(" Weekly review")[0],
      hoursBefore,
      "an appointment moved elsewhere changes hours",
    );

    appointments.delete(secondId);
    await announceChange();
    assert.equal(shown()[secondId], undefined, "an appointment deleted elsewhere disappears");

    assert.equal(
      dom.window.document.querySelector('[data-testid="calendar-name"]')?.value,
      "Typed by the reader",
      "the creation form keeps what the reader typed",
    );
  } finally {
    if (root) await act(async () => root.unmount());
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
    rmSync(temporary, { recursive: true, force: true });
  }
}, 60_000);
