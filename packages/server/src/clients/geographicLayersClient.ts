import type { GeographicLayerFeatureCollection, ResourceDetail, SirenEntity } from "@hall/api-contract";
import type { GeographicLayerImport } from "../services/geographicLayerImport.js";
import type { ResourceRepresentation } from "./resourcesClient.js";

export type GeographicLayerDetail = Extract<ResourceDetail, { kind: "geographicLayer" }>;
export type GeographicMapDetail = Extract<ResourceDetail, { kind: "geographic" }>;

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
  readFeatures(layerId: string): Promise<GeographicLayerFeatureCollection | null>;
  /** The same collection as GeoJSON text, for the HTTP edge. */
  readFeaturesText(layerId: string): Promise<string | null>;
  setOverlay(input: {
    mapId: string;
    layerId: string;
    visible: boolean;
    opacity?: number;
  }): Promise<GeographicOverlayResult>;
  removeOverlay(mapId: string, layerId: string): Promise<GeographicOverlayResult>;
}
