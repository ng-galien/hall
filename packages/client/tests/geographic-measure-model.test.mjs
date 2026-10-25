import assert from "node:assert/strict";
import LineString from "ol/geom/LineString";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import { fromLonLat } from "ol/proj";
import { test } from "vitest";
import {
  formatGeographicArea,
  formatGeographicLength,
  formatProjected,
  formatWgs84,
  geographicPosition,
  measureGeometry,
  measurementFeature,
  rectangleDimensions,
  savedMeasure,
  wgs84ClipboardText,
} from "../src/features/geographic/geographicMeasureModel.ts";

const fr = (value, options) => new Intl.NumberFormat("fr-FR", options).format(value);
const normalize = (text) => text.replace(/[  ]/g, " ");
const frenchCardinals = { north: "N", south: "S", east: "E", west: "O" };
const englishCardinals = { north: "N", south: "S", east: "E", west: "W" };

function projectedRectangle(width, height, degrees = 0, latitude = 47.54) {
  const origin = fromLonLat([4.5, latitude]);
  const angle = (degrees * Math.PI) / 180;
  const coordinates = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
    [0, 0],
  ].map(([x, y]) => [
    origin[0] + x * Math.cos(angle) - y * Math.sin(angle),
    origin[1] + x * Math.sin(angle) + y * Math.cos(angle),
  ]);
  return new Polygon([coordinates]);
}

// @verifies-requirement HALL-FR-DOC-520
test("rectangle dimensions follow geodesic opposite sides and rotation, without changing the geometry", () => {
  const polygon = projectedRectangle(200, 100, 30);
  const before = polygon.getCoordinates();
  const dimensions = rectangleDimensions(polygon);
  assert.ok(dimensions);
  const measure = measureGeometry(polygon);
  assert.deepEqual(measure.rectangleDimensions, dimensions);
  assert.ok(Math.abs(dimensions.width - 134.9) < 0.5, `${dimensions.width}`);
  assert.ok(Math.abs(dimensions.height - 67.4) < 0.5, `${dimensions.height}`);
  assert.deepEqual(polygon.getCoordinates(), before);
  const rotated = rectangleDimensions(projectedRectangle(200, 100, 70));
  assert.ok(Math.abs(rotated.width - dimensions.height) < 0.5);
  assert.ok(Math.abs(rotated.height - dimensions.width) < 0.5);
  const reversed = new Polygon([before[0].toReversed()]);
  const reversedDimensions = rectangleDimensions(reversed);
  assert.ok(Math.abs(reversedDimensions.width - dimensions.width) < 1e-9);
  assert.ok(Math.abs(reversedDimensions.height - dimensions.height) < 1e-9);
});

// @verifies-requirement HALL-FR-DOC-520
test("near rectangles have four distinct corners, no holes, convex turns and bounded angle and side deviations", () => {
  const polygon = (ring, holes = []) => new Polygon([[...ring, ring[0]], ...holes]);
  assert.ok(
    rectangleDimensions(
      polygon([
        [0, 0],
        [100, 0],
        [104, 100],
        [0, 100],
      ]),
    ),
  );
  assert.equal(
    rectangleDimensions(
      polygon([
        [0, 0],
        [100, 0],
        [120, 100],
        [0, 100],
      ]),
    ),
    null,
  );
  assert.equal(
    rectangleDimensions(
      polygon([
        [0, 0],
        [100, 0],
        [88, 1_000],
        [0, 1_000],
      ]),
    ),
    null,
  );
  assert.ok(
    rectangleDimensions(
      polygon([
        [0, 0],
        [100, 0],
        [92, 1_000],
        [0, 1_000],
      ]),
    ),
  );
  assert.equal(
    rectangleDimensions(
      polygon([
        [0, 0],
        [100, 0],
        [100, 0],
        [0, 100],
      ]),
    ),
    null,
  );
  assert.equal(
    rectangleDimensions(
      polygon([
        [0, 0],
        [100, 100],
        [100, 0],
        [0, 100],
      ]),
    ),
    null,
  );
  assert.equal(
    rectangleDimensions(
      polygon([
        [0, 0],
        [100, 0],
        [20, 20],
        [0, 100],
      ]),
    ),
    null,
  );
  assert.equal(
    rectangleDimensions(
      polygon([
        [0, 0],
        [100, 0],
        [100, 100],
        [50, 120],
        [0, 100],
      ]),
    ),
    null,
  );
  assert.equal(
    rectangleDimensions(
      polygon(
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ],
        [
          [
            [20, 20],
            [30, 20],
            [20, 30],
            [20, 20],
          ],
        ],
      ),
    ),
    null,
  );
  const triangle = measureGeometry(
    polygon([
      [0, 0],
      [100, 0],
      [0, 100],
    ]),
  );
  assert.equal(triangle.kind, "area");
  assert.equal(triangle.rectangleDimensions, undefined);
  assert.ok(triangle.area > 0);
  assert.ok(triangle.perimeter > 0);
});

// @verifies-requirement HALL-FR-DOC-410
test("lengths are geodesic, not measured in the Web Mercator plane", () => {
  const equator = measureGeometry(new LineString([fromLonLat([0, 0]), fromLonLat([1, 0])]));
  assert.equal(equator.kind, "length");
  assert.ok(Math.abs(equator.length - 111_194.93) < 1, `${equator.length}`);
  const sampleLine = [fromLonLat([4.5, 47.54]), fromLonLat([4.51, 47.54]), fromLonLat([4.51, 47.55])];
  const line = measureGeometry(new LineString(sampleLine));
  assert.equal(line.segments.length, 2);
  assert.ok(Math.abs(line.segments[0] - 750.7) < 2, `${line.segments[0]}`);
  assert.ok(Math.abs(line.segments[1] - 1_111.9) < 2, `${line.segments[1]}`);
  const planar = Math.hypot(sampleLine[1][0] - sampleLine[0][0], sampleLine[1][1] - sampleLine[0][1]);
  assert.ok(planar / line.segments[0] > 1.4, "the projection plane overstates lengths at this latitude");
});

test("a polygon gives its geodesic area and perimeter", () => {
  const [west, east, south, north] = [4.5, 4.51, 47.54, 47.55];
  const ring = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ].map((coordinate) => fromLonLat(coordinate));
  const area = measureGeometry(new Polygon([ring]));
  assert.equal(area.kind, "area");
  assert.ok(Math.abs(area.area - 834_600) / 834_600 < 0.01, `${area.area}`);
  assert.ok(Math.abs(area.perimeter - 3_725) < 10, `${area.perimeter}`);
});

test("a point gives its position in WGS84 and in the map projection", () => {
  const measure = measureGeometry(new Point(fromLonLat([4.506559, 47.54188])));
  assert.equal(measure.kind, "position");
  const position = geographicPosition(measure.coordinate);
  assert.equal(normalize(formatWgs84(position, fr, frenchCardinals)), "47,541880° N, 4,506559° E");
  assert.equal(wgs84ClipboardText(position), "47.541880, 4.506559");
  assert.match(normalize(formatProjected(position, fr)), /^X 501 \d{3} m, Y 6 03\d \d{3} m$/);
});

test("units switch to km and ha with French rounding", () => {
  assert.equal(normalize(formatGeographicLength(4.26, fr)), "4,3 m");
  assert.equal(normalize(formatGeographicLength(764.3, fr)), "764 m");
  assert.equal(normalize(formatGeographicLength(1_111.9, fr)), "1,11 km");
  assert.equal(normalize(formatGeographicArea(850.4, fr)), "850 m²");
  assert.equal(normalize(formatGeographicArea(9_999.4, fr)), "9 999 m²");
  assert.equal(normalize(formatGeographicArea(849_800, fr)), "84,98 ha");
});

test("west longitudes use the letter of the interface language", () => {
  const position = geographicPosition(fromLonLat([-1.553621, 47.218371]));
  assert.equal(normalize(formatWgs84(position, fr, frenchCardinals)), "47,218371° N, 1,553621° O");
  const en = (value, options) => new Intl.NumberFormat("en-GB", options).format(value);
  assert.equal(formatWgs84(position, en, englishCardinals), "47.218371° N, 1.553621° W");
});

test("the unit switch follows the rounded figure", () => {
  assert.equal(normalize(formatGeographicLength(999.4, fr)), "999 m");
  assert.equal(normalize(formatGeographicLength(999.6, fr)), "1,00 km");
  assert.equal(normalize(formatGeographicLength(9.94, fr)), "9,9 m");
  assert.equal(normalize(formatGeographicLength(9.96, fr)), "10,0 m");
  assert.equal(normalize(formatGeographicArea(9_999.6, fr)), "1,00 ha");
  assert.equal(normalize(formatGeographicArea(10_000, fr)), "1,00 ha");
});

// @verifies-requirement HALL-FR-DOC-460
test("a saved measurement stores its WGS84 geometry, kind, name and geodesic value", () => {
  const line = new LineString([fromLonLat([4.5, 47.54]), fromLonLat([4.51, 47.54])]);
  const length = measurementFeature("44444444-4444-4444-8444-444444444444", "Chemin", line);
  assert.equal(length.properties.kind, "lengthMeasurement");
  assert.equal(length.properties.label, "Chemin");
  assert.ok(Math.abs(length.properties.length - 750.7) < 2, `${length.properties.length}`);
  assert.equal(length.properties.length, Math.round(length.properties.length * 100) / 100);
  assert.deepEqual(length.geometry, {
    type: "LineString",
    coordinates: [
      [4.5, 47.54],
      [4.51, 47.54],
    ],
  });
  assert.deepEqual(savedMeasure(length), { kind: "length", length: length.properties.length, segments: [] });

  const ring = [
    [4.5, 47.54],
    [4.51, 47.54],
    [4.51, 47.55],
    [4.5, 47.55],
    [4.5, 47.54],
  ];
  const area = measurementFeature(
    "55555555-5555-4555-8555-555555555555",
    "Pré",
    new Polygon([ring.map((c) => fromLonLat(c))]),
  );
  assert.equal(area.properties.kind, "areaMeasurement");
  assert.ok(Math.abs(area.properties.area - 834_600) / 834_600 < 0.01, `${area.properties.area}`);
  assert.ok(Math.abs(area.properties.perimeter - 3_725) < 10, `${area.properties.perimeter}`);
  assert.equal(area.geometry.type, "Polygon");
  assert.deepEqual(area.geometry.coordinates, [ring]);
  assert.deepEqual(Object.keys(area.properties).sort(), ["area", "kind", "label", "perimeter"]);
  assert.equal(
    measurementFeature("66666666-6666-4666-8666-666666666666", "Point", new Point(fromLonLat([6, 46]))),
    null,
  );
});
