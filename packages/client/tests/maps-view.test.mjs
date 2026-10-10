import assert from "node:assert/strict";
import { test } from "vitest";
import { mapsByBusiness, mapsTree } from "../src/pages/maps/mapsSelector.ts";
import {
  communeMapsView,
  fitMapsView,
  formatMapsViewParameter,
  mapsViewExtent,
  mapsViewOnOpen,
  parseMapsViewParameter,
} from "../src/pages/maps/mapsView.ts";

const size = { width: 1000, height: 800 };
const savedView = { kind: "center", center: [4.6, 47.6], zoom: 12 };

function area(id, ring, visible = true) {
  return {
    type: "Feature",
    id,
    properties: {
      kind: "area",
      visible,
      label: null,
      style: { fillColor: "#000000", strokeColor: "#000000", strokeWidth: 2, fillOpacity: 0.2 },
    },
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

function marker(id, coordinates, visible = true) {
  return {
    type: "Feature",
    id,
    properties: { kind: "marker", visible, label: null, style: { color: "#000000", size: "medium" } },
    geometry: { type: "Point", coordinates },
  };
}

function document(features) {
  return { view: savedView, hallLayer: { type: "FeatureCollection", features } };
}

const sampleArea = area("a", [
  [4.5, 47.55],
  [4.49, 47.55],
  [4.49, 47.57],
  [4.5, 47.55],
]);

// @verifies-requirement HALL-FR-WSP-330
test("the current view is kept when a visible drawing of the opened map is inside it", () => {
  const current = { center: [4.48, 47.56], zoom: 13 };
  assert.deepEqual(mapsViewOnOpen({ current, size, document: document([sampleArea]) }), current);
});

// @verifies-requirement HALL-FR-WSP-330
test("the view frames the drawings when none of them is inside the current view", () => {
  const current = { center: [2.35, 48.85], zoom: 14 };
  const next = mapsViewOnOpen({ current, size, document: document([sampleArea]) });
  assert.notDeepEqual(next, current);
  assert.ok(Math.abs(next.center[0] - 4.48) < 1e-6);
  assert.ok(Math.abs(next.center[1] - 47.56) < 1e-3);
  const [west, south, east, north] = mapsViewExtent(next, size);
  assert.ok(west <= 4.5 && east >= 4.49 && south <= 47.55 && north >= 47.57, "the framed view contains the drawing");
});

// @verifies-requirement HALL-FR-WSP-330
test("hidden drawings are ignored and a map without visible drawings opens on its saved framing", () => {
  const current = { center: [4.48, 47.56], zoom: 13 };
  const hiddenOnly = document([area("hidden", sampleArea.geometry.coordinates[0], false)]);
  assert.deepEqual(mapsViewOnOpen({ current, size, document: hiddenOnly }), { center: [4.6, 47.6], zoom: 12 });
  assert.deepEqual(mapsViewOnOpen({ current: null, size, document: document([]) }), {
    center: [4.6, 47.6],
    zoom: 12,
  });
});

// @verifies-requirement HALL-FR-WSP-330
test("a first opening without a current view frames the drawings; a single point uses the maximum zoom", () => {
  const point = mapsViewOnOpen({ current: null, size, document: document([marker("p", [4.52, 47.56])]) });
  assert.equal(point.zoom, 18);
  assert.ok(Math.abs(point.center[0] - 4.52) < 1e-9 && Math.abs(point.center[1] - 47.56) < 1e-9);
  const framed = fitMapsView([4.5, 47.55, 4.49, 47.57], size);
  assert.ok(framed.zoom > 12 && framed.zoom < 18);
});

// @verifies-requirement HALL-FR-WSP-310
test("the view parameter round-trips and malformed values are ignored", () => {
  const view = { center: [4.4823456789, 47.5543219876], zoom: 15.4567 };
  const formatted = formatMapsViewParameter(view);
  assert.equal(formatted, "4.482346,47.554322,15.46");
  assert.deepEqual(parseMapsViewParameter(formatted), { center: [4.482346, 47.554322], zoom: 15.46 });
  for (const malformed of [null, "", "6,46", "6,46,15,1", "a,46,15", "200,46,15", "6,95,15", "6,46,30", "6,,15"]) {
    assert.equal(parseMapsViewParameter(malformed), null, String(malformed));
  }
});

// @verifies-requirement HALL-FR-WSP-310
test("the commune view uses the recorded position, otherwise the extent of every map", () => {
  assert.deepEqual(communeMapsView({ position: [4.438, 47.558], documents: [], size }), {
    center: [4.438, 47.558],
    zoom: 14,
  });
  const all = communeMapsView({
    position: null,
    documents: [document([sampleArea]), document([marker("p", [4.6, 47.6])])],
    size,
  });
  const [west, south, east, north] = mapsViewExtent(all, size);
  assert.ok(west <= 4.5 && east >= 4.6 && south <= 47.55 && north >= 46.7);
  assert.deepEqual(communeMapsView({ position: null, documents: [document([])], size }), {
    center: [4.6, 47.6],
    zoom: 12,
  });
});

function summary(id, name, path) {
  return { id, name, path, kind: "geographic" };
}

// @verifies-requirement HALL-FR-WSP-320
test("the selector tree keeps only the branches holding maps and lists maps under each business", () => {
  const tree = [
    {
      path: "Équipements",
      name: "Équipements",
      business: null,
      children: [{ path: "Équipements/Voirie", name: "Voirie", business: null, children: [] }],
    },
    { path: "Finances", name: "Finances", business: null, children: [] },
  ];
  const maps = [summary("m1", "Routes", "Équipements/Voirie"), summary("m2", "Bâtiments", "Équipements")];
  const reduced = mapsTree(tree, maps);
  assert.deepEqual(
    reduced.map((node) => [node.path, node.mapCount, node.maps.map((map) => map.id)]),
    [["Équipements", 2, ["m2"]]],
  );
  assert.deepEqual(
    reduced[0].children.map((node) => [node.path, node.maps.map((map) => map.id)]),
    [["Équipements/Voirie", ["m1"]]],
  );

  const businesses = [
    { id: "b1", title: "Voirie", resources: [{ id: "m1" }, { id: "text" }] },
    { id: "b2", title: "Aménagement", resources: [{ id: "m1" }, { id: "m2" }] },
    { id: "b3", title: "Budget", resources: [] },
  ];
  assert.deepEqual(
    mapsByBusiness(businesses, maps).map((group) => [group.business.id, group.maps.map((map) => map.id)]),
    [
      ["b2", ["m1", "m2"]],
      ["b1", ["m1"]],
    ],
  );
});
