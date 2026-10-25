// @vitest-environment jsdom
import assert from "node:assert/strict";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { test, vi } from "vitest";
import { GeographicCompositionEditor } from "../src/features/geographic/GeographicCompositionEditor.tsx";
import { GeographicFeatureCard } from "../src/features/geographic/GeographicFeatureCard.tsx";
import { geographicFeatureStyle } from "../src/features/geographic/geographicOpenLayersAdapter.ts";
import { drawingMeasureStyle } from "../src/features/geographic/useGeographicMeasurements.ts";

vi.mock("../src/i18n/I18nProvider.tsx", () => ({
  useI18n: () => ({ t: (key) => key, formatDate: (value) => value }),
}));

// @verifies-requirement HALL-FR-DOC-380
test("a feature card keeps the data properties but omits generated geographic extent", () => {
  const markup = renderToStaticMarkup(
    createElement(GeographicFeatureCard, {
      feature: {
        featureKey: { kind: "none" },
        key: "A 221",
        label: "A 221",
        layerId: "cadastre",
        position: 0,
        properties: { usage: "verger" },
        propertyKeys: ["usage"],
        extent: [4.5, 47.54, 4.51, 47.55],
      },
      layerName: "Parcelles",
      note: null,
      notesLoading: false,
      canCreateNote: false,
      creatingNote: false,
      municipal: { isMunicipal: false, sourceLabel: null, sourceImportedAt: null, municipalOnly: null },
      onCreateNote: () => undefined,
      onMunicipalOnly: () => undefined,
      onCenter: () => undefined,
      onClose: () => undefined,
    }),
  );
  assert.match(markup, /verger/);
  assert.doesNotMatch(markup, /geographicFeature\.extent|47\.540000|4\.500000/);
});

// @verifies-requirement HALL-FR-DOC-490
test("read-only Elements list exposes selection and measurements without editing actions", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const previousObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    observe() {
      return undefined;
    }
    disconnect() {
      return undefined;
    }
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const selected = [];
  const measured = [];
  const feature = (id, kind) => ({ id, properties: { kind, label: id, visible: true, style: {} } });
  const props = {
    readOnly: true,
    panelRef: { current: null },
    drawTool: "select",
    features: [feature("triangle", "area"), feature("pin", "marker")],
    selectedFeatureId: null,
    modifyingFeatureId: null,
    editingFeatureId: null,
    renameArmedFeatureId: null,
    featureKindLabels: { area: "Area", line: "Line", marker: "Marker" },
    colorPresets: [],
    measuredDrawingIds: new Set(),
    legend: [],
    onDrawTool: () => undefined,
    onSelect: (id) => selected.push(id),
    onEditingFeature: () => undefined,
    onRenameArmedFeature: () => undefined,
    onRename: async () => true,
    onVisibility: () => undefined,
    onFitFeature: () => undefined,
    onColor: () => undefined,
    onDelete: () => undefined,
    onDrawingMeasures: (id, visible) => measured.push([id, visible]),
    onToggleModifying: () => undefined,
    onLegend: () => undefined,
    onPointerDown: () => undefined,
    onPointerMove: () => undefined,
    onPointerUp: () => undefined,
  };
  try {
    await act(async () => root.render(createElement(GeographicCompositionEditor, props)));
    assert.equal(host.querySelector("[data-testid=geographic-tool-area]"), null);
    assert.equal(host.querySelector(".geographic-composition-feature-color"), null);
    assert.equal(host.querySelector(".geographic-composition-feature-menu"), null);
    assert.equal(host.querySelector("[data-testid=geographic-composition-feature-measures-pin]"), null);
    await act(async () => host.querySelector(".geographic-composition-feature-name").click());
    await act(async () => host.querySelector("[data-testid=geographic-composition-feature-measures-triangle]").click());
    assert.deepEqual(selected, ["triangle"]);
    assert.deepEqual(measured, [["triangle", true]]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.ResizeObserver = previousObserver;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});

// @verifies-requirement HALL-FR-DOC-420
test("drawing labels use the 14px body-size token and keep their light halo", () => {
  document.documentElement.style.setProperty("--hall-font-size-body", "14px");
  document.documentElement.style.setProperty("--hall-color-text", "#111111");
  document.documentElement.style.setProperty("--hall-color-surface", "#ffffff");
  const feature = new Feature(new Point([0, 0]));
  feature.setProperties({ kind: "marker", label: "Site", style: { color: "#2255aa", size: "medium" } });
  const style = geographicFeatureStyle(feature);
  const label = (Array.isArray(style) ? style[0] : style).getText();
  assert.match(label.getFont(), /14px/);
  assert.equal(label.getStroke().getWidth(), 3);

  const area = new Feature(
    new Polygon([
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [0, 0],
      ],
    ]),
  );
  area.setId("area");
  const measureStyle = drawingMeasureStyle((value) => String(value), new Set(["area"]));
  const measurementLabels = measureStyle(area).filter((entry) => entry.getText());
  assert.ok(measurementLabels.length >= 3);
  for (const entry of measurementLabels) {
    assert.match(entry.getText().getFont(), /14px/);
    assert.equal(entry.getText().getStroke().getWidth(), 4);
  }
  document.documentElement.style.setProperty("--hall-font-size-body", "16px");
  const updatedLabels = measureStyle(area).filter((entry) => entry.getText());
  assert.notStrictEqual(updatedLabels[0], measurementLabels[0]);
  assert.match(updatedLabels[0].getText().getFont(), /16px/);
  document.documentElement.style.removeProperty("--hall-font-size-body");
});
