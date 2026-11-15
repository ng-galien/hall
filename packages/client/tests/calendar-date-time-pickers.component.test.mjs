import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { act, createElement, useState } from "react";
import { afterAll, beforeAll, test } from "vitest";

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const emptyCss = {
  name: "empty-css",
  setup(builder) {
    builder.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: "empty-css" }));
    builder.onLoad({ filter: /.*/, namespace: "empty-css" }, () => ({ contents: "", loader: "css" }));
  },
};
const names = [
  "window",
  "document",
  "navigator",
  "localStorage",
  "HTMLElement",
  "HTMLFormElement",
  "HTMLInputElement",
  "HTMLButtonElement",
  "DocumentFragment",
  "Text",
  "Element",
  "SVGElement",
  "Node",
  "MutationObserver",
  "ResizeObserver",
  "Event",
  "MouseEvent",
  "CustomEvent",
  "FocusEvent",
  "UIEvent",
  "KeyboardEvent",
  "PointerEvent",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "IS_REACT_ACT_ENVIRONMENT",
];
let temporary;
let dom;
let modules;
let createRoot;
let originals;

beforeAll(async () => {
  temporary = mkdtempSync(join(clientRoot, ".tmp-calendar-pickers-"));
  const entry = join(temporary, "entry.ts");
  const output = join(temporary, "entry.mjs");
  writeFileSync(
    entry,
    `export { DatePicker } from ${JSON.stringify(join(clientRoot, "src/components/ui/date-picker.tsx"))};\n` +
      `export { DayField, TimeField } from ${JSON.stringify(join(clientRoot, "src/features/calendar/EventScheduleFields.tsx"))};\n` +
      `export { I18nProvider } from ${JSON.stringify(join(clientRoot, "src/i18n/I18nProvider.tsx"))};\n`,
  );
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
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/app/", pretendToBeVisual: true });
  dom.window.matchMedia = (media) => ({
    media,
    matches: false,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  dom.window.ResizeObserver = class {
    observe() {
      return undefined;
    }
    unobserve() {
      return undefined;
    }
    disconnect() {
      return undefined;
    }
  };
  dom.window.HTMLElement.prototype.scrollIntoView = () => undefined;
  dom.window.HTMLElement.prototype.hasPointerCapture = () => false;
  dom.window.HTMLElement.prototype.releasePointerCapture = () => undefined;
  dom.window.PointerEvent ??= dom.window.MouseEvent;
  originals = Object.fromEntries(names.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of names) {
    if (key === "IS_REACT_ACT_ENVIRONMENT") globalThis[key] = true;
    else
      Object.defineProperty(globalThis, key, {
        configurable: true,
        writable: true,
        value: key === "window" ? dom.window : dom.window[key],
      });
  }
  modules = await import(pathToFileURL(output).href);
  ({ createRoot } = await import("react-dom/client"));
});

afterAll(() => {
  for (const key of names) {
    if (originals[key]) Object.defineProperty(globalThis, key, originals[key]);
    else delete globalThis[key];
  }
  dom?.window.close();
  if (temporary) rmSync(temporary, { recursive: true, force: true });
});

async function render(element) {
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(modules.I18nProvider, null, element)));
  return {
    query: (selector) => dom.window.document.querySelector(selector),
    queryAll: (selector) => [...dom.window.document.querySelectorAll(selector)],
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const click = async (element) => {
  await act(async () => element.click());
};

// @verifies-requirement HALL-FR-CAL-230
test("the date picker reaches a day of another month and year in a few touches, Monday first", async () => {
  const chosen = [];
  const view = await render(
    createElement(modules.DatePicker, { value: "2026-11-17", testId: "picker", onSelect: (day) => chosen.push(day) }),
  );
  const days = view.queryAll('[data-testid^="picker-day-"]');
  assert.equal(days.length, 42);
  assert.equal(
    days[0].dataset.testid,
    "picker-day-2026-10-26",
    "the grid of November 2026 starts on Monday 26 October",
  );
  assert.equal(view.query('[data-testid="picker-day-2026-11-17"]').getAttribute("aria-pressed"), "true");
  await click(view.query('[data-testid="picker-heading"]'));
  assert.equal(view.queryAll('[data-testid^="picker-month-"]').length, 12, "the heading opens the twelve months");
  await click(view.query('[data-testid="picker-next"]'));
  await click(view.query('[data-testid="picker-month-2027-03"]'));
  await click(view.query('[data-testid="picker-day-2027-03-09"]'));
  assert.deepEqual(chosen, ["2027-03-09"]);
  await view.unmount();
});

test("the date picker at the level of a month returns the first day of the chosen month", async () => {
  const chosen = [];
  const view = await render(
    createElement(modules.DatePicker, {
      value: "2026-11-15",
      level: "month",
      testId: "picker",
      onSelect: (day) => chosen.push(day),
    }),
  );
  await click(view.query('[data-testid="picker-previous"]'));
  await click(view.query('[data-testid="picker-month-2025-06"]'));
  assert.deepEqual(chosen, ["2025-06-01"]);
  await view.unmount();
});

// @verifies-requirement HALL-FR-CAL-130
// @verifies-requirement HALL-FR-CAL-230
test("the day and the hour of an appointment are chosen without any date or time input of the browser", async () => {
  const changes = [];
  function Schedule() {
    const [day, setDay] = useState("2026-11-17");
    const [time, setTime] = useState("09:00");
    return createElement(
      "div",
      null,
      createElement(modules.DayField, {
        label: "Début",
        value: day,
        readOnly: false,
        testId: "start-date",
        onChange: (next) => {
          changes.push(next);
          setDay(next);
        },
      }),
      createElement(modules.TimeField, {
        label: "Heure de fin",
        value: time,
        readOnly: false,
        testId: "end-time",
        durationFrom: "08:30",
        onChange: setTime,
      }),
    );
  }
  const view = await render(createElement(Schedule));
  assert.equal(view.queryAll('input[type="date"], input[type="time"], input[type="datetime-local"]').length, 0);
  const trigger = view.query('[data-testid="start-date"]');
  assert.equal(trigger.tagName, "BUTTON");
  assert.match(trigger.textContent, /17 (novembre|November)/);
  await click(trigger);
  await click(view.query('[data-testid="start-date-picker-day-2026-11-24"]'));
  assert.deepEqual(changes, ["2026-11-24"]);
  assert.match(view.query('[data-testid="start-date"]').textContent, /24 (novembre|November)/);
  assert.equal(view.query('[data-testid="end-time"]').textContent, "9 h 00");
  await act(async () => {
    view
      .query('[data-testid="end-time"]')
      .dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  });
  const options = view.queryAll('[data-testid^="end-time-option-"]');
  assert.equal(options.length, 96, "every quarter hour of the day is proposed");
  assert.ok(
    options.every((option) => /-(00|15|30|45)$/.test(option.dataset.testid)),
    "the minutes proposed are 00, 15, 30 and 45",
  );
  assert.match(view.query('[data-testid="end-time-option-10-00"]').textContent, /1 h 30/);
  await view.unmount();
});
