// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, test, vi } from "vitest";

import { startBackLayers, useBackLayer } from "../src/lib/backLayers.ts";

/** A stand-in for the router: it listens to the history after the layers, as the router of Hall does. */
const routerPops = [];
let root;
let host;
let screens = 0;

beforeAll(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState({ key: "screen-0", idx: 0 }, "");
  startBackLayers();
  window.addEventListener("popstate", (event) => routerPops.push(event.state));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  await settle();
  routerPops.length = 0;
});

/** Lets the history arrive at its new entry and React render what it changed. */
async function settle() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
}

/** A screen of the router: a new entry at a new address. */
function navigate(path) {
  screens += 1;
  window.history.pushState({ key: `screen-${screens}`, idx: screens }, "", path);
}

function Layer({ name, refuse = false, children }) {
  const [open, setOpen] = useState(true);
  useBackLayer(open, () => {
    if (!refuse) setOpen(false);
  });
  return open
    ? h(
        "section",
        { "data-testid": name },
        h("button", { type: "button", "data-testid": `${name}-close`, onClick: () => setOpen(false) }),
        children,
      )
    : null;
}

async function render(element) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(element));
  await settle();
}

const shown = (name) => document.querySelector(`[data-testid="${name}"]`) !== null;

// @verifies-requirement HALL-FR-LAY-010
test("the back command closes the layer over the screen, one at a time, without changing the screen", async () => {
  navigate("/app/workspace");
  const length = window.history.length;
  const address = window.location.href;
  await render(h(Layer, { name: "sheet" }));
  await act(async () => root.render(h(Layer, { name: "sheet" }, h(Layer, { name: "menu" }))));
  await settle();
  assert.equal(window.history.length, length + 2, "each layer is one step of the history");
  assert.equal(window.location.href, address, "a layer keeps the address of its screen");

  window.history.back();
  await settle();
  assert.equal(shown("menu"), false, "the first back closes the layer on top");
  assert.equal(shown("sheet"), true, "the layer under it stays open");
  window.history.back();
  await settle();
  assert.equal(shown("sheet"), false);
  assert.equal(window.location.href, address);
  assert.deepEqual(routerPops, [], "the router never sees the entries of the layers");

  window.history.forward();
  await settle();
  assert.equal(shown("sheet"), false, "going forward does not open a closed layer again");
  assert.equal(window.history.state.hallLayer, undefined, "forward comes back to the entry of the screen");
  assert.deepEqual(routerPops, []);
});

// @verifies-requirement HALL-FR-LAY-010
test("a layer closed by its own control gives its step of the history back", async () => {
  navigate("/app/calendar");
  const length = window.history.length;
  await render(h(Layer, { name: "form" }));
  await act(async () => document.querySelector('[data-testid="form-close"]').click());
  await settle();
  assert.equal(window.history.state.hallLayer, undefined, "the history is back on the entry of the screen");
  assert.equal(window.history.state.key, `screen-${screens}`);
  window.history.back();
  await settle();
  assert.equal(routerPops.length, 1, "the next back leaves the screen through the router");
  assert.equal(routerPops[0].idx, screens - 1);
  assert.ok(window.history.length >= length);
});

// @verifies-requirement HALL-FR-LAY-010
test("a navigation from a covered screen takes the place of the layer, and back returns to the screen", async () => {
  navigate("/app/meetings");
  const from = screens;
  await render(h(Layer, { name: "more" }));
  navigate("/app/contacts");
  await settle();
  assert.equal(window.history.state.hallLayer, undefined);
  window.history.back();
  await settle();
  assert.equal(routerPops.at(-1)?.idx, from, "back from the new screen returns to the screen, not to the layer");
  assert.equal(window.location.pathname, "/app/meetings");
});

// @verifies-requirement HALL-FR-LAY-010
test("a return started by the application passes over the layers to the previous screen", async () => {
  navigate("/app/minutes");
  navigate("/app/minutes/1");
  await render(h(Layer, { name: "viewer" }));
  window.history.go(-1);
  await settle();
  assert.equal(window.location.pathname, "/app/minutes");
  assert.equal(routerPops.at(-1)?.idx, screens - 1);
});

// @verifies-requirement HALL-FR-LAY-010
test("a layer that stays open after the back command, such as writing that cannot be saved, keeps its step", async () => {
  navigate("/app/workspace?resource=1");
  await render(h(Layer, { name: "writing", refuse: true }));
  window.history.back();
  await settle();
  assert.equal(shown("writing"), true);
  await act(async () => root.render(h(Layer, { name: "writing", refuse: true })));
  await settle();
  assert.notEqual(window.history.state.hallLayer, undefined, "the open layer has an entry again");
  assert.deepEqual(routerPops, []);
});
