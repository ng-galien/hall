// @vitest-environment jsdom
import assert from "node:assert/strict";
import { fromLonLat, toLonLat } from "ol/proj";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { test, vi } from "vitest";
import { useGeographicMapRuntime } from "../src/features/geographic/useGeographicMapRuntime.ts";

// @verifies-requirement HALL-FR-WSP-330
// @verifies-requirement HALL-FR-WSP-350
test("incoming framing updates the existing view without resetting internal navigation or sources", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "ResizeObserver",
    class {
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
  );
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const first = { kind: "center", center: [4.5, 47.54], zoom: 17 };
  const incoming = { kind: "center", center: [4.51, 47.55], zoom: 18 };
  let runtime;
  let displayed;
  const noop = () => undefined;
  const options = {
    resourceId: "incoming-view-fixture",
    draftLayers: [],
    canUpdate: false,
    embedded: false,
    workspaceMode: "map",
    drawTool: "select",
    hallLayerVisible: true,
    featureKindLabels: { area: "Area", line: "Line", marker: "Marker" },
    updateDraft: noop,
    onDrawTool: noop,
    onSelection: noop,
    onFeatureCreated: noop,
    onViewChange: (view) => {
      displayed = view;
    },
  };
  function MapContent({ view, request }) {
    runtime = useGeographicMapRuntime({
      ...options,
      requestedView: request,
      data: {
        view,
        layers: [],
        hallLayer: { type: "FeatureCollection", features: [] },
      },
    });
    return createElement("div", { ref: runtime.mapElementRef });
  }
  const show = (view, request) => act(async () => root.render(createElement(MapContent, { view, request })));
  try {
    await show(first, first);
    const map = runtime.map;
    const source = runtime.drawingSource;
    const view = map.getView();
    const tileSources = map
      .getLayers()
      .getArray()
      .map((layer) => layer.getSource());
    await show(incoming, incoming);
    assert.deepEqual(view.getCenter(), fromLonLat(incoming.center));
    assert.equal(view.getZoom(), incoming.zoom);
    assert.equal(runtime.map, map);
    assert.equal(runtime.drawingSource, source);
    assert.equal(map.getView(), view);
    assert.deepEqual(
      map
        .getLayers()
        .getArray()
        .map((layer) => layer.getSource()),
      tileSources,
    );
    assert.ok(Math.abs(displayed.center[0] - incoming.center[0]) < 1e-9);
    assert.equal(displayed.zoom, incoming.zoom);
    // An unrelated render with the same input framing must preserve a user's subsequent pan/zoom.
    view.setCenter(fromLonLat([4.52, 47.56]));
    view.setZoom(19);
    await act(async () => map.dispatchEvent("moveend"));
    await show({ ...incoming, center: [...incoming.center] }, incoming);
    assert.deepEqual(
      toLonLat(view.getCenter()).map((n) => Number(n.toFixed(6))),
      [4.52, 47.56],
    );
    assert.equal(view.getZoom(), 19);
    assert.equal(displayed.zoom, 19);
    // A fresh explicit request may restore the same framing after internal navigation.
    await show(incoming, { ...incoming, center: [...incoming.center] });
    assert.deepEqual(view.getCenter(), fromLonLat(incoming.center));
    assert.equal(view.getZoom(), incoming.zoom);
    // Browser history can restore an earlier framing on the same resource.
    await show(first, first);
    assert.deepEqual(view.getCenter(), fromLonLat(first.center));
    assert.equal(view.getZoom(), first.zoom);
    assert.equal(runtime.map, map);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});
