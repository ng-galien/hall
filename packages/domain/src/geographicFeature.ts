import type { HallGeoJsonFeature } from "./model.js";

export type HallGeoJsonFeatureKind = HallGeoJsonFeature["properties"]["kind"];

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
  const handler = handlers[feature.properties.kind] as (matched: never) => Result;
  return handler(feature as never);
}
