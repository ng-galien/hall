// @vitest-environment jsdom
import assert from "node:assert/strict";
import Collection from "ol/Collection";
import VectorSource from "ol/source/Vector";
import { test } from "vitest";
import {
  readHallFeatures,
  reconcileHallDrawingSource,
  serializeHallLayer,
} from "../src/features/geographic/geographicOpenLayersAdapter.ts";

const marker = (index) => ({
  type: "Feature",
  id: `00000000-0000-4000-8000-0000000000${String(index).padStart(2, "0")}`,
  properties: { kind: "marker", visible: true, label: `Repère ${index}`, style: { color: "#1b2a78", size: "medium" } },
  geometry: { type: "Point", coordinates: [4.47 + index / 1000, 47.5 + (index % 3) / 1000] },
});
const collection = (features) => ({ type: "FeatureCollection", features });
const labels = (source) => serializeHallLayer(source).features.map((feature) => feature.properties.label);

// @verifies-requirement HALL-FR-DOC-490
test("the composition keeps its order beyond the spatial index node size and adopts a new order in place", () => {
  const drawings = Array.from({ length: 14 }, (_, index) => marker(index + 1));
  const source = new VectorSource({ features: new Collection(readHallFeatures(collection(drawings))) });
  assert.deepEqual(
    labels(source),
    drawings.map((drawing) => drawing.properties.label),
  );
  const firstFeature = source.getFeatureById(drawings[0].id);
  const reordered = [drawings[3], ...drawings.filter((_, index) => index !== 3)];
  reconcileHallDrawingSource(source, collection(reordered));
  assert.deepEqual(
    labels(source),
    reordered.map((drawing) => drawing.properties.label),
  );
  assert.equal(
    source.getFeatureById(drawings[0].id),
    firstFeature,
    "an unchanged drawing keeps its OpenLayers feature",
  );
});
