import assert from "node:assert/strict";
import LineString from "ol/geom/LineString";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import { test } from "vitest";
import {
  compactFeatureGeometry,
  GEOGRAPHIC_COMPACT_FEATURE_PIXELS,
  isCompactFeature,
} from "../src/features/geographic/geographicOpenLayersAdapter.ts";

const square = new Polygon([
  [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
    [0, 0],
  ],
]);
const line = new LineString([
  [0, 0],
  [300, 0],
]);

// @verifies-requirement HALL-FR-DOC-420
test("an element switches to its compact marker below the single pixel threshold", () => {
  assert.equal(GEOGRAPHIC_COMPACT_FEATURE_PIXELS, 16);
  assert.equal(isCompactFeature(square, 100 / 16), false);
  assert.equal(isCompactFeature(square, 100 / 15.9), true);
  assert.equal(isCompactFeature(line, 1), false);
  assert.equal(isCompactFeature(line, 300 / 10), true);
  assert.equal(isCompactFeature(new Point([0, 0]), 1_000), false);
});

test("the compact marker sits at the interior point of an area and the middle of a line", () => {
  assert.deepEqual(compactFeatureGeometry(square)?.getCoordinates(), [50, 50]);
  assert.deepEqual(compactFeatureGeometry(line)?.getCoordinates(), [150, 0]);
  assert.equal(compactFeatureGeometry(new Point([1, 2])), null);
});
