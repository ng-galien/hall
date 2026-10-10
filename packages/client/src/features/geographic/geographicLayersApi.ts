import {
  findSirenAction,
  findSirenLink,
  type GeographicLayerFeatureCollection,
  type GeographicLayerImportIssue,
  type GeographicMapOverlay,
  geographicLayerFeatureCollectionSchema,
  geographicLayerImportIssueSchema,
  PROBLEM_MEDIA_TYPE,
  resourceDetailSchema,
  type SirenEntity,
} from "@hall/api-contract";
import {
  ApiError,
  apiPathFromHref,
  apiResponse,
  SirenCapabilityUnavailable,
  sirenRepresentation,
  submitSirenAction,
} from "../../services/apiClient";

const featureCollections = new Map<string, Promise<GeographicLayerFeatureCollection>>();

/** Reads the features of one layer version through the link advertised by the layer representation. */
// @implements-requirement HALL-FR-DOC-310
export function readGeographicLayerFeatures(overlay: GeographicMapOverlay): Promise<GeographicLayerFeatureCollection> {
  const key = `${overlay.layerId}.${overlay.version}`;
  const cached = featureCollections.get(key);
  if (cached) return cached;
  const pending = (async () => {
    const layer = await sirenRepresentation(`/resources/${encodeURIComponent(overlay.slug)}`);
    const link = findSirenLink(layer, "features");
    if (!link) throw new SirenCapabilityUnavailable("features");
    const response = await apiResponse(apiPathFromHref(link.href), {
      headers: { Accept: `application/geo+json, ${PROBLEM_MEDIA_TYPE}` },
    });
    return geographicLayerFeatureCollectionSchema.parse(await response.json());
  })();
  featureCollections.set(key, pending);
  pending.catch(() => featureCollections.delete(key));
  return pending;
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
