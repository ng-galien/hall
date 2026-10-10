import type { GeographicFeatureKeyRule } from "@hall/api-contract";

/** Text of a GeoJSON property value in the card; nested values are shown as JSON text. */
// @implements-requirement HALL-FR-DOC-380
export function geographicPropertyText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** Properties in the key order recorded with the layer; keys absent from that order come last. */
// @implements-requirement HALL-FR-DOC-380
export function orderedGeographicProperties(
  properties: Readonly<Record<string, unknown>> | null,
  propertyKeys: readonly string[],
): Array<[string, unknown]> {
  const entries = Object.entries(properties ?? {});
  const rank = (key: string) => {
    const index = propertyKeys.indexOf(key);
    return index < 0 ? propertyKeys.length : index;
  };
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => rank(left.entry[0]) - rank(right.entry[0]) || left.index - right.index)
    .map(({ entry }) => entry);
}

/** Layers whose features can be filtered to the commune's parcels: cadastre layers, once a list exists. */
// @implements-requirement HALL-FR-DOC-400
export function municipalFilterLayerIds(
  featureKeys: Readonly<Record<string, GeographicFeatureKeyRule>>,
  municipalParcelCount: number,
): ReadonlySet<string> {
  if (municipalParcelCount === 0) return new Set();
  return new Set(
    Object.entries(featureKeys)
      .filter(([, rule]) => rule.kind === "cadastreParcel")
      .map(([layerId]) => layerId),
  );
}
