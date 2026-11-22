import type { CreatedGeographicFeatureNote, CreateGeographicFeatureNote, SirenEntity } from "@hall/api-contract";
import { cadastreParcelIdsInText } from "@hall/domain";
import { serializeImageDirective } from "@hall/templating";
import type {
  GeographicInitialContent,
  GeographicLayersClient,
  GeographicOverlayResult,
} from "../clients/geographicLayersClient.js";
import type { ResourcesClient } from "../clients/resourcesClient.js";
import { inspectEditorImage, referencedEditorAssetIds } from "./editorAssetInput.js";
import { DomainError } from "./errors.js";
import { parseGeographicLayerImport } from "./geographicLayerImport.js";

export interface GeographicLayerFeatures {
  version: number;
  layerId: string;
  /** GeoJSON text of the whole layer. */
  readText(): Promise<string>;
}

interface GeographicNoteImage {
  title: string;
  fileName: string;
  content: Buffer;
}

async function initialNoteContent(
  content?: string,
  image?: GeographicNoteImage,
): Promise<GeographicInitialContent | undefined> {
  if (!image)
    return content === undefined
      ? undefined
      : {
          kind: "text",
          content,
          referencedEditorAssetIds: referencedEditorAssetIds(content),
        };
  if (content !== undefined) throw new DomainError("invalid_request", 400);
  const inspection = await inspectEditorImage(image.fileName, image.content);
  const serialize = (id: string) => serializeImageDirective({ id, alt: image.title });
  return {
    kind: "image",
    ...image,
    ...inspection,
    serialize,
    existingAssetId(markdown) {
      return referencedEditorAssetIds(markdown).find((id) => serialize(id) === markdown);
    },
  };
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
  notes(reference: string): Promise<SirenEntity>;
  createNote(
    reference: string,
    subject: CreateGeographicFeatureNote,
    image?: GeographicNoteImage,
  ): Promise<CreatedGeographicFeatureNote>;
  municipalProperty(): Promise<SirenEntity>;
  importMunicipalProperty(input: {
    label: string;
    fileName: string | null;
    text: string;
    importerName: string;
  }): Promise<SirenEntity | { rejected: string[] }>;
}

// @implements-requirement HALL-FR-DOC-310
// @implements-requirement HALL-FR-DOC-320
// @implements-requirement HALL-FR-DOC-330
// @implements-requirement HALL-FR-DOC-390
// @implements-requirement HALL-FR-DOC-400
// @implements-requirement HALL-FR-DOC-430
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
    async notes(reference) {
      const resource = await resourcesClient.open(reference);
      if (!resource) throw new DomainError("resource_not_found", 404);
      const subject = resource.data;
      if (subject.kind !== "geographic" && subject.kind !== "geographicLayer") {
        throw new DomainError("invalid_request", 400);
      }
      const notes =
        subject.kind === "geographic"
          ? await geographicLayersClient.listDrawnElementNotes(subject.id)
          : await geographicLayersClient.listNotes(subject.id);
      if (!notes) throw new DomainError("resource_not_found", 404);
      return {
        class: ["geographic-feature-notes"],
        properties: { items: notes },
        links: [{ rel: ["self"], href: `/api/resources/${encodeURIComponent(subject.slug)}/feature-notes` }],
      };
    },
    async createNote(reference, subject, image) {
      const initial = await initialNoteContent(subject.initialContent, image);
      if ("elementId" in subject) {
        const map = await requireResource(reference, "geographic");
        const result = await geographicLayersClient.createDrawnElementNote(map.id, subject.elementId, initial);
        if (result.status === "notFound") throw new DomainError("resource_not_found", 404);
        if (result.status === "measurement") throw new DomainError("invalid_request", 400);
        return result.note;
      }
      const layer = await requireResource(reference, "geographicLayer");
      const result = await geographicLayersClient.createNote(layer.id, subject.position, initial);
      if (result.status === "notFound") throw new DomainError("resource_not_found", 404);
      if (result.status === "withoutStableKey") throw new DomainError("invalid_request", 400);
      return result.note;
    },
    async municipalProperty() {
      return (await geographicLayersClient.readMunicipalProperty()).representation;
    },
    async importMunicipalProperty(input) {
      const { parcelIds, rejected } = cadastreParcelIdsInText(input.text);
      if (parcelIds.length === 0) return { rejected };
      const replaced = await geographicLayersClient.replaceMunicipalProperty({
        label: input.label,
        fileName: input.fileName,
        importerName: input.importerName,
        parcelIds,
      });
      return {
        ...replaced.representation,
        properties: { ...replaced.representation.properties, rejected: rejected.slice(0, 200) },
      };
    },
  };
}
