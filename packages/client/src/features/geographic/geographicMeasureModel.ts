import type { HallGeoJsonMeasurement } from "@hall/domain";
import type { Coordinate } from "ol/coordinate";
import GeoJSON from "ol/format/GeoJSON";
import type Geometry from "ol/geom/Geometry";
import LineString from "ol/geom/LineString";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import { toLonLat } from "ol/proj";
import { getArea, getLength } from "ol/sphere";

/** Projection of every Hall map view; measures are geodesic on the WGS84 mean sphere from this projection. */
export const GEOGRAPHIC_MAP_PROJECTION = "EPSG:3857";
const SQUARE_METRES_PER_HECTARE = 10_000;
const METRES_PER_KILOMETRE = 1_000;

export type GeographicMeasure =
  | { kind: "length"; length: number; segments: number[] }
  | {
      kind: "area";
      area: number;
      perimeter: number;
      rectangleDimensions?: GeographicRectangleDimensions;
      approximateExtent?: { width: number; length: number };
    }
  | { kind: "position"; coordinate: Coordinate };

export interface GeographicRectangleDimensions {
  width: number;
  height: number;
}

export interface GeographicPosition {
  latitude: number;
  longitude: number;
  x: number;
  y: number;
}

function geodesicLength(coordinates: Coordinate[]): number {
  return coordinates.length < 2 ? 0 : getLength(new LineString(coordinates), { projection: GEOGRAPHIC_MAP_PROJECTION });
}

export function segmentLengths(coordinates: Coordinate[]): number[] {
  return coordinates.slice(1).map((coordinate, index) => geodesicLength([coordinates[index]!, coordinate]));
}

/**
 * Approximate rectangle recognition in the conformal map projection: four distinct convex corners, no holes,
 * angles within 5° of a right angle, opposite geodesic sides within 10%. Dimensions average opposite sides;
 * width follows the pair closest to horizontal, including rotated rectangles. No geometry is changed or saved.
 */
// @implements-requirement HALL-FR-DOC-520
export function rectangleDimensions(polygon: Polygon): GeographicRectangleDimensions | null {
  const rings = polygon.getCoordinates();
  if (rings.length !== 1) return null;
  const ring = rings[0]!;
  if (ring.length !== 5) return null;
  const samePoint = (a: Coordinate, b: Coordinate) => a[0] === b[0] && a[1] === b[1];
  if (!samePoint(ring[0]!, ring[4]!)) return null;
  const corners = ring.slice(0, 4);
  if (corners.some((point) => !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) return null;
  if (corners.some((point, index) => corners.slice(index + 1).some((other) => samePoint(point, other)))) return null;
  const sides = corners.map((point, index) => {
    const next = corners[(index + 1) % 4]!;
    return [next[0]! - point[0]!, next[1]! - point[1]!] as const;
  });
  const planarLengths = sides.map(([x, y]) => Math.hypot(x, y));
  if (planarLengths.some((length) => length === 0 || !Number.isFinite(length))) return null;
  const rightAngleTolerance = Math.sin((5 * Math.PI) / 180);
  let turnSign = 0;
  for (let index = 0; index < 4; index += 1) {
    const nextIndex = (index + 1) % 4;
    const [x, y] = sides[index]!;
    const [nextX, nextY] = sides[nextIndex]!;
    const scale = planarLengths[index]! * planarLengths[nextIndex]!;
    if (Math.abs((x * nextX + y * nextY) / scale) > rightAngleTolerance) return null;
    const sign = Math.sign(x * nextY - y * nextX);
    if (sign === 0 || (turnSign !== 0 && sign !== turnSign)) return null;
    turnSign = sign;
  }
  const lengths = segmentLengths(ring);
  if (lengths.some((length) => length <= 0 || !Number.isFinite(length))) return null;
  const pairs = [0, 1].map((index) => {
    const first = lengths[index]!;
    const opposite = lengths[index + 2]!;
    return {
      length: (first + opposite) / 2,
      deviation: Math.abs(first - opposite) / Math.max(first, opposite),
      horizontal:
        (Math.abs(sides[index]![0]) / planarLengths[index]! +
          Math.abs(sides[index + 2]![0]) / planarLengths[index + 2]!) /
        2,
    };
  });
  if (pairs.some((pair) => pair.deviation > 0.1)) return null;
  const widthIndex = pairs[0]!.horizontal >= pairs[1]!.horizontal ? 0 : 1;
  return { width: pairs[widthIndex]!.length, height: pairs[1 - widthIndex]!.length };
}

/** Minimum-area oriented rectangle of the outer-ring convex hull; its sides are geodesic approximations.
 * This derived envelope never replaces the polygon or its area. Degenerate/non-finite rings have no envelope.
 */
// @implements-requirement HALL-FR-DOC-520
export function orientedPolygonExtent(
  polygon: Polygon,
): { corners: Coordinate[]; width: number; length: number } | null {
  const points = polygon.getCoordinates()[0]?.map(([x, y]) => [x!, y!] as Coordinate) ?? [];
  if (points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return null;
  points.sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
  const distinct = points.filter((p, i) => !i || p[0] !== points[i - 1]![0] || p[1] !== points[i - 1]![1]);
  const cross = (a: Coordinate, b: Coordinate, c: Coordinate) =>
    (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);
  const half = (ordered: Coordinate[]) => {
    const result: Coordinate[] = [];
    for (const point of ordered) {
      while (result.length > 1 && cross(result.at(-2)!, result.at(-1)!, point) <= 0) result.pop();
      result.push(point);
    }
    return result.slice(0, -1);
  };
  const hull = [...half(distinct), ...half([...distinct].reverse())];
  if (hull.length < 3) return null;
  // Use local coordinates to avoid cancellation at large projected map coordinates.
  const origin = hull[0]!;
  const local = hull.map(([x, y]) => [x! - origin[0]!, y! - origin[1]!] as const);
  let bestArea = Number.POSITIVE_INFINITY;
  let best: Coordinate[] | null = null;
  for (let index = 0; index < local.length; index += 1) {
    const a = local[index]!;
    const b = local[(index + 1) % local.length]!;
    const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / distance;
    const uy = (b[1] - a[1]) / distance;
    const xs = local.map(([x, y]) => x * ux + y * uy);
    const ys = local.map(([x, y]) => -x * uy + y * ux);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const area = (maxX - minX) * (maxY - minY);
    if (best && area >= bestArea - Math.max(1, bestArea) * 1e-12) continue;
    bestArea = area;
    best = [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
    ].map(([x, y]) => [origin[0]! + x! * ux - y! * uy, origin[1]! + x! * uy + y! * ux]);
  }
  if (!best || bestArea <= 1e-8 || !Number.isFinite(bestArea)) return null;
  const lengths = segmentLengths([...best, best[0]!]);
  const first = (lengths[0]! + lengths[2]!) / 2;
  const second = (lengths[1]! + lengths[3]!) / 2;
  if (![first, second].every((value) => Number.isFinite(value) && value > 0)) return null;
  return { corners: best, width: Math.min(first, second), length: Math.max(first, second) };
}

export function approximatePolygonExtent(polygon: Polygon): { width: number; length: number } | null {
  const extent = orientedPolygonExtent(polygon);
  return extent ? { width: extent.width, length: extent.length } : null;
}

/** Geodesic measure of a geometry in the map projection; a point gives its position. */
export function measureGeometry(geometry: Geometry): GeographicMeasure | null {
  if (geometry instanceof LineString) {
    const segments = segmentLengths(geometry.getCoordinates());
    return { kind: "length", length: segments.reduce((total, length) => total + length, 0), segments };
  }
  if (geometry instanceof Polygon) {
    const dimensions = rectangleDimensions(geometry);
    const extent = dimensions ? null : approximatePolygonExtent(geometry);
    return {
      kind: "area",
      area: getArea(geometry, { projection: GEOGRAPHIC_MAP_PROJECTION }),
      perimeter: geodesicLength(geometry.getLinearRing(0)?.getCoordinates() ?? []),
      ...(dimensions ? { rectangleDimensions: dimensions } : {}),
      ...(extent ? { approximateExtent: extent } : {}),
    };
  }
  if (geometry instanceof Point) return { kind: "position", coordinate: geometry.getCoordinates() };
  return null;
}

export function geographicPosition(coordinate: Coordinate): GeographicPosition {
  const [longitude, latitude] = toLonLat(coordinate, GEOGRAPHIC_MAP_PROJECTION);
  return { latitude: latitude!, longitude: longitude!, x: coordinate[0]!, y: coordinate[1]! };
}

type FormatNumber = (value: number, options?: Intl.NumberFormatOptions) => string;

function decimals(digits: number): Intl.NumberFormatOptions {
  return { minimumFractionDigits: digits, maximumFractionDigits: digits };
}

/** Decimals of a value shown in metres or square metres: one below 10, none from 10. */
function smallUnitDigits(value: number): number {
  return value < 10 ? 1 : 0;
}

/** The value as displayed in the small unit, so the unit switch follows the displayed figure. */
function roundedInSmallUnit(value: number): number {
  const factor = 10 ** smallUnitDigits(value);
  return Math.round(value * factor) / factor;
}

/** Metres below 1 km (one decimal below 10 m), then kilometres with two decimals; the switch uses the rounded value. */
export function formatGeographicLength(metres: number, format: FormatNumber): string {
  if (roundedInSmallUnit(metres) >= METRES_PER_KILOMETRE) {
    return `${format(metres / METRES_PER_KILOMETRE, decimals(2))} km`;
  }
  return `${format(metres, decimals(smallUnitDigits(metres)))} m`;
}

/** Square metres below 1 ha, then hectares with two decimals; the switch uses the rounded value. */
export function formatGeographicArea(squareMetres: number, format: FormatNumber): string {
  if (roundedInSmallUnit(squareMetres) >= SQUARE_METRES_PER_HECTARE) {
    return `${format(squareMetres / SQUARE_METRES_PER_HECTARE, decimals(2))} ha`;
  }
  return `${format(squareMetres, decimals(smallUnitDigits(squareMetres)))} m²`;
}

export function formatSquareMetres(squareMetres: number, format: FormatNumber): string {
  return `${format(squareMetres, decimals(0))} m²`;
}

/** Localized letters of the four cardinal directions. */
export interface CardinalLetters {
  north: string;
  south: string;
  east: string;
  west: string;
}

/** Latitude and longitude in decimal degrees (6 decimals, about 0.1 m). */
export function formatWgs84(position: GeographicPosition, format: FormatNumber, cardinals: CardinalLetters): string {
  const latitude = `${format(Math.abs(position.latitude), decimals(6))}° ${position.latitude >= 0 ? cardinals.north : cardinals.south}`;
  const longitude = `${format(Math.abs(position.longitude), decimals(6))}° ${position.longitude >= 0 ? cardinals.east : cardinals.west}`;
  return `${latitude}, ${longitude}`;
}

export function formatProjected(position: GeographicPosition, format: FormatNumber): string {
  return `X ${format(position.x, decimals(0))} m, Y ${format(position.y, decimals(0))} m`;
}

/** Plain text pasted into other tools: "latitude, longitude" with a decimal point. */
export function wgs84ClipboardText(position: GeographicPosition): string {
  return `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`;
}

export function projectedClipboardText(position: GeographicPosition): string {
  return `${position.x.toFixed(2)}, ${position.y.toFixed(2)}`;
}

const geoJson = new GeoJSON();

function centimetres(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Saved measurement feature of the drawings GeoJSON: geometry in WGS84, the measurement kind, the name and the
 * geodesic value at saving time. A point has no saved measurement.
 */
// @implements-requirement HALL-FR-DOC-460
export function measurementFeature(id: string, label: string, geometry: Geometry): HallGeoJsonMeasurement | null {
  const measure = measureGeometry(geometry);
  const write = () =>
    geoJson.writeGeometryObject(geometry, {
      dataProjection: "EPSG:4326",
      featureProjection: GEOGRAPHIC_MAP_PROJECTION,
      decimals: 7,
    });
  if (measure?.kind === "length") {
    return {
      type: "Feature",
      id,
      properties: { kind: "lengthMeasurement", label, length: centimetres(measure.length) },
      geometry: write() as Extract<HallGeoJsonMeasurement, { properties: { kind: "lengthMeasurement" } }>["geometry"],
    };
  }
  if (measure?.kind === "area") {
    return {
      type: "Feature",
      id,
      properties: {
        kind: "areaMeasurement",
        label,
        area: centimetres(measure.area),
        perimeter: centimetres(measure.perimeter),
      },
      geometry: write() as Extract<HallGeoJsonMeasurement, { properties: { kind: "areaMeasurement" } }>["geometry"],
    };
  }
  return null;
}

/** Value of a saved measurement as stored: the length of a distance, the area of a surface. */
export function savedMeasure(
  measurement: HallGeoJsonMeasurement,
): Extract<GeographicMeasure, { kind: "length" | "area" }> {
  return measurement.properties.kind === "lengthMeasurement"
    ? { kind: "length", length: measurement.properties.length, segments: [] }
    : { kind: "area", area: measurement.properties.area, perimeter: measurement.properties.perimeter };
}
