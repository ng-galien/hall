import { describe, expect, it } from "vitest";
import {
  GeographicLayerImportError,
  keyGeographicLayerFeatures,
  parseGeographicLayerImport,
} from "./geographicLayerImport.js";

const square = [
  [
    [4.47, 47.5],
    [4.48, 47.5],
    [4.48, 47.51],
    [4.47, 47.51],
    [4.47, 47.5],
  ],
];

function file(document: unknown, fileName = "couche.geojson") {
  return { fileName, content: Buffer.from(typeof document === "string" ? document : JSON.stringify(document)) };
}

function issuesOf(document: unknown) {
  try {
    parseGeographicLayerImport(file(document));
  } catch (error) {
    if (error instanceof GeographicLayerImportError) return error.issues;
    throw error;
  }
  throw new Error("Expected the import to be refused");
}

describe("GeoJSON geographic layer import", () => {
  // @verifies-requirement HALL-FR-DOC-320
  it("reads every accepted geometry type with its extent, source id and raw properties", () => {
    const imported = parseGeographicLayerImport(
      file({
        type: "FeatureCollection",
        crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
        features: [
          {
            type: "Feature",
            id: "A-1",
            properties: { nested: { a: 1 } },
            geometry: { type: "Polygon", coordinates: square },
          },
          { type: "Feature", id: 7, properties: null, geometry: { type: "Point", coordinates: [4.67, 47.6] } },
          { type: "Feature", properties: {}, geometry: { type: "MultiPoint", coordinates: [[4.57, 47.5]] } },
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: [
                [6, 46],
                [6.1, 46.1],
              ],
            },
          },
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "MultiLineString",
              coordinates: [
                [
                  [6, 46],
                  [6.1, 46.1],
                ],
              ],
            },
          },
          { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: [square] } },
        ],
      }),
      new Date("2026-10-10T08:00:00Z"),
    );
    expect(imported.features.map((feature) => feature.geometry.type)).toEqual([
      "Polygon",
      "Point",
      "MultiPoint",
      "LineString",
      "MultiLineString",
      "MultiPolygon",
    ]);
    expect(imported.features[0]).toMatchObject({
      sourceId: "A-1",
      properties: { nested: { a: 1 } },
      bbox: [4.47, 47.5, 4.48, 47.51],
    });
    expect(imported.features[1]).toMatchObject({ sourceId: "7", properties: null, bbox: [4.67, 47.6, 4.67, 47.6] });
    expect(imported.source).toMatchObject({
      format: "geojson",
      fileName: "couche.geojson",
      importedAt: "2026-10-10T08:00:00.000Z",
    });
    expect(imported.source.contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  // @verifies-requirement HALL-FR-DOC-320
  it("accepts a byte order mark and a file without crs as WGS84", () => {
    const content = `﻿${JSON.stringify({
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [6, 46] } }],
    })}`;
    expect(parseGeographicLayerImport(file(content)).features).toHaveLength(1);
  });

  // @verifies-requirement HALL-FR-DOC-320
  it("refuses projected or unknown coordinate reference systems, at the root and nested", () => {
    expect(
      issuesOf({
        type: "FeatureCollection",
        crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::2154" } },
        features: [],
      }),
    ).toEqual([{ code: "unsupportedCrs", path: "crs", featureIndex: null }]);
    expect(
      issuesOf({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Point",
              coordinates: [6, 46],
              crs: { type: "name", properties: { name: "EPSG:3857" } },
            },
          },
        ],
      }),
    ).toEqual([{ code: "unsupportedCrs", path: "features[0].geometry.crs", featureIndex: 0 }]);
  });

  // @verifies-requirement HALL-FR-DOC-320
  it("lists the invalid features with their rank", () => {
    expect(
      issuesOf({
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [700000, 6600000] } },
          { type: "Feature", properties: {}, geometry: { type: "GeometryCollection", geometries: [] } },
          { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[6, 46]] } },
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [6, 46],
                  [6.1, 46],
                  [6.1, 46.1],
                  [6, 46.1],
                ],
              ],
            },
          },
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [6, 46],
                  [6.1, 46],
                  [6, 46],
                ],
              ],
            },
          },
          { type: "Feature", properties: "text", geometry: { type: "Point", coordinates: [6, 46] } },
          { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: ["6", 46] } },
          { type: "Feature", properties: {}, geometry: null },
        ],
      }),
    ).toEqual([
      { code: "coordinatesOutOfRange", path: "features[0].geometry.coordinates", featureIndex: 0 },
      { code: "unsupportedGeometry", path: "features[1].geometry", featureIndex: 1 },
      { code: "lineTooShort", path: "features[2].geometry.coordinates", featureIndex: 2 },
      { code: "ringNotClosed", path: "features[3].geometry.coordinates[0]", featureIndex: 3 },
      { code: "ringTooShort", path: "features[4].geometry.coordinates[0]", featureIndex: 4 },
      { code: "invalidFeature", path: "features[5].properties", featureIndex: 5 },
      { code: "invalidCoordinates", path: "features[6].geometry.coordinates", featureIndex: 6 },
      { code: "unsupportedGeometry", path: "features[7].geometry", featureIndex: 7 },
    ]);
  });

  // @verifies-requirement HALL-FR-DOC-320
  it("refuses a file that is not a FeatureCollection, is empty or exceeds 20,000 features", () => {
    expect(issuesOf("{not json")).toEqual([{ code: "invalidJson", path: "", featureIndex: null }]);
    expect(issuesOf({ type: "Feature", geometry: null })).toEqual([
      { code: "notFeatureCollection", path: "", featureIndex: null },
    ]);
    expect(issuesOf({ type: "FeatureCollection", features: [] })).toEqual([
      { code: "noFeatures", path: "features", featureIndex: null },
    ]);
    const point = { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [6, 46] } };
    expect(issuesOf({ type: "FeatureCollection", features: Array.from({ length: 20_001 }, () => point) })).toEqual([
      { code: "tooManyFeatures", path: "features", featureIndex: null },
    ]);
  });

  // @verifies-requirement HALL-FR-DOC-360
  // @verifies-requirement HALL-FR-DOC-370
  it("chooses the parcel id, then the GeoJSON id, then no key, and labels parcels", () => {
    const point = (sourceId: string | null, properties: unknown) => ({
      sourceId,
      properties,
      geometry: { type: "Point" as const, coordinates: [6, 46] },
      bbox: [6, 46, 6, 46] as [number, number, number, number],
    });
    const parcels = keyGeographicLayerFeatures([
      point("1", { idu: "999990000A0221", section: "A", numero: "0221" }),
      point("2", { idu: "999990000B0010" }),
    ]);
    expect(parcels.featureKeyRule).toEqual({ kind: "cadastreParcel", property: "idu" });
    expect(parcels.features.map(({ key, label }) => [key, label])).toEqual([
      ["999990000A0221", "A 221"],
      ["999990000B0010", "B 10"],
    ]);
    const etalab = keyGeographicLayerFeatures([point(null, { id: "999990000A0221" })]);
    expect(etalab.featureKeyRule).toEqual({ kind: "cadastreParcel", property: "id" });
    const duplicated = keyGeographicLayerFeatures([
      point("R-1", { id: "999990000A0221" }),
      point("R-2", { id: "999990000A0221" }),
    ]);
    expect(duplicated.featureKeyRule).toEqual({ kind: "sourceId" });
    expect(duplicated.features.map(({ key, label }) => [key, label])).toEqual([
      ["R-1", null],
      ["R-2", null],
    ]);
    const keyless = keyGeographicLayerFeatures([point("R-1", {}), point(null, {})]);
    expect(keyless.featureKeyRule).toEqual({ kind: "none" });
    expect(keyless.features.every(({ key }) => key === null)).toBe(true);
  });
});
