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
  | { kind: "area"; area: number; perimeter: number }
  | { kind: "position"; coordinate: Coordinate };

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

/** Geodesic measure of a geometry in the map projection; a point gives its position. */
export function measureGeometry(geometry: Geometry): GeographicMeasure | null {
  if (geometry instanceof LineString) {
    const segments = segmentLengths(geometry.getCoordinates());
    return { kind: "length", length: segments.reduce((total, length) => total + length, 0), segments };
  }
  if (geometry instanceof Polygon) {
    return {
      kind: "area",
      area: getArea(geometry, { projection: GEOGRAPHIC_MAP_PROJECTION }),
      perimeter: geodesicLength(geometry.getLinearRing(0)?.getCoordinates() ?? []),
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
