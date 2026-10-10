import type { SirenEntity } from "@hall/api-contract";
import type { GeographicLayersClient, GeographicOverlayResult } from "../clients/geographicLayersClient.js";
import type { ResourcesClient } from "../clients/resourcesClient.js";
import { DomainError } from "./errors.js";
import { parseGeographicLayerImport } from "./geographicLayerImport.js";

export interface GeographicLayerFeatures {
  version: number;
  layerId: string;
  /** GeoJSON text of the whole layer. */
  readText(): Promise<string>;
}

export interface GeographicLayerService {
  importLayer(input: {
    path: string;
    name: string;
    fileName: string;
    content: Buffer;
    councilBusinessId?: string;
    geographicResourceId?: string;
  }): Promise<SirenEntity>;
  list(): Promise<SirenEntity>;
  features(reference: string): Promise<GeographicLayerFeatures>;
  link(mapReference: string, input: { layerId: string; visible: boolean; opacity?: number }): Promise<SirenEntity>;
  unlink(mapReference: string, layerId: string): Promise<SirenEntity>;
}

// @implements-requirement HALL-FR-DOC-310
// @implements-requirement HALL-FR-DOC-320
// @implements-requirement HALL-FR-DOC-330
export function createGeographicLayerService({
  geographicLayersClient,
  resourcesClient,
}: {
  geographicLayersClient: GeographicLayersClient;
  resourcesClient: ResourcesClient;
}): GeographicLayerService {
  const requireResource = async (reference: string, kind: "geographic" | "geographicLayer") => {
    const resource = await resourcesClient.open(reference);
    if (!resource) throw new DomainError("resource_not_found", 404);
    if (resource.data.kind !== kind) throw new DomainError("invalid_request", 400);
    return resource.data;
  };
  const requireOverlay = (result: GeographicOverlayResult): SirenEntity => {
    if (result.status === "notFound") throw new DomainError("resource_not_found", 404);
    if (result.status === "kindMismatch") throw new DomainError("invalid_request", 400);
    return result.map.representation;
  };

  return {
    async importLayer(input) {
      const parsed = parseGeographicLayerImport({ fileName: input.fileName, content: input.content });
      if (input.geographicResourceId) await requireResource(input.geographicResourceId, "geographic");
      const created = await geographicLayersClient.create({
        ...parsed,
        path: input.path,
        name: input.name,
        ...(input.councilBusinessId ? { councilBusinessId: input.councilBusinessId } : {}),
        ...(input.geographicResourceId ? { geographicResourceId: input.geographicResourceId } : {}),
      });
      return created.representation;
    },
    async list() {
      return (await geographicLayersClient.list()).representation;
    },
    async features(reference) {
      const layer = await requireResource(reference, "geographicLayer");
      if (layer.kind !== "geographicLayer") throw new DomainError("invalid_request", 400);
      return {
        version: layer.version,
        layerId: layer.id,
        async readText() {
          const text = await geographicLayersClient.readFeaturesText(layer.id);
          if (text === null) throw new DomainError("resource_not_found", 404);
          return text;
        },
      };
    },
    async link(mapReference, input) {
      const map = await requireResource(mapReference, "geographic");
      return requireOverlay(await geographicLayersClient.setOverlay({ mapId: map.id, ...input }));
    },
    async unlink(mapReference, layerId) {
      const map = await requireResource(mapReference, "geographic");
      return requireOverlay(await geographicLayersClient.removeOverlay(map.id, layerId));
    },
  };
}
