import {
  SIREN_MEDIA_TYPE,
  editorAssetSchema,
  type RelocateResource,
  type ResourceDetail,
  resourceCatalogSchema,
  resourceDetailSchema,
  resourceIdSchema,
  resourceReferenceSchema,
  resourceSearchResultSchema,
  resourceSummarySchema,
  type SirenEntity,
  sirenActionSchema,
  sirenLinkSchema,
  type UpdateResourceContent,
  type UpdateResourceMetadata,
} from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import {
  HallPostgresError,
  type PostgresPresentedResource,
  type PostgresResourceDetail,
  type PostgresResourceRequest,
  type PostgresResources,
} from "@hall/postgres";
import { type ZodType, z } from "zod";
import type {
  PersistResource,
  ResourceContent,
  ResourceMutationResult,
  ResourceRepresentation,
  ResourcesClient,
} from "../../clients/resourcesClient.js";
import { PersistenceError } from "../../repositories/errors.js";
import type { RequestContextStore } from "../../security/requestContext.js";

type RepositoryOperation<T> = () => Promise<T>;

const documentaryEmbeddedEntitySchema = z.object({
  rel: z.array(z.string().min(1)).min(1),
  class: z.array(z.string().min(1)).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  actions: z.array(sirenActionSchema).optional(),
  links: z.array(sirenLinkSchema).min(1),
  title: z.string().optional(),
});
const documentarySirenEntitySchema: ZodType<SirenEntity> = z.object({
  class: z.array(z.string().min(1)).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  entities: z.array(z.union([documentaryEmbeddedEntitySchema, sirenLinkSchema])).optional(),
  actions: z.array(sirenActionSchema).optional(),
  links: z.array(sirenLinkSchema).min(1),
  title: z.string().optional(),
});

function documentaryRepresentation<Data>(
  value: { data: unknown; representation: unknown },
  dataSchema: ZodType<Data>,
): ResourceRepresentation<Data> {
  return {
    data: dataSchema.parse(value.data),
    representation: documentarySirenEntitySchema.parse(value.representation),
  };
}

// @implements-requirement HALL-FR-DOC-280
function resourceDetail(
  value: PostgresPresentedResource<PostgresResourceDetail>,
): ResourceRepresentation<ResourceDetail> {
  const resource = documentaryRepresentation(value, resourceDetailSchema);
  if (resource.data.kind !== "text") return resource;
  return {
    ...resource,
    representation: {
      ...resource.representation,
      links: [
        ...resource.representation.links,
        {
          rel: ["changes"],
          href: `/api/resources/${encodeURIComponent(resource.data.slug)}/changes`,
          type: SIREN_MEDIA_TYPE,
        },
      ],
    },
  };
}

function persistenceError(error: HallPostgresError): PersistenceError {
  return new PersistenceError("conflict", { cause: error, constraint: error.constraint ?? undefined });
}

export function createPostgresResourcesClient({
  postgresResources,
  requestContext,
}: {
  postgresResources: PostgresResources;
  requestContext: RequestContextStore;
}): ResourcesClient {
  function currentRequest(): PostgresResourceRequest {
    const context = requestContext.current();
    if (!context?.principal) throw new Error("An authenticated request context is required for documentary storage");
    return {
      role: "hall_api_authenticated",
      context: {
        requestId: context.requestId,
        actorId: context.principal.id,
        contactId: context.principal.contactId,
        roles: context.principal.roles,
      },
    };
  }

  async function read<T>(operation: RepositoryOperation<T>): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HallPostgresError && ["HV601", "HV602"].includes(error.sqlState)) return null;
      if (error instanceof HallPostgresError) throw persistenceError(error);
      throw error;
    }
  }

  async function mutate(
    operation: RepositoryOperation<PostgresPresentedResource<PostgresResourceDetail>>,
  ): Promise<ResourceMutationResult> {
    try {
      return { status: "updated", resource: resourceDetail(await operation()) };
    } catch (error) {
      if (error instanceof HallPostgresError) {
        if (error.sqlState === "HV601") return { status: "notFound" };
        if (error.sqlState === "HV608") return { status: "versionConflict" };
        if (error.sqlState === "HV609") return { status: "kindMismatch" };
        throw persistenceError(error);
      }
      throw error;
    }
  }

  async function resolveId(reference: string): Promise<string | null> {
    const parsed = resourceReferenceSchema.parse(reference);
    if (resourceIdSchema.safeParse(parsed).success) return parsed;
    const found = await read(() => postgresResources.openBySlug(currentRequest(), parsed));
    return found?.data.id ?? null;
  }

  return {
    async listAll() {
      return documentaryRepresentation(await postgresResources.listResources(currentRequest()), resourceCatalogSchema);
    },
    async listFolder(path) {
      const listing = await read(() => postgresResources.listFolder(currentRequest(), path));
      return listing ? documentaryRepresentation(listing, resourceSummarySchema.array()) : null;
    },
    async findDocumentsByHashes(hashes) {
      return documentaryRepresentation(
        await postgresResources.findDocumentsByHashes(currentRequest(), hashes),
        resourceSummarySchema.array(),
      );
    },
    async search(criteria) {
      return documentaryRepresentation(
        await postgresResources.searchResources(currentRequest(), criteria),
        resourceSearchResultSchema,
      );
    },
    async open(reference) {
      const parsed = resourceReferenceSchema.parse(reference);
      const found = await read(() =>
        resourceIdSchema.safeParse(parsed).success
          ? postgresResources.open(currentRequest(), parsed)
          : postgresResources.openBySlug(currentRequest(), parsed),
      );
      return found ? resourceDetail(found) : null;
    },
    listTextResourceChanges(id) {
      return postgresResources.listTextResourceChanges(currentRequest(), id);
    },
    async create(input: PersistResource) {
      const created = await matchDiscriminated(input, "kind", {
        folder: (entry) => postgresResources.createFolder(currentRequest(), entry),
        text: (entry) => postgresResources.createText(currentRequest(), entry),
        remote: (entry) => postgresResources.createRemote(currentRequest(), entry),
        spreadsheet: (entry) => postgresResources.createSpreadsheet(currentRequest(), entry),
        geographic: (entry) => postgresResources.createGeographic(currentRequest(), entry),
        event: (entry) => postgresResources.createEvent(currentRequest(), entry),
        legalReference: (entry) => postgresResources.createLegalReference(currentRequest(), entry),
      }).catch((error: unknown) => {
        if (error instanceof HallPostgresError) throw persistenceError(error);
        throw error;
      });
      return resourceDetail(created);
    },
    async createDocument(input) {
      try {
        return resourceDetail(await postgresResources.createDocument(currentRequest(), input));
      } catch (error) {
        if (error instanceof HallPostgresError) throw persistenceError(error);
        throw error;
      }
    },
    async relocate(reference: string, input: RelocateResource) {
      const id = await resolveId(reference);
      if (!id) return { status: "notFound" };
      return mutate(() => postgresResources.relocate(currentRequest(), id, input.path, input.name));
    },
    async updateMetadata(reference: string, input: UpdateResourceMetadata) {
      const id = await resolveId(reference);
      if (!id) return { status: "notFound" };
      return mutate(() => postgresResources.updateMetadata(currentRequest(), { id, ...input }));
    },
    async updateContent(reference: string, input: UpdateResourceContent, referencedEditorAssetIds = []) {
      const id = await resolveId(reference);
      if (!id) return { status: "notFound" };
      return matchDiscriminated(input, "kind", {
        text: (entry) =>
          mutate(() =>
            postgresResources.updateText(currentRequest(), {
              id,
              ...entry,
              referencedEditorAssetIds: [...referencedEditorAssetIds],
            }),
          ),
        remote: (entry) => mutate(() => postgresResources.updateRemote(currentRequest(), { id, ...entry })),
        spreadsheet: (entry) => mutate(() => postgresResources.updateSpreadsheet(currentRequest(), { id, ...entry })),
        geographic: (entry) => mutate(() => postgresResources.updateGeographic(currentRequest(), { id, ...entry })),
        event: (entry) => mutate(() => postgresResources.updateEvent(currentRequest(), { id, ...entry })),
        legalReference: (entry) =>
          mutate(() => postgresResources.updateLegalReference(currentRequest(), { id, ...entry })),
      });
    },
    async resolveLegalReference(reference, input) {
      const id = await resolveId(reference);
      if (!id) return { status: "notFound" };
      return mutate(() =>
        postgresResources.resolveLegalReference(currentRequest(), {
          id,
          expectedVersion: input.expectedVersion,
          name: input.name,
          document: input.document,
        }),
      );
    },
    async createEditorAsset(input) {
      try {
        return documentaryRepresentation(
          await postgresResources.createEditorAsset(currentRequest(), input),
          editorAssetSchema,
        );
      } catch (error) {
        if (error instanceof HallPostgresError) throw persistenceError(error);
        throw error;
      }
    },
    async openEditorAsset(id) {
      const found = await postgresResources.openEditorAsset(currentRequest(), resourceIdSchema.parse(id));
      return found ? documentaryRepresentation(found, editorAssetSchema) : null;
    },
    readEditorAssetContent(id) {
      return postgresResources.readEditorAssetContent(currentRequest(), resourceIdSchema.parse(id));
    },
    readBinaryReferenceContent(id) {
      return postgresResources.readBinaryReferenceContent(currentRequest(), resourceIdSchema.parse(id));
    },
    async replaceDocumentContent(reference, input) {
      const id = await resolveId(reference);
      if (!id) return { status: "notFound" };
      return mutate(() => postgresResources.replaceDocumentContent(currentRequest(), { id, ...input }));
    },
    async readDocumentContent(reference): Promise<ResourceContent | null> {
      const id = await resolveId(reference);
      if (!id) return null;
      return read(() => postgresResources.readDocumentContent(currentRequest(), id));
    },
    async delete(reference) {
      const id = await resolveId(reference);
      if (!id) return null;
      try {
        return documentaryRepresentation(await postgresResources.delete(currentRequest(), id), resourceSummarySchema);
      } catch (error) {
        if (error instanceof HallPostgresError && error.sqlState === "HV601") return null;
        if (error instanceof HallPostgresError) throw persistenceError(error);
        throw error;
      }
    },
  };
}
