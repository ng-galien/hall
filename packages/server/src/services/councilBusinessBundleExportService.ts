import { type CouncilBusinessBundleManifest, resourceIdSchema } from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import { collectResourceReferences, parse } from "@hall/templating";
import type { CouncilClient } from "../clients/councilClient.js";
import type { GeographicLayersClient } from "../clients/geographicLayersClient.js";
import type { ResourceContent, ResourcesClient } from "../clients/resourcesClient.js";
import { bundleContentHash, encodeCouncilBusinessBundle } from "./councilBusinessBundleArchive.js";
import { DomainError } from "./errors.js";
import { parseGeographicLayerImport } from "./geographicLayerImport.js";

// @implements-requirement HALL-FR-DOC-330
export function createCouncilBusinessBundleExportService({
  councilClient,
  resourcesClient,
  geographicLayersClient,
}: {
  councilClient: Pick<CouncilClient, "openBusiness" | "listBusinessResources">;
  resourcesClient: Pick<
    ResourcesClient,
    "open" | "listAll" | "readDocumentContent" | "openEditorAsset" | "readEditorAssetContent"
  >;
  geographicLayersClient: Pick<GeographicLayersClient, "readFeatures" | "listNotes" | "readMunicipalProperty">;
}) {
  return {
    async export(id: string, sender: CouncilBusinessBundleManifest["sender"]): Promise<Buffer> {
      const business = await councilClient.openBusiness(id);
      if (!business) throw new DomainError("council_business_not_found", 404);
      const folder = await resourcesClient.open(business.folderResourceId);
      if (!folder) throw new DomainError("resource_not_found", 404);
      const associations = await councilClient.listBusinessResources(id);
      const manifest: CouncilBusinessBundleManifest = {
        format: "hall-council-business",
        version: 1,
        sender,
        business: {
          sourceId: id,
          folderSourceId: folder.data.id,
          name: folder.data.name,
          reportSourceId: business.reportResourceId,
          resourceSourceIds: associations.map((entry) => entry.resourceId),
        },
        resources: [],
        files: [],
        editorAssets: [],
        externalReferenceIds: [],
        geographicFeatureNotes: [],
        municipalProperty: null,
      };
      const carriedParcelIds = new Set<string>();
      const files = new Map<string, Buffer>();
      const putFile = (binary: ResourceContent): string => {
        const sha256 = bundleContentHash(binary.content);
        if (sha256 !== binary.contentSha256 || binary.content.length !== binary.byteSize) {
          throw new Error("Stored binary integrity mismatch");
        }
        const path = `blobs/${sha256}`;
        if (!files.has(path)) {
          files.set(path, binary.content);
          manifest.files.push({ path, sha256, byteSize: binary.byteSize, mediaType: binary.mediaType });
        }
        return path;
      };
      const descendants = (await resourcesClient.listAll()).data.filter((entry) =>
        entry.fullPath.startsWith(`${folder.data.fullPath}/`),
      );
      const ids = new Set([
        folder.data.id,
        business.reportResourceId,
        ...descendants.map(({ id: resourceId }) => resourceId),
        ...associations.map((entry) => entry.resourceId),
      ]);
      const references = new Set<string>();
      for (const sourceId of ids) {
        const resource = await resourcesClient.open(sourceId);
        if (!resource) throw new DomainError("resource_not_found", 404);
        const data = resource.data;
        await matchDiscriminated(data, "kind", {
          folder: async (entry) => {
            manifest.resources.push({ data: entry });
          },
          text: async (entry) => {
            manifest.resources.push({ data: entry });
            for (const reference of collectResourceReferences(parse(entry.content))) references.add(reference.id);
          },
          remote: async (entry) => {
            manifest.resources.push({ data: entry });
          },
          spreadsheet: async (entry) => {
            manifest.resources.push({ data: entry });
          },
          geographic: async (entry) => {
            manifest.resources.push({ data: entry });
            for (const overlay of entry.overlays) ids.add(overlay.layerId);
          },
          event: async (entry) => {
            manifest.resources.push({ data: entry });
          },
          legalReference: async (entry) => {
            manifest.resources.push({ data: entry });
          },
          geographicLayer: async (entry) => {
            const collection = await geographicLayersClient.readFeatures(entry.id);
            if (!collection) throw new DomainError("resource_not_found", 404);
            const { featureKeyRule, features } = parseGeographicLayerImport({
              fileName: entry.source.fileName,
              content: Buffer.from(
                JSON.stringify({
                  type: "FeatureCollection",
                  features: collection.features.map(({ sourceId, geometry, properties }) => ({
                    type: "Feature",
                    ...(sourceId === null ? {} : { id: sourceId }),
                    geometry,
                    properties,
                  })),
                }),
              ),
            });
            const content = Buffer.from(
              JSON.stringify({ source: entry.source, featureKeyRule, propertyKeys: entry.propertyKeys, features }),
            );
            if (featureKeyRule.kind === "cadastreParcel") {
              for (const feature of features) if (feature.key) carriedParcelIds.add(feature.key);
            }
            for (const note of (await geographicLayersClient.listNotes(entry.id)) ?? []) {
              ids.add(note.noteId);
              if (manifest.geographicFeatureNotes.some(({ noteSourceId }) => noteSourceId === note.noteId)) continue;
              manifest.geographicFeatureNotes.push({
                noteSourceId: note.noteId,
                subjectKind: note.subjectKind,
                layerSourceId: note.subjectKind === "layerFeature" ? entry.id : null,
                key: note.key,
              });
            }
            manifest.resources.push({
              data: entry,
              binaryPath: putFile({
                content,
                mediaType: "application/json",
                byteSize: content.length,
                contentSha256: bundleContentHash(content),
              }),
            });
          },
          document: async (entry) => {
            const binary = await resourcesClient.readDocumentContent(sourceId);
            if (!binary) throw new DomainError("resource_not_found", 404);
            manifest.resources.push({ data: entry, binaryPath: putFile(binary) });
          },
        });
      }
      if (carriedParcelIds.size > 0) {
        const property = (await geographicLayersClient.readMunicipalProperty()).data;
        const parcels = property.parcelIds
          .filter((parcelId) => carriedParcelIds.has(parcelId))
          .map((parcelId) => ({ parcelId, sourceId: property.parcelSourceIds[parcelId]! }));
        const sourceIds = new Set(parcels.map(({ sourceId }) => sourceId));
        if (parcels.length > 0) {
          manifest.municipalProperty = {
            sources: property.sources
              .filter(({ id: sourceId }) => sourceIds.has(sourceId))
              .map(({ id: sourceId, label, fileName, importedAt, importedBy }) => ({
                id: sourceId,
                label,
                fileName,
                importedAt,
                importedBy,
              })),
            parcels,
          };
        }
      }
      for (const reference of references) {
        if (ids.has(reference)) continue;
        if (!resourceIdSchema.safeParse(reference).success) {
          manifest.externalReferenceIds.push(reference);
          continue;
        }
        const asset = await resourcesClient.openEditorAsset(reference);
        if (!asset || !ids.has(asset.data.owner.id)) {
          manifest.externalReferenceIds.push(reference);
          continue;
        }
        const binary = await resourcesClient.readEditorAssetContent(reference);
        if (!binary) throw new DomainError("resource_not_found", 404);
        manifest.editorAssets.push({ data: asset.data, binaryPath: putFile(binary) });
      }
      return encodeCouncilBusinessBundle({ manifest, files });
    },
  };
}
