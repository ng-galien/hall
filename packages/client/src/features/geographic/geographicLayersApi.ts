import {
  findSirenAction,
  findSirenLink,
  type GeographicFeatureKeyRule,
  type GeographicFeatureNote,
  type GeographicLayerFeatureCollection,
  type GeographicLayerImportIssue,
  type GeographicMapOverlay,
  geographicFeatureNoteSchema,
  geographicLayerFeatureCollectionSchema,
  geographicLayerImportIssueSchema,
  type MunicipalProperty,
  municipalPropertySchema,
  PROBLEM_MEDIA_TYPE,
  resourceDetailSchema,
  type SirenEntity,
} from "@hall/api-contract";
import {
  ApiError,
  apiPathFromHref,
  apiResponse,
  followSirenLink,
  SirenCapabilityUnavailable,
  sirenRepresentation,
  submitSirenAction,
} from "../../services/apiClient";

export interface GeographicLayerData {
  layer: SirenEntity;
  featureKey: GeographicFeatureKeyRule;
  propertyKeys: string[];
  collection: GeographicLayerFeatureCollection;
}

const layerData = new Map<string, Promise<GeographicLayerData>>();

function layerRepresentation(overlay: GeographicMapOverlay): Promise<SirenEntity> {
  return sirenRepresentation(`/resources/${encodeURIComponent(overlay.slug)}`);
}

/** Reads the key rule and the features of one layer version through the links advertised by the layer. */
// @implements-requirement HALL-FR-DOC-310
// @implements-requirement HALL-FR-DOC-360
export function readGeographicLayer(overlay: GeographicMapOverlay): Promise<GeographicLayerData> {
  const key = `${overlay.layerId}.${overlay.version}`;
  const cached = layerData.get(key);
  if (cached) return cached;
  const pending = (async () => {
    const layer = await layerRepresentation(overlay);
    const detail = resourceDetailSchema.parse(layer.properties);
    if (detail.kind !== "geographicLayer") throw new SirenCapabilityUnavailable("features");
    const link = findSirenLink(layer, "features");
    if (!link) throw new SirenCapabilityUnavailable("features");
    const response = await apiResponse(apiPathFromHref(link.href), {
      headers: { Accept: `application/geo+json, ${PROBLEM_MEDIA_TYPE}` },
    });
    return {
      layer,
      featureKey: detail.featureKey,
      propertyKeys: detail.propertyKeys,
      collection: geographicLayerFeatureCollectionSchema.parse(await response.json()),
    };
  })();
  layerData.set(key, pending);
  pending.catch(() => layerData.delete(key));
  return pending;
}

/** Notes of the features of a layer, keyed by stable feature key. */
// @implements-requirement HALL-FR-DOC-390
export async function readGeographicFeatureNotes(layer: SirenEntity): Promise<GeographicFeatureNote[]> {
  const result = await followSirenLink<unknown>(layer, "feature-notes");
  return geographicFeatureNoteSchema.array().parse(result.data);
}

export function canCreateGeographicFeatureNote(layer: SirenEntity | null | undefined): boolean {
  return Boolean(layer && findSirenAction(layer, "resource.create-geographic-feature-note"));
}

export async function createGeographicFeatureNote(
  layer: SirenEntity,
  position: number,
): Promise<GeographicFeatureNote> {
  const result = await submitSirenAction<unknown>(layer, "resource.create-geographic-feature-note", { position });
  return geographicFeatureNoteSchema.parse(result.data);
}

export interface MunicipalPropertyState {
  representation: SirenEntity;
  data: MunicipalProperty;
}

/** Reads the commune's parcel list through the link advertised by the map. */
// @implements-requirement HALL-FR-DOC-400
export async function readMunicipalProperty(mapId: string): Promise<MunicipalPropertyState | null> {
  const map = await sirenRepresentation(`/resources/${encodeURIComponent(mapId)}`);
  if (!findSirenLink(map, "municipal-property")) return null;
  const result = await followSirenLink<unknown>(map, "municipal-property");
  if (!result.representation) return null;
  return { representation: result.representation, data: municipalPropertySchema.parse(result.data) };
}

export type MunicipalPropertyImportResult =
  | { kind: "imported"; state: MunicipalPropertyState }
  | { kind: "empty"; rejected: string[] };

export async function importMunicipalProperty(
  property: SirenEntity,
  input: { label: string; file: File | null; list: string },
): Promise<MunicipalPropertyImportResult> {
  const form = new FormData();
  form.set("label", input.label);
  if (input.list.trim()) form.set("list", input.list);
  if (input.file) form.set("file", input.file, input.file.name);
  try {
    const result = await submitSirenAction<unknown>(property, "resource.import-municipal-property", form);
    if (!result.representation) throw new SirenCapabilityUnavailable("resource.import-municipal-property");
    return {
      kind: "imported",
      state: { representation: result.representation, data: municipalPropertySchema.parse(result.data) },
    };
  } catch (failure) {
    if (failure instanceof ApiError && failure.status === 422) {
      return { kind: "empty", rejected: failure.problemErrors.filter((value) => typeof value === "string") };
    }
    throw failure;
  }
}

function geographicOverlays(data: unknown): GeographicMapOverlay[] {
  const detail = resourceDetailSchema.parse(data);
  if (detail.kind !== "geographic") throw new Error("The overlay action did not return a map");
  return detail.overlays;
}

/** Saves the visibility of a layer in the map through the map's link action. */
// @implements-requirement HALL-FR-DOC-330
export async function setGeographicOverlayVisibility(
  map: SirenEntity,
  layerId: string,
  visible: boolean,
): Promise<GeographicMapOverlay[]> {
  return geographicOverlays(
    (await submitSirenAction(map, "resource.link-geographic-layer", { layerId, visible })).data,
  );
}

export function canImportGeographicLayer(map: SirenEntity | null | undefined): boolean {
  return Boolean(map && findSirenAction(map, "resource.import-geographic-layer"));
}

export function canLinkGeographicLayer(map: SirenEntity | null | undefined): boolean {
  return Boolean(map && findSirenAction(map, "resource.link-geographic-layer"));
}

export type GeographicLayerImportResult =
  | { kind: "imported"; overlays: GeographicMapOverlay[] }
  | { kind: "rejected"; issues: GeographicLayerImportIssue[] }
  | { kind: "tooLarge" };

/**
 * Uploads a GeoJSON file through the map's import action, which creates the layer in the map folder and links it.
 * The map is then read again so that the saved overlays come from the server.
 */
// @implements-requirement HALL-FR-DOC-340
export async function importGeographicLayer(
  map: SirenEntity,
  mapReference: string,
  input: { file: File; name: string },
): Promise<GeographicLayerImportResult> {
  const action = findSirenAction(map, "resource.import-geographic-layer");
  if (!action) throw new SirenCapabilityUnavailable("resource.import-geographic-layer");
  const form = new FormData();
  for (const field of action.fields ?? []) {
    if (field.value !== undefined && field.name !== "file" && field.name !== "name") {
      form.set(field.name, String(field.value));
    }
  }
  form.set("name", input.name);
  form.set("file", input.file, input.file.name);
  try {
    await submitSirenAction(map, "resource.import-geographic-layer", form);
  } catch (failure) {
    if (failure instanceof ApiError && failure.status === 422) {
      return {
        kind: "rejected",
        issues: failure.problemErrors.flatMap((issue) => {
          const parsed = geographicLayerImportIssueSchema.safeParse(issue);
          return parsed.success ? [parsed.data] : [];
        }),
      };
    }
    if (failure instanceof ApiError && failure.status === 413) return { kind: "tooLarge" };
    throw failure;
  }
  const reopened = await apiResponse(`/resources/${encodeURIComponent(mapReference)}`);
  const representation = (await reopened.json()) as SirenEntity;
  return { kind: "imported", overlays: geographicOverlays(representation.properties) };
}
