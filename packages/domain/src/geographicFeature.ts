import { defineExhaustiveLiterals, matchVariant } from "./match.js";
import type { HallGeoJsonFeature, HallGeoJsonFeatureCollection, HallGeoJsonMeasurement } from "./model.js";

export type HallGeoJsonFeatureKind = HallGeoJsonFeature["properties"]["kind"];
type HallGeoJsonMeasurementKind = HallGeoJsonMeasurement["properties"]["kind"];

const measurementKinds: ReadonlySet<string> = new Set(
  defineExhaustiveLiterals<HallGeoJsonMeasurementKind>()(["lengthMeasurement", "areaMeasurement"]),
);

/** True for a saved measurement of the drawings GeoJSON, false for a drawing. */
// @implements-requirement HALL-FR-DOC-460
function isHallGeoJsonMeasurement(
  feature: HallGeoJsonFeature | HallGeoJsonMeasurement,
): feature is HallGeoJsonMeasurement {
  return measurementKinds.has(feature.properties.kind);
}

/** The drawings of a map: markers, lines and areas, without the saved measurements. */
export function hallGeoJsonDrawings(collection: HallGeoJsonFeatureCollection): HallGeoJsonFeature[] {
  return collection.features.filter((feature): feature is HallGeoJsonFeature => !isHallGeoJsonMeasurement(feature));
}

/** The saved measurements of a map, in saving order. */
export function hallGeoJsonMeasurements(collection: HallGeoJsonFeatureCollection): HallGeoJsonMeasurement[] {
  return collection.features.filter(isHallGeoJsonMeasurement);
}

/** Capacity of the drawings GeoJSON of a map: features, and positions over all their geometries. */
export const hallGeoJsonCapacity = { features: 100, coordinates: 5_000 } as const;

/** Number of positions of a feature geometry, as counted against the coordinate capacity. */
function hallGeoJsonCoordinateCount(feature: HallGeoJsonFeature | HallGeoJsonMeasurement): number {
  const { geometry } = feature;
  if (geometry.type === "Point") return 1;
  if (geometry.type === "LineString") return geometry.coordinates.length;
  return geometry.coordinates.reduce((count, ring) => count + ring.length, 0);
}

/** True when the features fit the capacity of the drawings GeoJSON. */
// @implements-requirement HALL-FR-DOC-460
export function hallGeoJsonWithinCapacity(features: readonly (HallGeoJsonFeature | HallGeoJsonMeasurement)[]): boolean {
  return (
    features.length <= hallGeoJsonCapacity.features &&
    features.reduce((count, feature) => count + hallGeoJsonCoordinateCount(feature), 0) <=
      hallGeoJsonCapacity.coordinates
  );
}

type HallGeoJsonFeatureHandlers<Result> = {
  [Kind in HallGeoJsonFeatureKind]: (feature: Extract<HallGeoJsonFeature, { properties: { kind: Kind } }>) => Result;
};

/**
 * Exhaustive fold for Hall's GeoJSON profile. The feature kind is the domain
 * discriminator; the correlated GeoJSON geometry type remains an invariant of
 * each union member rather than a second dispatch authority.
 */
export function matchHallGeoJsonFeature<Result>(
  feature: HallGeoJsonFeature,
  handlers: HallGeoJsonFeatureHandlers<Result>,
): Result {
  return matchVariant(feature, "properties", "kind", handlers);
}
