import { describe, expect, it } from "vitest";
import {
  hallGeoJsonCapacity,
  hallGeoJsonDrawings,
  hallGeoJsonMeasurements,
  hallGeoJsonWithinCapacity,
  isHallGeoJsonMeasurement,
  matchHallGeoJsonFeature,
} from "./geographicFeature.js";
import type { HallGeoJsonFeature, HallGeoJsonMeasurement } from "./model.js";

const features: HallGeoJsonFeature[] = [
  {
    type: "Feature",
    id: "11111111-1111-4111-8111-111111111111",
    properties: { kind: "marker", visible: true, label: "Mairie", style: { color: "#112233", size: "medium" } },
    geometry: { type: "Point", coordinates: [2.3522, 48.8566] },
  },
  {
    type: "Feature",
    id: "22222222-2222-4222-8222-222222222222",
    properties: { kind: "line", visible: true, label: "Rue", style: { color: "#223344", width: 2 } },
    geometry: {
      type: "LineString",
      coordinates: [
        [2.35, 48.85],
        [2.36, 48.86],
      ],
    },
  },
  {
    type: "Feature",
    id: "33333333-3333-4333-8333-333333333333",
    properties: {
      kind: "area",
      visible: true,
      label: "Zone",
      style: { fillColor: "#334455", strokeColor: "#112233", strokeWidth: 2, fillOpacity: 0.4 },
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [2.35, 48.85],
          [2.36, 48.85],
          [2.36, 48.86],
          [2.35, 48.85],
        ],
      ],
    },
  },
];

describe("Hall GeoJSON feature matching", () => {
  it("dispatches every feature to the handler for its domain kind", () => {
    expect(
      features.map((feature) =>
        matchHallGeoJsonFeature(feature, {
          marker: ({ geometry }) => `marker:${geometry.type}`,
          line: ({ geometry }) => `line:${geometry.coordinates.length}`,
          area: ({ geometry }) => `area:${geometry.coordinates.length}`,
        }),
      ),
    ).toEqual(["marker:Point", "line:2", "area:1"]);
  });
});

// @verifies-requirement HALL-FR-DOC-460
describe("saved measurements in the drawings GeoJSON", () => {
  it("separates the drawings from the saved measurements", () => {
    const measurement: HallGeoJsonMeasurement = {
      type: "Feature",
      id: "44444444-4444-4444-8444-444444444444",
      properties: { kind: "lengthMeasurement", label: "Chemin", length: 1_402.5 },
      geometry: {
        type: "LineString",
        coordinates: [
          [2.35, 48.85],
          [2.36, 48.86],
        ],
      },
    };
    const collection = { type: "FeatureCollection" as const, features: [features[0]!, measurement, features[2]!] };
    expect(collection.features.map(isHallGeoJsonMeasurement)).toEqual([false, true, false]);
    expect(hallGeoJsonDrawings(collection).map(({ properties }) => properties.kind)).toEqual(["marker", "area"]);
    expect(hallGeoJsonMeasurements(collection)).toEqual([measurement]);
  });
});

// @verifies-requirement HALL-FR-DOC-460
describe("capacity of the drawings GeoJSON", () => {
  const measurement = (id: number, positions: number): HallGeoJsonMeasurement => ({
    type: "Feature",
    id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    properties: { kind: "lengthMeasurement", label: `Mesure ${id}`, length: 10 },
    geometry: {
      type: "LineString",
      coordinates: Array.from({ length: positions }, (_, index) => [2 + index / 1_000, 48] as [number, number]),
    },
  });

  it("counts drawings and saved measurements against 100 features and 5000 positions", () => {
    const hundred = Array.from({ length: hallGeoJsonCapacity.features }, (_, index) => measurement(index, 2));
    expect(hallGeoJsonWithinCapacity(hundred)).toBe(true);
    expect(hallGeoJsonWithinCapacity([...features, ...hundred.slice(features.length)])).toBe(true);
    expect(hallGeoJsonWithinCapacity([...features, ...hundred])).toBe(false);
    const tenLong = Array.from({ length: 10 }, (_, index) => measurement(index, 500));
    expect(hallGeoJsonWithinCapacity(tenLong)).toBe(true);
    expect(hallGeoJsonWithinCapacity([...tenLong, measurement(10, 2)])).toBe(false);
  });
});
