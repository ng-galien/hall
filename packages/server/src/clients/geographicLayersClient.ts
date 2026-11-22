import type {
  CreatedGeographicFeatureNote,
  GeographicFeatureNote,
  GeographicLayerFeatureCollection,
  MunicipalProperty,
  ResourceDetail,
  SirenEntity,
} from "@hall/api-contract";
import type { GeographicLayerImport } from "../services/geographicLayerImport.js";
import type { ResourceRepresentation } from "./resourcesClient.js";

export type GeographicLayerDetail = Extract<ResourceDetail, { kind: "geographicLayer" }>;
export type GeographicMapDetail = Extract<ResourceDetail, { kind: "geographic" }>;

export type GeographicInitialContent =
  | { kind: "text"; content: string; referencedEditorAssetIds: string[] }
  | {
      kind: "image";
      title: string;
      fileName: string;
      content: Buffer;
      mediaType: "image/jpeg" | "image/png";
      contentSha256: string;
      serialize(id: string): string;
      existingAssetId(content: string): string | undefined;
    };

export type GeographicOverlayResult =
  | { status: "updated"; map: ResourceRepresentation<GeographicMapDetail> }
  | { status: "notFound" }
  | { status: "kindMismatch" };

/** Server-side client for the geographic layer operations exposed by PostgreSQL. */
// @implements-requirement HALL-FR-DOC-310
// @implements-requirement HALL-FR-DOC-330
export interface GeographicLayersClient {
  create(
    input: GeographicLayerImport & {
      path: string;
      name: string;
      councilBusinessId?: string;
      geographicResourceId?: string;
    },
  ): Promise<ResourceRepresentation<GeographicLayerDetail>>;
  list(): Promise<{ data: GeographicLayerDetail[]; representation: SirenEntity }>;
  /** Every feature of a layer, or only those whose extent crosses `within`, a frame in WGS84 degrees. */
  readFeatures(
    layerId: string,
    within?: Readonly<{ west: number; south: number; east: number; north: number }>,
  ): Promise<GeographicLayerFeatureCollection | null>;
  /** The same collection as GeoJSON text, for the HTTP edge. */
  readFeaturesText(layerId: string): Promise<string | null>;
  setOverlay(input: {
    mapId: string;
    layerId: string;
    visible: boolean;
    opacity?: number;
  }): Promise<GeographicOverlayResult>;
  removeOverlay(mapId: string, layerId: string): Promise<GeographicOverlayResult>;
  listNotes(layerId: string): Promise<GeographicFeatureNote[] | null>;
  listDrawnElementNotes(mapId: string): Promise<GeographicFeatureNote[] | null>;
  createDrawnElementNote(
    mapId: string,
    elementId: string,
    initial?: GeographicInitialContent,
  ): Promise<
    { status: "created"; note: CreatedGeographicFeatureNote } | { status: "notFound" } | { status: "measurement" }
  >;
  createNote(
    layerId: string,
    position: number,
    initial?: GeographicInitialContent,
  ): Promise<
    { status: "created"; note: CreatedGeographicFeatureNote } | { status: "notFound" } | { status: "withoutStableKey" }
  >;
  readMunicipalProperty(): Promise<ResourceRepresentation<MunicipalProperty>>;
  replaceMunicipalProperty(input: {
    label: string;
    fileName: string | null;
    importerName: string;
    parcelIds: readonly string[];
  }): Promise<ResourceRepresentation<MunicipalProperty>>;
}
