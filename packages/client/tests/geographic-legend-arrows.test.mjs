// @vitest-environment jsdom
import assert from "node:assert/strict";
import Feature from "ol/Feature";
import LineString from "ol/geom/LineString";
import Polygon from "ol/geom/Polygon";
import VectorSource from "ol/source/Vector";
import { test } from "vitest";
import { hallGeographicFeatureCollectionSchema } from "../../api-contract/src/resources.ts";
import { lineArrowStyles } from "../src/features/geographic/geographicFeatureKindPolicy.tsx";
import {
  geographicModifiedFeatureStyle,
  readHallFeatures,
  serializeHallLayer,
} from "../src/features/geographic/geographicOpenLayersAdapter.ts";

const legend = [{ color: "#1D4ED8", label: "Source period" }];
const line = {
  type: "Feature",
  id: "11111111-1111-4111-8111-111111111111",
  properties: { kind: "line", label: "Line", visible: true, style: { color: "#1D4ED8", width: 2, arrows: "both" } },
  geometry: {
    type: "LineString",
    coordinates: [
      [6, 46],
      [6.1, 46.1],
    ],
  },
};
// @verifies-requirement HALL-FR-DOC-530
test("legend and directional line round trip; invalid labels, colors and capacity are rejected", () => {
  const value = { type: "FeatureCollection", features: [line], legend };
  assert.deepEqual(hallGeographicFeatureCollectionSchema.parse(JSON.parse(JSON.stringify(value))), value);
  for (const invalid of [
    [{ color: "#ffffff", label: " " }],
    [{ color: "garbage", label: "Source" }],
    Array.from({ length: 17 }, () => legend[0]),
  ])
    assert.equal(hallGeographicFeatureCollectionSchema.safeParse({ ...value, legend: invalid }).success, false);
  const source = new VectorSource({ features: readHallFeatures(value) });
  source.getFeatures()[0].set("label", "Renamed");
  const edited = { ...value, features: serializeHallLayer(source).features };
  assert.deepEqual(edited.legend, legend);
  assert.equal(edited.features[0].properties.style.arrows, "both");
});
// @verifies-requirement HALL-FR-DOC-540
test("arrows ignore zero segments and point outwards at each oriented line end", () => {
  const horizontal = new LineString([
    [0, 0],
    [0, 0],
    [10, 0],
    [10, 0],
  ]);
  const both = lineArrowStyles({ arrows: "both" }, horizontal);
  assert.equal(both.length, 2);
  assert.deepEqual(
    both.map((s) => s.getGeometry().getCoordinates()),
    [
      [0, 0],
      [10, 0],
    ],
  );
  assert.equal(both[0].getImage().getRotation(), -Math.PI);
  assert.equal(Math.abs(both[1].getImage().getRotation()), 0);
  const vertical = lineArrowStyles(
    { arrows: "forward" },
    new LineString([
      [0, 0],
      [0, 10],
    ]),
  );
  assert.equal(vertical[0].getImage().getRotation(), -Math.PI / 2);
  assert.equal(
    lineArrowStyles(
      { arrows: "both" },
      new LineString([
        [0, 0],
        [0, 0],
      ]),
    ).length,
    0,
  );
  assert.equal(lineArrowStyles({ arrows: "none" }, horizontal).length, 0);
});
// @verifies-requirement HALL-FR-DOC-450
test("modification handles retain every polygon vertex at compact resolutions", () => {
  const geometry = new Polygon([
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ]);
  const feature = new Feature({
    geometry,
    kind: "area",
    style: { fillColor: "#1D4ED8", strokeColor: "#1D4ED8", strokeWidth: 2, fillOpacity: 0.2 },
  });
  const styles = geographicModifiedFeatureStyle(feature, 10000);
  const handles = styles.find((s) => s.getGeometry()?.getType() === "MultiPoint");
  assert.deepEqual(handles.getGeometry().getCoordinates(), geometry.getCoordinates().flat());
});
