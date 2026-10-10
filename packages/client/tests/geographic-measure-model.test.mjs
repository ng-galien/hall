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
  wgs84ClipboardText,
} from "../src/features/geographic/geographicMeasureModel.ts";

const fr = (value, options) => new Intl.NumberFormat("fr-FR", options).format(value);
const normalize = (text) => text.replace(/[  ]/g, " ");
const frenchCardinals = { north: "N", south: "S", east: "E", west: "O" };
const englishCardinals = { north: "N", south: "S", east: "E", west: "W" };

// @verifies-requirement HALL-FR-DOC-410
test("lengths are geodesic, not measured in the Web Mercator plane", () => {
  const equator = measureGeometry(new LineString([fromLonLat([0, 0]), fromLonLat([1, 0])]));
  assert.equal(equator.kind, "length");
  assert.ok(Math.abs(equator.length - 111_194.93) < 1, `${equator.length}`);
  const sample = [fromLonLat([4.50, 47.54]), fromLonLat([4.51, 47.54]), fromLonLat([4.51, 47.55])];
  const line = measureGeometry(new LineString(sample));
  assert.equal(line.segments.length, 2);
  assert.ok(Math.abs(line.segments[0] - 750.7) < 2, `${line.segments[0]}`);
  assert.ok(Math.abs(line.segments[1] - 1_111.9) < 2, `${line.segments[1]}`);
  const planar = Math.hypot(sample[1][0] - sample[0][0], sample[1][1] - sample[0][1]);
  assert.ok(planar / line.segments[0] > 1.4, "the projection plane overstates lengths at this latitude");
});

test("a polygon gives its geodesic area and perimeter", () => {
  const [west, east, south, north] = [6.03, 6.04, 47.54, 47.55];
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
  assert.equal(normalize(formatGeographicLength(750.7, fr)), "764 m");
  assert.equal(normalize(formatGeographicLength(1_111.9, fr)), "1,11 km");
  assert.equal(normalize(formatGeographicArea(850.4, fr)), "850 m²");
  assert.equal(normalize(formatGeographicArea(9_999.4, fr)), "9 999 m²");
  assert.equal(normalize(formatGeographicArea(834_600, fr)), "84,98 ha");
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
