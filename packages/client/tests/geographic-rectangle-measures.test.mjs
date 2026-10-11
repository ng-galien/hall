// @vitest-environment jsdom
import assert from "node:assert/strict";
import Feature from "ol/Feature";
import LineString from "ol/geom/LineString";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import VectorSource from "ol/source/Vector";
import { Style } from "ol/style";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { test, vi } from "vitest";
import { GeographicCompositionEditor } from "../src/features/geographic/GeographicCompositionEditor.tsx";
import { MeasureReadout } from "../src/features/geographic/GeographicMeasurePanel.tsx";
import { approximatePolygonExtent, measureGeometry } from "../src/features/geographic/geographicMeasureModel.ts";
import {
  reconcileHallDrawingSource,
  serializeHallLayer,
} from "../src/features/geographic/geographicOpenLayersAdapter.ts";
import {
  drawingMeasureStyle,
  polygonDimensionStyles,
  useGeographicDrawingMeasureLayer,
} from "../src/features/geographic/useGeographicMeasurements.ts";

vi.mock("../src/i18n/I18nProvider.tsx", () => {
  const formatNumber = (value, options) => new Intl.NumberFormat("en-GB", options).format(value);
  return { useI18n: () => ({ formatNumber, t: (key) => key }) };
});

const format = (value, options) => new Intl.NumberFormat("en-GB", options).format(value);
const rectangle = () =>
  new Polygon([
    [
      [0, 0],
      [200, 0],
      [200, 100],
      [0, 100],
      [0, 0],
    ],
  ]);
const drawing = (id, geometry) => {
  const feature = new Feature(geometry);
  feature.setId(id);
  return feature;
};

// @verifies-requirement HALL-FR-DOC-520
test("only requested visible drawings receive labels and rectangles show dimensions first", () => {
  const selected = drawing("rectangle", rectangle());
  const line = drawing(
    "line",
    new LineString([
      [0, 0],
      [200, 0],
    ]),
  );
  const triangle = drawing(
    "triangle",
    new Polygon([
      [
        [0, 0],
        [100, 0],
        [0, 100],
        [0, 0],
      ],
    ]),
  );
  const style = drawingMeasureStyle(format, new Set(["rectangle", "triangle", "line"]));
  assert.match(style(selected)[0].getText().getText(), /ha$/);
  assert.deepEqual(
    style(selected)
      .filter((s) => s.getText())
      .slice(1)
      .map((s) => s.getText().getText()),
    ["200 m", "100 m"],
  );
  assert.equal(style(line).getText().getText(), "200 m");
  assert.equal(style(triangle).filter((s) => s.getText()?.getText().startsWith("≈ ")).length, 2);
  assert.equal(drawingMeasureStyle(format, new Set())(selected), undefined);
  selected.set("visible", false);
  assert.equal(style(selected), undefined);
  const readout = renderToStaticMarkup(
    createElement(MeasureReadout, {
      measure: measureGeometry(rectangle()),
      testId: "rectangle",
    }),
  );
  const identifiers = [...readout.matchAll(/data-testid="rectangle-(width|height|area|perimeter)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(identifiers, ["width", "height", "area", "perimeter"]);
});

// @verifies-requirement HALL-FR-DOC-520
test("the map owns the drawing label layer across panel changes, visibility changes and cleanup", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const selected = drawing("rectangle", rectangle());
  const before = selected.getProperties();
  const source = new VectorSource({ features: [selected] });
  const layers = [];
  const rotationListeners = new Set();
  const view = {
    on: (_event, listener) => rotationListeners.add(listener),
    un: (_event, listener) => rotationListeners.delete(listener),
    getRotation: () => 0,
  };
  const map = {
    getView: () => view,
    addLayer: (layer) => layers.push(layer),
    removeLayer: (layer) => layers.splice(layers.indexOf(layer), 1),
  };
  const ids = new Set(["rectangle"]);
  function MapContent({ panel, visibleIds, visible = true }) {
    useGeographicDrawingMeasureLayer(map, source, visibleIds, visible);
    return createElement("span", null, panel);
  }
  const show = (props) => act(async () => root.render(createElement(MapContent, props)));
  try {
    await show({ panel: "composition", visibleIds: ids });
    assert.equal(layers.length, 1);
    const initialLayer = layers[0];
    assert.equal(rotationListeners.size, 1);
    const revision = initialLayer.getRevision();
    for (const rotate of rotationListeners) rotate();
    assert.ok(initialLayer.getRevision() > revision);
    assert.ok(initialLayer.getStyleFunction()(selected, 1));
    await show({ panel: "measures", visibleIds: ids });
    assert.equal(layers[0], initialLayer);
    await show({ panel: "none", visibleIds: new Set() });
    assert.equal(layers.length, 1);
    assert.equal(layers[0].getStyleFunction()(selected, 1), undefined);
    await show({ panel: "none", visibleIds: ids, visible: false });
    assert.equal(layers[0].getVisible(), false);
    assert.deepEqual(selected.getProperties(), before);
    assert.equal(source.getFeatures().length, 1);
  } finally {
    await act(async () => root.unmount());
    assert.equal(layers.length, 0);
    assert.equal(rotationListeners.size, 0);
    host.remove();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});

// @verifies-requirement HALL-FR-DOC-520
test("rectangle and triangle measure toggles retain one layer and keep independent labels", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const rectangleFeature = drawing("rectangle", rectangle());
  const triangleFeature = drawing(
    "triangle",
    new Polygon([
      [
        [0, 0],
        [120, 0],
        [30, 90],
        [0, 0],
      ],
    ]),
  );
  const source = new VectorSource({ features: [rectangleFeature, triangleFeature] });
  const layers = [];
  let added = 0;
  let removed = 0;
  const view = { on: () => undefined, un: () => undefined, getRotation: () => 0 };
  const map = {
    getView: () => view,
    addLayer: (layer) => {
      added += 1;
      layers.push(layer);
    },
    removeLayer: (layer) => {
      removed += 1;
      layers.splice(layers.indexOf(layer), 1);
    },
  };
  function MapContent({ visibleIds }) {
    useGeographicDrawingMeasureLayer(map, source, visibleIds);
    return null;
  }
  const show = (ids) => act(async () => root.render(createElement(MapContent, { visibleIds: new Set(ids) })));
  const labels = (feature) => {
    const result = layers[0].getStyleFunction()(feature, 1);
    return (
      result &&
      (Array.isArray(result) ? result : [result]).flatMap((style) =>
        style.getText() ? [style.getText().getText()] : [],
      )
    );
  };
  try {
    await show(["rectangle"]);
    const firstLayer = layers[0];
    const firstStyle = firstLayer.getStyleFunction();
    const measureSource = firstLayer.getSource();
    assert.notEqual(measureSource, source);
    assert.equal(measureSource.getFeatures().length, 1);
    assert.notEqual(measureSource.getFeatureById("rectangle"), rectangleFeature);
    assert.equal(measureSource.getFeatureById("rectangle").getGeometry(), rectangleFeature.getGeometry());
    rectangleFeature.setStyle(new Style());
    assert.equal(measureSource.getFeatureById("rectangle").getStyle(), null);
    assert.equal(labels(rectangleFeature).length, 3);
    assert.equal(labels(triangleFeature), undefined);
    await show(["rectangle", "triangle"]);
    assert.equal(labels(rectangleFeature).length, 3);
    assert.match(labels(triangleFeature)[0], /m²$/);
    assert.equal(labels(triangleFeature).filter((label) => label.startsWith("≈ ")).length, 2);
    assert.equal(layers[0], firstLayer);
    assert.equal(layers[0].getStyleFunction(), firstStyle);
    assert.equal(measureSource.getFeatures().length, 2);
    assert.equal(measureSource.getFeatureById("triangle").getGeometry(), triangleFeature.getGeometry());
    await show(["triangle"]);
    assert.equal(measureSource.getFeatures().length, 1);
    assert.equal(labels(rectangleFeature), undefined);
    assert.match(labels(triangleFeature)[0], /m²$/);
    await show(["rectangle", "triangle"]);
    assert.equal(measureSource.getFeatures().length, 2);
    assert.equal(labels(rectangleFeature).length, 3);
    assert.match(labels(triangleFeature)[0], /m²$/);
    const originalGeometry = triangleFeature.getGeometry();
    let annotationChanges = 0;
    measureSource.on("changefeature", () => {
      annotationChanges += 1;
    });
    originalGeometry.translate(5, 0);
    assert.equal(measureSource.getFeatureById("triangle").getGeometry(), originalGeometry);
    assert.ok(annotationChanges > 0);
    const replacement = rectangle();
    triangleFeature.setGeometry(replacement);
    assert.equal(measureSource.getFeatureById("triangle").getGeometry(), replacement);
    triangleFeature.set("visible", false);
    assert.equal(measureSource.getFeatureById("triangle").get("visible"), false);
    triangleFeature.set("visible", true);
    source.removeFeature(triangleFeature);
    assert.equal(measureSource.getFeatureById("triangle"), null);
    source.addFeature(triangleFeature);
    assert.equal(measureSource.getFeatureById("triangle").getGeometry(), replacement);
    assert.equal(added, 1);
    assert.equal(removed, 0);
  } finally {
    await act(async () => root.unmount());
    assert.equal(removed, added);
    host.remove();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});

// @verifies-requirement HALL-FR-DOC-520
test("drawing style work is reused until geometry, scale, rotation or theme changes", () => {
  let rotation = 0;
  const feature = drawing("rectangle", rectangle());
  const style = drawingMeasureStyle(format, new Set(["rectangle"]), () => rotation);
  const initial = style(feature, 1);
  assert.equal(style(feature, 1), initial);
  assert.notEqual(style(feature, 2), initial);
  const atScaleTwo = style(feature, 2);
  rotation = 0.2;
  assert.notEqual(style(feature, 2), atScaleTwo);
  const rotated = style(feature, 2);
  feature.getGeometry().translate(10, 0);
  assert.notEqual(style(feature, 2), rotated);
  const moved = style(feature, 2);
  document.documentElement.style.setProperty("--hall-color-text", "rgb(1, 2, 3)");
  assert.notEqual(style(feature, 2), moved);
  document.documentElement.style.removeProperty("--hall-color-text");
});

// @verifies-requirement HALL-FR-DOC-520
test("composition has one direct accessible measure button per measurable drawing", async () => {
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
  const feature = (id, kind) => ({ id, properties: { kind, label: id, visible: true, style: {} } });
  const features = [feature("rectangle", "area"), feature("triangle", "area"), feature("pin", "marker")];
  const toggled = [];
  const props = {
    panelRef: { current: null },
    drawTool: "select",
    features,
    selectedFeatureId: null,
    modifyingFeatureId: null,
    editingFeatureId: null,
    renameArmedFeatureId: null,
    featureKindLabels: { area: "Area", line: "Line", marker: "Marker" },
    colorPresets: [],
    onDrawTool: () => undefined,
    onSelect: () => undefined,
    onEditingFeature: () => undefined,
    onRenameArmedFeature: () => undefined,
    onRename: async () => true,
    onVisibility: () => undefined,
    onFitFeature: () => undefined,
    onColor: () => undefined,
    onDelete: () => undefined,
    onDrawingMeasures: (id, visible) => toggled.push([id, visible]),
    onToggleModifying: () => undefined,
    legend: [],
    onLegend: () => undefined,
    onPointerDown: () => undefined,
    onPointerMove: () => undefined,
    onPointerUp: () => undefined,
  };
  try {
    await act(async () =>
      root.render(createElement(GeographicCompositionEditor, { ...props, measuredDrawingIds: new Set() })),
    );
    const button = (id) => host.querySelector(`[data-testid="geographic-composition-feature-measures-${id}"]`);
    assert.equal(button("pin"), null);
    assert.equal(button("rectangle")?.getAttribute("aria-pressed"), "false");
    await act(async () => button("rectangle").click());
    assert.deepEqual(toggled, [["rectangle", true]]);
    await act(async () =>
      root.render(createElement(GeographicCompositionEditor, { ...props, measuredDrawingIds: new Set(["rectangle"]) })),
    );
    assert.equal(button("rectangle")?.getAttribute("aria-pressed"), "true");
    assert.equal(button("triangle")?.getAttribute("aria-pressed"), "false");
    await act(async () => button("triangle").click());
    assert.deepEqual(toggled, [
      ["rectangle", true],
      ["triangle", true],
    ]);
    assert.equal(host.querySelector("[role=menuitemcheckbox]"), null);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.ResizeObserver = previousObserver;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});

// @verifies-requirement HALL-FR-DOC-520
test("incoming edits preserve unchanged drawing identity and geometry", () => {
  const first = drawing("first", rectangle());
  const second = drawing("second", rectangle());
  first.set("kind", "area");
  second.set("kind", "area");
  const source = new VectorSource({ features: [first, second] });
  const initial = serializeHallLayer(source);
  const events = [];
  source.on("changefeature", (event) => events.push(String(event.feature.getId())));
  const labelOnly = {
    ...initial,
    features: initial.features.map((feature) =>
      feature.id === "first" ? { ...feature, properties: { ...feature.properties, label: "Updated" } } : feature,
    ),
  };
  const secondGeometry = second.getGeometry();
  reconcileHallDrawingSource(source, labelOnly);
  assert.equal(source.getFeatureById("first"), first);
  assert.equal(source.getFeatureById("second"), second);
  assert.equal(second.getGeometry(), secondGeometry);
  assert.ok(events.includes("first"));
  assert.equal(events.includes("second"), false);
  events.length = 0;
  reconcileHallDrawingSource(source, { ...labelOnly, legend: [] });
  assert.deepEqual(events, []);
  const changedGeometry = {
    ...labelOnly,
    features: labelOnly.features.map((feature) =>
      feature.id === "first"
        ? {
            ...feature,
            geometry: {
              ...feature.geometry,
              coordinates: [[...feature.geometry.coordinates[0].map((point) => [point[0] + 0.0001, point[1]])]],
            },
          }
        : feature,
    ),
  };
  reconcileHallDrawingSource(source, changedGeometry);
  assert.equal(source.getFeatureById("first"), first);
  assert.equal(source.getFeatureById("second"), second);
  assert.equal(second.getGeometry(), secondGeometry);
  assert.equal(events.includes("second"), false);
});

// @verifies-requirement HALL-FR-DOC-520
test("irregular extent dimensions are approximate in model, map label and readout, without changing geometry", () => {
  const irregular = new Polygon([
    [
      [0, 0],
      [100, 0],
      [100, 50],
      [70, 50],
      [0, 40],
      [0, 0],
    ],
  ]);
  const trapezoid = approximatePolygonExtent(
    new Polygon([
      [
        [0, 0],
        [80, 0],
        [70, 20],
        [10, 20],
        [0, 0],
      ],
    ]),
  );
  assert.ok(Math.abs(trapezoid.width - 20) < 0.2);
  assert.ok(Math.abs(trapezoid.length - 80) < 0.2);
  const before = irregular.getCoordinates();
  const extent = approximatePolygonExtent(irregular);
  assert.ok(Math.abs(extent.width - 50) < 0.2);
  assert.ok(Math.abs(extent.length - 100) < 0.2);
  assert.equal(measureGeometry(irregular).rectangleDimensions, undefined);
  const rotated = irregular.clone();
  rotated.rotate(Math.PI / 3, [0, 0]);
  const rotatedExtent = approximatePolygonExtent(rotated);
  assert.ok(Math.abs(rotatedExtent.width - extent.width) < 0.2);
  assert.ok(Math.abs(rotatedExtent.length - extent.length) < 0.2);
  assert.deepEqual(irregular.getCoordinates(), before);
  assert.equal(
    approximatePolygonExtent(
      new Polygon([
        [
          [0, 0],
          [10, 0],
          [20, 0],
          [0, 0],
        ],
      ]),
    ),
    null,
  );
  assert.equal(
    approximatePolygonExtent(
      new Polygon([
        [
          [0, 0],
          [0, 0],
          [0, 0],
        ],
      ]),
    ),
    null,
  );
  assert.equal(
    approximatePolygonExtent(
      new Polygon([
        [
          [0, 0],
          [NaN, 0],
          [0, 10],
          [0, 0],
        ],
      ]),
    ),
    null,
  );
  const recognized = measureGeometry(rectangle());
  assert.ok(recognized.rectangleDimensions);
  assert.equal(recognized.approximateExtent, undefined);
  const readout = renderToStaticMarkup(
    createElement(MeasureReadout, { measure: measureGeometry(irregular), testId: "extent" }),
  );
  assert.match(readout, /geographic.measure.approximateWidth/);
  assert.match(readout, /geographic.measure.approximateLength/);
  assert.match(readout, /data-testid="extent-approximate-width"/);
  assert.match(readout, /data-testid="extent-area"/);
  const feature = drawing("irregular", irregular);
  const styles = drawingMeasureStyle(format, new Set(["irregular"]))(feature, 1);
  assert.match(styles[0].getText().getText(), /m²$/);
  assert.deepEqual(
    styles
      .filter((s) => s.getText())
      .slice(1)
      .map((s) => s.getText().getText())
      .sort(),
    ["≈ 100 m", "≈ 50 m"],
  );
  for (const geometry of [rectangle(), irregular, rotated]) {
    const dimensions = polygonDimensionStyles(geometry, 1, format);
    assert.equal(dimensions.length, 4);
    assert.equal(dimensions.filter((s) => s.getGeometry() instanceof Point).length, 2);
    for (const style of dimensions.filter((s) => s.getText())) {
      assert.equal(geometry.intersectsCoordinate(style.getGeometry().getCoordinates()), false);
    }
  }
  for (const style of polygonDimensionStyles(rotated, 1, format, Math.PI / 2).filter((s) => s.getText())) {
    assert.ok(Math.abs(style.getText().getRotation()) <= Math.PI / 2);
    assert.equal(style.getText().getRotateWithView(), false);
  }
  const normal = polygonDimensionStyles(rectangle(), 1, format);
  const zoomed = polygonDimensionStyles(rectangle(), 2, format);
  assert.equal(normal[0].getGeometry().getCoordinates()[0][0][1], -28);
  assert.equal(zoomed[0].getGeometry().getCoordinates()[0][0][1], -56);
  assert.equal(normal[1].getGeometry().getCoordinates()[1], -40);
  assert.equal(zoomed[1].getGeometry().getCoordinates()[1], -80);
  assert.deepEqual(irregular.getCoordinates(), before);
});
