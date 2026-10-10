import { createHash } from "node:crypto";
import {
  GEOGRAPHIC_LAYER_MAX_FEATURES,
  type GeographicLayerImportIssue,
  geographicLayerGeometryTypes,
} from "@hall/api-contract";
import { matchLiteral } from "@hall/domain";

const MAX_REPORTED_ISSUES = 50;
const WGS84_CRS_NAMES = new Set([
  "urn:ogc:def:crs:OGC:1.3:CRS84",
  "urn:ogc:def:crs:OGC::CRS84",
  "urn:ogc:def:crs:EPSG::4326",
  "urn:ogc:def:crs:EPSG:4326",
  "EPSG:4326",
  "CRS84",
]);

type GeometryType = (typeof geographicLayerGeometryTypes)[number];
type Bounds = [number, number, number, number];

export interface GeographicLayerImportFeature {
  sourceId: string | null;
  geometry: { type: GeometryType; coordinates: unknown[] };
  properties: unknown;
  bbox: Bounds;
}

export interface GeographicLayerImport {
  source: {
    format: "geojson";
    fileName: string;
    byteSize: number;
    contentSha256: string;
    importedAt: string;
  };
  features: GeographicLayerImportFeature[];
}

export class GeographicLayerImportError extends Error {
  constructor(readonly issues: GeographicLayerImportIssue[]) {
    super("The uploaded GeoJSON file is not a valid geographic layer");
    this.name = "GeographicLayerImportError";
  }
}

class IssueCollector {
  readonly issues: GeographicLayerImportIssue[] = [];

  add(code: GeographicLayerImportIssue["code"], path: string, featureIndex: number | null): void {
    if (this.issues.length < MAX_REPORTED_ISSUES) this.issues.push({ code, path, featureIndex });
  }

  get full(): boolean {
    return this.issues.length >= MAX_REPORTED_ISSUES;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGeometryType(value: unknown): value is GeometryType {
  return typeof value === "string" && (geographicLayerGeometryTypes as readonly string[]).includes(value);
}

/** Accepts an absent crs (RFC 7946) or a named CRS84 / EPSG:4326 crs (GeoJSON 2008). */
function crsIsWgs84(crs: unknown): boolean {
  if (crs === undefined || crs === null) return true;
  if (!isRecord(crs) || crs.type !== "name" || !isRecord(crs.properties)) return false;
  return typeof crs.properties.name === "string" && WGS84_CRS_NAMES.has(crs.properties.name);
}

/** Validates the coordinates of one geometry and extends the bounds; returns false after recording an issue. */
function readPositions(
  type: GeometryType,
  coordinates: unknown,
  path: string,
  featureIndex: number,
  issues: IssueCollector,
  bounds: Bounds,
): boolean {
  const position = (value: unknown, at: string): boolean => {
    if (
      !Array.isArray(value) ||
      value.length < 2 ||
      value.length > 3 ||
      !value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
    ) {
      issues.add("invalidCoordinates", at, featureIndex);
      return false;
    }
    const [longitude, latitude] = value as number[];
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      issues.add("coordinatesOutOfRange", at, featureIndex);
      return false;
    }
    bounds[0] = Math.min(bounds[0], longitude);
    bounds[1] = Math.min(bounds[1], latitude);
    bounds[2] = Math.max(bounds[2], longitude);
    bounds[3] = Math.max(bounds[3], latitude);
    return true;
  };
  const list = (value: unknown, at: string, minimum: number, item: (entry: unknown, at: string) => boolean) => {
    if (!Array.isArray(value) || value.length < 1) {
      issues.add("invalidCoordinates", at, featureIndex);
      return false;
    }
    if (value.length < minimum) {
      issues.add(minimum === 2 ? "lineTooShort" : "ringTooShort", at, featureIndex);
      return false;
    }
    return value.every((entry, index) => item(entry, `${at}[${index}]`));
  };
  const line = (value: unknown, at: string) => list(value, at, 2, position);
  const ring = (value: unknown, at: string) => {
    if (!list(value, at, 4, position)) return false;
    const positions = value as number[][];
    const first = positions[0]!;
    const last = positions[positions.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) {
      issues.add("ringNotClosed", at, featureIndex);
      return false;
    }
    return true;
  };
  const polygon = (value: unknown, at: string) => list(value, at, 1, ring);
  return matchLiteral(type, {
    Point: () => position(coordinates, path),
    MultiPoint: () => list(coordinates, path, 1, position),
    LineString: () => line(coordinates, path),
    MultiLineString: () => list(coordinates, path, 1, line),
    Polygon: () => polygon(coordinates, path),
    MultiPolygon: () => list(coordinates, path, 1, polygon),
  });
}

function readFeature(
  value: unknown,
  featureIndex: number,
  issues: IssueCollector,
): GeographicLayerImportFeature | null {
  const path = `features[${featureIndex}]`;
  if (!isRecord(value) || value.type !== "Feature") {
    issues.add("invalidFeature", path, featureIndex);
    return null;
  }
  if (!crsIsWgs84(value.crs)) {
    issues.add("unsupportedCrs", `${path}.crs`, featureIndex);
    return null;
  }
  const properties = value.properties === undefined ? null : value.properties;
  if (properties !== null && !isRecord(properties)) {
    issues.add("invalidFeature", `${path}.properties`, featureIndex);
    return null;
  }
  const geometry = value.geometry;
  if (!isRecord(geometry) || !isGeometryType(geometry.type)) {
    issues.add("unsupportedGeometry", `${path}.geometry`, featureIndex);
    return null;
  }
  if (!crsIsWgs84(geometry.crs)) {
    issues.add("unsupportedCrs", `${path}.geometry.crs`, featureIndex);
    return null;
  }
  const bounds: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  if (
    !readPositions(geometry.type, geometry.coordinates, `${path}.geometry.coordinates`, featureIndex, issues, bounds)
  ) {
    return null;
  }
  const sourceId = typeof value.id === "string" ? value.id : typeof value.id === "number" ? String(value.id) : null;
  return {
    sourceId,
    geometry: { type: geometry.type, coordinates: geometry.coordinates as unknown[] },
    properties,
    bbox: bounds,
  };
}

/**
 * Reads an uploaded GeoJSON FeatureCollection as a geographic layer.
 * Coordinates are WGS84 longitude and latitude; any declared crs other than CRS84 or EPSG:4326 is refused.
 */
// @implements-requirement HALL-FR-DOC-320
export function parseGeographicLayerImport(
  input: { fileName: string; content: Buffer },
  importedAt: Date = new Date(),
): GeographicLayerImport {
  const issues = new IssueCollector();
  let document: unknown;
  try {
    document = JSON.parse(input.content.toString("utf8").replace(/^﻿/, ""));
  } catch {
    throw new GeographicLayerImportError([{ code: "invalidJson", path: "", featureIndex: null }]);
  }
  if (!isRecord(document) || document.type !== "FeatureCollection" || !Array.isArray(document.features)) {
    throw new GeographicLayerImportError([{ code: "notFeatureCollection", path: "", featureIndex: null }]);
  }
  if (!crsIsWgs84(document.crs)) {
    throw new GeographicLayerImportError([{ code: "unsupportedCrs", path: "crs", featureIndex: null }]);
  }
  if (document.features.length === 0) {
    throw new GeographicLayerImportError([{ code: "noFeatures", path: "features", featureIndex: null }]);
  }
  if (document.features.length > GEOGRAPHIC_LAYER_MAX_FEATURES) {
    throw new GeographicLayerImportError([{ code: "tooManyFeatures", path: "features", featureIndex: null }]);
  }
  const features: GeographicLayerImportFeature[] = [];
  for (const [index, value] of document.features.entries()) {
    const feature = readFeature(value, index, issues);
    if (feature) features.push(feature);
    if (issues.full) break;
  }
  if (issues.issues.length > 0) throw new GeographicLayerImportError(issues.issues);
  return {
    source: {
      format: "geojson",
      fileName: input.fileName,
      byteSize: input.content.byteLength,
      contentSha256: createHash("sha256").update(input.content).digest("hex"),
      importedAt: importedAt.toISOString(),
    },
    features,
  };
}
