import {
  geographicFeatureNoteSchema,
  geographicLayerFeatureCollectionSchema,
  municipalPropertySchema,
  resourceDetailSchema,
  type SirenEntity,
  sirenActionSchema,
  sirenLinkSchema,
} from "@hall/api-contract";
import { HallPostgresError, type PostgresResourceRequest, type PostgresResources } from "@hall/postgres";
import { type ZodType, z } from "zod";
import type {
  GeographicLayerDetail,
  GeographicLayersClient,
  GeographicMapDetail,
  GeographicOverlayResult,
} from "../../clients/geographicLayersClient.js";
import { PersistenceError } from "../../repositories/errors.js";
import type { RequestContextStore } from "../../security/requestContext.js";

const sirenEntitySchema: ZodType<SirenEntity> = z.object({
  class: z.array(z.string().min(1)).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  entities: z.array(z.unknown()).optional() as ZodType<SirenEntity["entities"]>,
  actions: z.array(sirenActionSchema).optional(),
  links: z.array(sirenLinkSchema).min(1),
  title: z.string().optional(),
});
const layerDetailSchema = resourceDetailSchema.refine(
  (resource) => resource.kind === "geographicLayer",
) as unknown as ZodType<GeographicLayerDetail>;
const mapDetailSchema = resourceDetailSchema.refine(
  (resource) => resource.kind === "geographic",
) as unknown as ZodType<GeographicMapDetail>;

function persistenceError(error: HallPostgresError): PersistenceError {
  return new PersistenceError("conflict", { cause: error, constraint: error.constraint ?? undefined });
}

// @implements-requirement HALL-FR-DOC-310
// @implements-requirement HALL-FR-DOC-330
export function createPostgresGeographicLayersClient({
  postgresResources,
  requestContext,
}: {
  postgresResources: PostgresResources;
  requestContext: RequestContextStore;
}): GeographicLayersClient {
  function currentRequest(): PostgresResourceRequest {
    const context = requestContext.current();
    if (!context?.principal) throw new Error("An authenticated request context is required for geographic layers");
    return {
      role: "hall_api_authenticated",
      context: {
        requestId: context.requestId,
        actorId: context.principal.id,
        contactId: context.principal.contactId,
        roles: context.principal.roles,
        permissions: context.principal.permissions,
      },
    };
  }

  async function overlay(
    operation: () => Promise<{ data: unknown; representation: unknown }>,
  ): Promise<GeographicOverlayResult> {
    try {
      const presented = await operation();
      return {
        status: "updated",
        map: {
          data: mapDetailSchema.parse(presented.data),
          representation: sirenEntitySchema.parse(presented.representation),
        },
      };
    } catch (error) {
      if (error instanceof HallPostgresError) {
        if (error.sqlState === "HV601") return { status: "notFound" };
        if (error.sqlState === "HV609") return { status: "kindMismatch" };
        throw persistenceError(error);
      }
      throw error;
    }
  }

  return {
    async create(input) {
      try {
        const created = await postgresResources.createGeographicLayer(currentRequest(), input);
        return {
          data: layerDetailSchema.parse(created.data),
          representation: sirenEntitySchema.parse(created.representation),
        };
      } catch (error) {
        if (error instanceof HallPostgresError) throw persistenceError(error);
        throw error;
      }
    },
    async list() {
      const listed = await postgresResources.listGeographicLayers(currentRequest());
      return {
        data: listed.data.map((layer) => layerDetailSchema.parse(layer)),
        representation: sirenEntitySchema.parse(listed.representation),
      };
    },
    async readFeatures(layerId) {
      try {
        return geographicLayerFeatureCollectionSchema.parse(
          await postgresResources.readGeographicLayerFeatures(currentRequest(), layerId),
        );
      } catch (error) {
        if (error instanceof HallPostgresError && ["HV601", "HV609"].includes(error.sqlState)) return null;
        if (error instanceof HallPostgresError) throw persistenceError(error);
        throw error;
      }
    },
    async readFeaturesText(layerId) {
      try {
        return await postgresResources.readGeographicLayerFeaturesText(currentRequest(), layerId);
      } catch (error) {
        if (error instanceof HallPostgresError && ["HV601", "HV609"].includes(error.sqlState)) return null;
        if (error instanceof HallPostgresError) throw persistenceError(error);
        throw error;
      }
    },
    async listNotes(layerId) {
      try {
        return geographicFeatureNoteSchema
          .array()
          .parse(await postgresResources.listGeographicFeatureNotes(currentRequest(), layerId));
      } catch (error) {
        if (error instanceof HallPostgresError && ["HV601", "HV609"].includes(error.sqlState)) return null;
        if (error instanceof HallPostgresError) throw persistenceError(error);
        throw error;
      }
    },
    async createNote(layerId, position) {
      try {
        const note = await postgresResources.createGeographicFeatureNote(currentRequest(), layerId, position);
        return { status: "created", note: geographicFeatureNoteSchema.parse(note) };
      } catch (error) {
        if (error instanceof HallPostgresError && error.sqlState === "HV601") return { status: "notFound" };
        if (error instanceof HallPostgresError && error.sqlState === "HV609") return { status: "withoutStableKey" };
        if (error instanceof HallPostgresError) throw persistenceError(error);
        throw error;
      }
    },
    async readMunicipalProperty() {
      const presented = await postgresResources.readMunicipalProperty(currentRequest());
      return {
        data: municipalPropertySchema.parse(presented.data),
        representation: sirenEntitySchema.parse(presented.representation),
      };
    },
    async replaceMunicipalProperty(input) {
      try {
        const presented = await postgresResources.replaceMunicipalProperty(currentRequest(), input);
        return {
          data: municipalPropertySchema.parse(presented.data),
          representation: sirenEntitySchema.parse(presented.representation),
        };
      } catch (error) {
        if (error instanceof HallPostgresError) throw persistenceError(error);
        throw error;
      }
    },
    setOverlay(input) {
      return overlay(() => postgresResources.setGeographicMapOverlay(currentRequest(), input));
    },
    removeOverlay(mapId, layerId) {
      return overlay(() => postgresResources.removeGeographicMapOverlay(currentRequest(), mapId, layerId));
    },
  };
}
