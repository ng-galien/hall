import { defineExhaustiveLiterals, matchVariant } from "./match.js";
import type { HallGeoJsonFeature, HallGeoJsonFeatureCollection, HallGeoJsonMeasurement } from "./model.js";

export type HallGeoJsonFeatureKind = HallGeoJsonFeature["properties"]["kind"];
export type HallGeoJsonMeasurementKind = HallGeoJsonMeasurement["properties"]["kind"];

const measurementKinds: ReadonlySet<string> = new Set(
  defineExhaustiveLiterals<HallGeoJsonMeasurementKind>()(["lengthMeasurement", "areaMeasurement"]),
);

/** True for a saved measurement of the drawings GeoJSON, false for a drawing. */
// @implements-requirement HALL-FR-DOC-460
export function isHallGeoJsonMeasurement(
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

export type HallGeoJsonFeatureHandlers<Result> = {
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
