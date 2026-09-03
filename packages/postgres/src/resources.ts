import type { Pool, PoolClient, QueryResultRow } from "pg";
import { type ZodType, z } from "zod";
import { recordAuditEvent } from "./audit.js";
import type { PostgresCallContext, PostgresRequest } from "./callContext.js";
import { ProjectionValidationError } from "./errors.js";
import { callJson } from "./jsonCall.js";
import { PostgresTransactionManager } from "./transaction.js";

export const postgresResourceKinds = [
  "folder",
  "text",
  "remote",
  "spreadsheet",
  "geographic",
  "document",
  "legalReference",
] as const;

const resourceKindSchema = z.enum(postgresResourceKinds);
export const resourcePathSchema = z
  .string()
  .refine(
    (path) =>
      path === "" ||
      (path === path.trim() &&
        !path.startsWith("/") &&
        !path.endsWith("/") &&
        !path.includes("//") &&
        !path.split("/").some((segment) => segment === "." || segment === "..")),
    "Resource path must be normalized",
  );
export const resourceNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((name) => !name.includes("/") && name !== "." && name !== "..", "Resource name is invalid");
export const resourceIdSchema = z.string().uuid();
const resourceSlugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine((slug) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(slug));
const versionSchema = z.number().int().positive();
const jsonDocumentSchema = z.record(z.string(), z.unknown());
const remoteResourceTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unconfigured") }),
  z.object({ kind: z.literal("url"), url: z.string().trim().min(1) }),
]);

const resourceIdentitySchema = z.object({
  id: resourceIdSchema,
  slug: resourceSlugSchema,
  path: resourcePathSchema,
  name: resourceNameSchema,
  fullPath: z.string(),
  kind: resourceKindSchema,
});
const resourceStateSchema = z.object({
  readiness: z.enum(["incomplete", "empty", "ready"]),
  availability: z.enum(["unchecked", "available", "unavailable"]).nullable(),
});
const resourcePresentationSchema = resourceIdentitySchema.extend({
  tags: z.array(z.string().trim().min(1)),
  state: resourceStateSchema,
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
const binarySummarySchema = z.object({
  id: resourceIdSchema,
  mediaType: z.string().trim().min(1),
  byteSize: z.number().int().nonnegative().safe(),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
});

const resourceCatalogEntrySchema = resourceIdentitySchema;
export const postgresResourceCatalogSchema = z.array(resourceCatalogEntrySchema);

const folderResourceSummarySchema = resourcePresentationSchema.extend({ kind: z.literal("folder") });
const textResourceSummarySchema = resourcePresentationSchema.extend({
  kind: z.literal("text"),
  autosaveEnabled: z.boolean(),
});
const remoteResourceSummarySchema = resourcePresentationSchema.extend({
  kind: z.literal("remote"),
  autosaveEnabled: z.boolean(),
});
const spreadsheetResourceSummarySchema = resourcePresentationSchema.extend({
  kind: z.literal("spreadsheet"),
  autosaveEnabled: z.boolean(),
});
const geographicResourceSummarySchema = resourcePresentationSchema.extend({
  kind: z.literal("geographic"),
  autosaveEnabled: z.boolean(),
});
const legalReferenceResourceSummarySchema = resourcePresentationSchema.extend({ kind: z.literal("legalReference") });
const documentResourceSummarySchema = resourcePresentationSchema.extend({
  kind: z.literal("document"),
  binary: binarySummarySchema,
});

export const postgresResourceSummarySchema = z.discriminatedUnion("kind", [
  folderResourceSummarySchema,
  textResourceSummarySchema,
  remoteResourceSummarySchema,
  spreadsheetResourceSummarySchema,
  geographicResourceSummarySchema,
  legalReferenceResourceSummarySchema,
  documentResourceSummarySchema,
]);
export const postgresResourceSearchResultSchema = z.object({
  items: z.array(postgresResourceSummarySchema),
  facets: z.object({
    paths: z.array(resourcePathSchema),
    tags: z.array(z.string().trim().min(1)),
    readiness: z.array(resourceStateSchema.shape.readiness),
    media: z.array(z.literal("image")),
  }),
});

const folderResourceSchema = folderResourceSummarySchema;
const textResourceSchema = textResourceSummarySchema.extend({ content: z.string(), version: versionSchema });
const remoteResourceSchema = remoteResourceSummarySchema.extend({
  target: remoteResourceTargetSchema,
  version: versionSchema,
});
const spreadsheetResourceSchema = spreadsheetResourceSummarySchema.extend({
  document: jsonDocumentSchema,
  version: versionSchema,
});
const geographicResourceSchema = geographicResourceSummarySchema.extend({
  document: jsonDocumentSchema,
  version: versionSchema,
});
const legalReferenceResourceSchema = legalReferenceResourceSummarySchema.extend({
  document: jsonDocumentSchema,
  version: versionSchema,
});
const documentResourceSchema = documentResourceSummarySchema;

export const postgresResourceDetailSchema = z.discriminatedUnion("kind", [
  folderResourceSchema,
  textResourceSchema,
  remoteResourceSchema,
  spreadsheetResourceSchema,
  geographicResourceSchema,
  documentResourceSchema,
  legalReferenceResourceSchema,
]);

export const postgresFolderListingSchema = z.object({
  path: resourcePathSchema,
  folder: postgresResourceSummarySchema.nullable(),
  resources: z.array(postgresResourceSummarySchema),
});

export type PostgresResourceKind = z.infer<typeof resourceKindSchema>;
export type PostgresResourceSummary = z.infer<typeof postgresResourceSummarySchema>;
export type PostgresResourceSearchResult = z.infer<typeof postgresResourceSearchResultSchema>;
export type PostgresResourceCatalog = z.infer<typeof postgresResourceCatalogSchema>;
export type PostgresResourceDetail = z.infer<typeof postgresResourceDetailSchema>;
export type PostgresFolderListing = z.infer<typeof postgresFolderListingSchema>;
export type PostgresFolderResource = z.infer<typeof folderResourceSchema>;
export type PostgresTextResource = z.infer<typeof textResourceSchema>;
export type PostgresRemoteResource = z.infer<typeof remoteResourceSchema>;
export type PostgresSpreadsheetResource = z.infer<typeof spreadsheetResourceSchema>;
export type PostgresGeographicResource = z.infer<typeof geographicResourceSchema>;
export type PostgresLegalReferenceResource = z.infer<typeof legalReferenceResourceSchema>;
export type PostgresDocumentResource = z.infer<typeof documentResourceSchema>;

export type PostgresResourceRequest = PostgresRequest;
export type PostgresResourceSearchCriteria = Readonly<{
  query: string;
  paths: readonly string[];
  kinds: readonly PostgresResourceKind[];
  tags: readonly string[];
  readiness: readonly ("incomplete" | "empty" | "ready")[];
  media: readonly "image"[];
}>;

export type PostgresDocumentContent = Readonly<{
  content: Buffer;
  mediaType: string;
  byteSize: number;
  contentSha256: string;
}>;

const createFolderInputSchema = z.object({ path: resourcePathSchema, name: resourceNameSchema });
const createTextInputSchema = createFolderInputSchema.extend({ content: z.string() });
const createRemoteInputSchema = createFolderInputSchema.extend({ target: remoteResourceTargetSchema });
const createStructuredInputSchema = createFolderInputSchema.extend({ document: jsonDocumentSchema });
const createDocumentInputSchema = createFolderInputSchema.extend({
  mediaType: z.string().trim().min(1),
  content: z.instanceof(Buffer),
});
const updateTextInputSchema = z.object({ id: resourceIdSchema, expectedVersion: versionSchema, content: z.string() });
const updateTextWithAssetsInputSchema = updateTextInputSchema.extend({
  referencedEditorAssetIds: z.array(resourceIdSchema),
});
const updateRemoteInputSchema = z.object({
  id: resourceIdSchema,
  expectedVersion: versionSchema,
  target: remoteResourceTargetSchema,
});
const updateStructuredInputSchema = z.object({
  id: resourceIdSchema,
  expectedVersion: versionSchema,
  document: jsonDocumentSchema,
});
const replaceDocumentInputSchema = z.object({
  id: resourceIdSchema,
  mediaType: z.string().trim().min(1),
  content: z.instanceof(Buffer),
});
const updateMetadataInputSchema = z.object({
  id: resourceIdSchema,
  path: resourcePathSchema,
  name: resourceNameSchema,
  tags: z.array(z.string().trim().min(1)),
  editing: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("fixed") }),
    z.object({ kind: z.literal("autosave"), enabled: z.boolean() }),
  ]),
});

type CreateFolderInput = z.input<typeof createFolderInputSchema>;
type CreateTextInput = z.input<typeof createTextInputSchema>;
type CreateRemoteInput = z.input<typeof createRemoteInputSchema>;
type CreateStructuredInput = z.input<typeof createStructuredInputSchema>;
type CreateDocumentInput = z.input<typeof createDocumentInputSchema>;
type UpdateTextWithAssetsInput = z.input<typeof updateTextWithAssetsInputSchema>;
type UpdateRemoteInput = z.input<typeof updateRemoteInputSchema>;
type UpdateStructuredInput = z.input<typeof updateStructuredInputSchema>;
type ReplaceDocumentInput = z.input<typeof replaceDocumentInputSchema>;
type UpdateMetadataInput = z.input<typeof updateMetadataInputSchema>;

type JsonCall = Readonly<{ text: string; values?: readonly unknown[] }>;

type DocumentContentRow = QueryResultRow & {
  content: unknown;
  mediaType: unknown;
  byteSize: unknown;
  contentSha256: unknown;
};

const documentContentRowSchema = z.object({
  content: z.instanceof(Buffer),
  mediaType: z.string().trim().min(1),
  byteSize: z.string().regex(/^\d+$/),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
});

const postgresSirenLinkSchema = z.object({
  rel: z.array(z.string().min(1)).min(1),
  href: z.string().min(1),
  type: z.string().optional(),
});
const postgresSirenActionSchema = z.object({
  name: z.string().min(1),
  href: z.string().min(1),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
  type: z.string().optional(),
  fields: z
    .array(
      z.object({
        name: z.string().min(1),
        type: z.string().optional(),
        value: z.unknown().optional(),
      }),
    )
    .optional(),
});

const postgresEditorAssetSchema = z.object({
  id: resourceIdSchema,
  title: z.string().trim().min(1),
  fileName: z.string().trim().min(1),
  mediaType: z.enum(["image/jpeg", "image/png"]),
  byteSize: z.number().int().nonnegative().safe(),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  owner: z.object({ kind: z.literal("textResourceContent"), id: resourceIdSchema }),
  createdAt: z.iso.datetime({ offset: true }),
});

const postgresEditorAssetSirenSchema = z.object({
  class: z.tuple([z.literal("editor-asset")]),
  properties: postgresEditorAssetSchema,
  links: z.array(postgresSirenLinkSchema).min(1),
});

const presentedEditorAssetSchema = postgresEditorAssetSirenSchema.transform((representation) => ({
  data: representation.properties,
  representation,
}));

export type PostgresEditorAsset = z.infer<typeof postgresEditorAssetSchema>;

function resourceSirenEntitySchema<Resource>(resourceSchema: ZodType<Resource>) {
  return z.object({
    class: z.tuple([z.literal("resource")]),
    properties: resourceSchema,
    actions: z.array(postgresSirenActionSchema).optional(),
    links: z.array(postgresSirenLinkSchema).min(1),
  });
}

function presentedResourceSchema<Resource>(resourceSchema: ZodType<Resource>) {
  return resourceSirenEntitySchema(resourceSchema).transform((representation) => ({
    data: representation.properties,
    representation,
  }));
}

function presentedResourceCollectionSchema<Resource>(resourceSchema: ZodType<Resource>) {
  return z
    .object({
      class: z.tuple([z.literal("resource-collection")]),
      properties: z.object({}),
      entities: z.array(resourceSirenEntitySchema(resourceSchema).extend({ rel: z.tuple([z.literal("item")]) })),
      actions: z.array(postgresSirenActionSchema).optional(),
      links: z.array(postgresSirenLinkSchema).min(1),
    })
    .transform((representation) => ({
      data: representation.entities.map(({ properties }) => properties),
      representation,
    }));
}

const presentedResourceSearchSchema = z
  .object({
    class: z.tuple([z.literal("resource-search")]),
    properties: postgresResourceSearchResultSchema,
    links: z.array(postgresSirenLinkSchema).min(1),
  })
  .transform((representation) => ({ data: representation.properties, representation }));

export type PostgresPresentedResource<Resource = PostgresResourceDetail> = Readonly<{
  data: Resource;
  representation: Readonly<Record<string, unknown>>;
}>;
export type PostgresPresentedResourceCollection<Resource = PostgresResourceSummary> = Readonly<{
  data: Resource[];
  representation: Readonly<Record<string, unknown>>;
}>;
export type PostgresPresentedResourceSearch = Readonly<{
  data: PostgresResourceSearchResult;
  representation: Readonly<Record<string, unknown>>;
}>;

export class PostgresResources {
  private readonly transactions: PostgresTransactionManager;

  constructor(pool: Pool) {
    this.transactions = new PostgresTransactionManager(pool);
  }

  private runContext(request: PostgresResourceRequest, action: string): PostgresCallContext {
    return { ...request.context, action };
  }

  private async readJson<Result>(
    request: PostgresResourceRequest,
    action: string,
    call: JsonCall,
    schema: ZodType<Result>,
  ): Promise<Result> {
    return this.transactions.run({ role: request.role, context: this.runContext(request, action) }, (client) =>
      callJson(client, { ...call, schema }),
    );
  }

  private async mutateJson<Result extends PostgresResourceSummary>(
    request: PostgresResourceRequest,
    action: string,
    call: JsonCall,
    schema: ZodType<PostgresPresentedResource<Result>>,
  ): Promise<PostgresPresentedResource<Result>> {
    return this.transactions.run({ role: request.role, context: this.runContext(request, action) }, async (client) => {
      const presented = await callJson(client, { ...call, schema });
      await recordAuditEvent(client, {
        targetType: "resource",
        targetId: presented.data.id,
        outcome: "succeeded",
        details: { fullPath: presented.data.fullPath },
      });
      return presented;
    });
  }

  open(request: PostgresResourceRequest, id: string): Promise<PostgresPresentedResource<PostgresResourceDetail>> {
    return this.readJson(
      request,
      "resource.open",
      {
        text: "SELECT hall_api.present_resource(hall_api.open_resource($1::uuid)) AS payload",
        values: [resourceIdSchema.parse(id)],
      },
      presentedResourceSchema(postgresResourceDetailSchema),
    );
  }

  openBySlug(
    request: PostgresResourceRequest,
    slug: string,
  ): Promise<PostgresPresentedResource<PostgresResourceDetail>> {
    return this.readJson(
      request,
      "resource.openBySlug",
      {
        text: "SELECT hall_api.present_resource(hall_api.open_resource_by_slug($1::text)) AS payload",
        values: [resourceSlugSchema.parse(slug)],
      },
      presentedResourceSchema(postgresResourceDetailSchema),
    );
  }

  listFolder(
    request: PostgresResourceRequest,
    path: string,
  ): Promise<PostgresPresentedResourceCollection<PostgresResourceSummary>> {
    const parsedPath = resourcePathSchema.parse(path);
    const search = new URLSearchParams({ path: parsedPath }).toString();
    return this.readJson(
      request,
      "resource.listFolder",
      {
        text: `SELECT hall_api.present_resource_collection(
          hall_api.list_folder($1::text) -> 'resources', $2::text, true, true
        ) AS payload`,
        values: [parsedPath, `/api/resources?${search}`],
      },
      presentedResourceCollectionSchema(postgresResourceSummarySchema),
    );
  }

  listResources(
    request: PostgresResourceRequest,
  ): Promise<PostgresPresentedResourceCollection<z.infer<typeof resourceCatalogEntrySchema>>> {
    return this.readJson(
      request,
      "resource.listResources",
      {
        text: `SELECT hall_api.present_resource_collection(
          hall_api.list_resources(), '/api/resources/catalog', false, false
        ) AS payload`,
      },
      presentedResourceCollectionSchema(resourceCatalogEntrySchema),
    );
  }

  searchResources(
    request: PostgresResourceRequest,
    criteria: PostgresResourceSearchCriteria,
  ): Promise<PostgresPresentedResourceSearch> {
    return this.readJson(
      request,
      "resource.search",
      {
        text: `SELECT hall_api.present_resource_search(
          hall_api.search_resources(
            $1::text,
            $2::text[],
            $3::text[],
            $4::text[],
            $5::text[],
            $6::text[]
          )
        ) AS payload`,
        values: [
          criteria.query,
          [...criteria.paths],
          [...criteria.kinds],
          [...criteria.tags],
          [...criteria.readiness],
          [...criteria.media],
        ],
      },
      presentedResourceSearchSchema,
    );
  }

  createFolder(
    request: PostgresResourceRequest,
    input: CreateFolderInput,
  ): Promise<PostgresPresentedResource<PostgresFolderResource>> {
    const parsed = createFolderInputSchema.parse(input);
    return this.mutateJson(
      request,
      "resource.createFolder",
      {
        text: "SELECT hall_api.present_resource(hall_api.create_folder($1::text, $2::text)) AS payload",
        values: [parsed.path, parsed.name],
      },
      presentedResourceSchema(folderResourceSchema),
    );
  }

  createText(
    request: PostgresResourceRequest,
    input: CreateTextInput,
  ): Promise<PostgresPresentedResource<PostgresTextResource>> {
    const parsed = createTextInputSchema.parse(input);
    return this.mutateJson(
      request,
      "resource.createText",
      {
        text: "SELECT hall_api.present_resource(hall_api.create_text_resource($1::text, $2::text, $3::text)) AS payload",
        values: [parsed.path, parsed.name, parsed.content],
      },
      presentedResourceSchema(textResourceSchema),
    );
  }

  createRemote(
    request: PostgresResourceRequest,
    input: CreateRemoteInput,
  ): Promise<PostgresPresentedResource<PostgresRemoteResource>> {
    const parsed = createRemoteInputSchema.parse(input);
    return this.mutateJson(
      request,
      "resource.createRemote",
      parsed.target.kind === "unconfigured"
        ? {
            text: "SELECT hall_api.present_resource(hall_api.create_remote_resource($1::text, $2::text)) AS payload",
            values: [parsed.path, parsed.name],
          }
        : {
            text: `SELECT hall_api.present_resource(
              hall_api.create_remote_resource_with_target($1::text, $2::text, $3::text)
            ) AS payload`,
            values: [parsed.path, parsed.name, parsed.target.url],
          },
      presentedResourceSchema(remoteResourceSchema),
    );
  }

  createSpreadsheet(
    request: PostgresResourceRequest,
    input: CreateStructuredInput,
  ): Promise<PostgresPresentedResource<PostgresSpreadsheetResource>> {
    return this.createStructured(
      request,
      "resource.createSpreadsheet",
      "create_spreadsheet_resource",
      input,
      spreadsheetResourceSchema,
    );
  }

  createGeographic(
    request: PostgresResourceRequest,
    input: CreateStructuredInput,
  ): Promise<PostgresPresentedResource<PostgresGeographicResource>> {
    return this.createStructured(
      request,
      "resource.createGeographic",
      "create_geographic_resource",
      input,
      geographicResourceSchema,
    );
  }

  createLegalReference(
    request: PostgresResourceRequest,
    input: CreateStructuredInput,
  ): Promise<PostgresPresentedResource<PostgresLegalReferenceResource>> {
    return this.createStructured(
      request,
      "resource.createLegalReference",
      "create_legal_reference_resource",
      input,
      legalReferenceResourceSchema,
    );
  }

  private createStructured<Result extends PostgresResourceDetail>(
    request: PostgresResourceRequest,
    action: string,
    functionName: "create_spreadsheet_resource" | "create_geographic_resource" | "create_legal_reference_resource",
    input: CreateStructuredInput,
    schema: ZodType<Result>,
  ): Promise<PostgresPresentedResource<Result>> {
    const parsed = createStructuredInputSchema.parse(input);
    return this.mutateJson(
      request,
      action,
      {
        text: `SELECT hall_api.present_resource(
          hall_api.${functionName}($1::text, $2::text, $3::jsonb)
        ) AS payload`,
        values: [parsed.path, parsed.name, JSON.stringify(parsed.document)],
      },
      presentedResourceSchema(schema),
    );
  }

  createDocument(
    request: PostgresResourceRequest,
    input: CreateDocumentInput,
  ): Promise<PostgresPresentedResource<PostgresDocumentResource>> {
    const parsed = createDocumentInputSchema.parse(input);
    return this.mutateJson(
      request,
      "resource.createDocument",
      {
        text: `SELECT hall_api.present_resource(
          hall_api.create_document_resource($1::text, $2::text, $3::text, $4::bytea)
        ) AS payload`,
        values: [parsed.path, parsed.name, parsed.mediaType, parsed.content],
      },
      presentedResourceSchema(documentResourceSchema),
    );
  }

  rename(
    request: PostgresResourceRequest,
    id: string,
    name: string,
  ): Promise<PostgresPresentedResource<PostgresResourceDetail>> {
    return this.mutateJson(
      request,
      "resource.rename",
      {
        text: "SELECT hall_api.present_resource(hall_api.rename_resource($1::uuid, $2::text)) AS payload",
        values: [resourceIdSchema.parse(id), resourceNameSchema.parse(name)],
      },
      presentedResourceSchema(postgresResourceDetailSchema),
    );
  }

  move(
    request: PostgresResourceRequest,
    id: string,
    destinationPath: string,
  ): Promise<PostgresPresentedResource<PostgresResourceDetail>> {
    return this.mutateJson(
      request,
      "resource.move",
      {
        text: "SELECT hall_api.present_resource(hall_api.move_resource($1::uuid, $2::text)) AS payload",
        values: [resourceIdSchema.parse(id), resourcePathSchema.parse(destinationPath)],
      },
      presentedResourceSchema(postgresResourceDetailSchema),
    );
  }

  relocate(
    request: PostgresResourceRequest,
    id: string,
    destinationPath: string,
    destinationName: string,
  ): Promise<PostgresPresentedResource<PostgresResourceDetail>> {
    return this.mutateJson(
      request,
      "resource.relocate",
      {
        text: `SELECT hall_api.present_resource(
          hall_api.relocate_resource($1::uuid, $2::text, $3::text)
        ) AS payload`,
        values: [
          resourceIdSchema.parse(id),
          resourcePathSchema.parse(destinationPath),
          resourceNameSchema.parse(destinationName),
        ],
      },
      presentedResourceSchema(postgresResourceDetailSchema),
    );
  }

  updateMetadata(
    request: PostgresResourceRequest,
    input: UpdateMetadataInput,
  ): Promise<PostgresPresentedResource<PostgresResourceDetail>> {
    const parsed = updateMetadataInputSchema.parse(input);
    return this.mutateJson(
      request,
      "resource.updateMetadata",
      parsed.editing.kind === "fixed"
        ? {
            text: `SELECT hall_api.present_resource(
              hall_api.update_resource_metadata($1::uuid, $2::text, $3::text, $4::text[])
            ) AS payload`,
            values: [parsed.id, parsed.path, parsed.name, parsed.tags],
          }
        : {
            text: `SELECT hall_api.present_resource(
              hall_api.update_editable_resource_metadata(
                $1::uuid, $2::text, $3::text, $4::text[], $5::boolean
              )
            ) AS payload`,
            values: [parsed.id, parsed.path, parsed.name, parsed.tags, parsed.editing.enabled],
          },
      presentedResourceSchema(postgresResourceDetailSchema),
    );
  }

  updateText(
    request: PostgresResourceRequest,
    input: UpdateTextWithAssetsInput,
  ): Promise<PostgresPresentedResource<PostgresTextResource>> {
    const parsed = updateTextWithAssetsInputSchema.parse(input);
    return this.mutateJson(
      request,
      "resource.updateText",
      {
        text: `SELECT hall_api.present_resource(
          hall_api.update_text_resource($1::uuid, $2::integer, $3::text, $4::uuid[])
        ) AS payload`,
        values: [parsed.id, parsed.expectedVersion, parsed.content, parsed.referencedEditorAssetIds],
      },
      presentedResourceSchema(textResourceSchema),
    );
  }

  updateRemote(
    request: PostgresResourceRequest,
    input: UpdateRemoteInput,
  ): Promise<PostgresPresentedResource<PostgresRemoteResource>> {
    const parsed = updateRemoteInputSchema.parse(input);
    return this.mutateJson(
      request,
      "resource.updateRemote",
      parsed.target.kind === "unconfigured"
        ? {
            text: `SELECT hall_api.present_resource(
              hall_api.clear_remote_resource_target($1::uuid, $2::integer)
            ) AS payload`,
            values: [parsed.id, parsed.expectedVersion],
          }
        : {
            text: `SELECT hall_api.present_resource(
              hall_api.update_remote_resource_target($1::uuid, $2::integer, $3::text)
            ) AS payload`,
            values: [parsed.id, parsed.expectedVersion, parsed.target.url],
          },
      presentedResourceSchema(remoteResourceSchema),
    );
  }

  updateSpreadsheet(
    request: PostgresResourceRequest,
    input: UpdateStructuredInput,
  ): Promise<PostgresPresentedResource<PostgresSpreadsheetResource>> {
    return this.updateStructured(
      request,
      "resource.updateSpreadsheet",
      "update_spreadsheet_resource",
      input,
      spreadsheetResourceSchema,
    );
  }

  updateGeographic(
    request: PostgresResourceRequest,
    input: UpdateStructuredInput,
  ): Promise<PostgresPresentedResource<PostgresGeographicResource>> {
    return this.updateStructured(
      request,
      "resource.updateGeographic",
      "update_geographic_resource",
      input,
      geographicResourceSchema,
    );
  }

  updateLegalReference(
    request: PostgresResourceRequest,
    input: UpdateStructuredInput,
  ): Promise<PostgresPresentedResource<PostgresLegalReferenceResource>> {
    return this.updateStructured(
      request,
      "resource.updateLegalReference",
      "update_legal_reference_resource",
      input,
      legalReferenceResourceSchema,
    );
  }

  resolveLegalReference(
    request: PostgresResourceRequest,
    input: UpdateStructuredInput & Readonly<{ name: string }>,
  ): Promise<PostgresPresentedResource<PostgresLegalReferenceResource>> {
    const parsed = updateStructuredInputSchema.extend({ name: resourceNameSchema }).parse(input);
    return this.mutateJson(
      request,
      "resource.resolveLegalReference",
      {
        text: `SELECT hall_api.present_resource(
          hall_api.resolve_legal_reference_resource($1::uuid, $2::integer, $3::text, $4::jsonb)
        ) AS payload`,
        values: [parsed.id, parsed.expectedVersion, parsed.name, JSON.stringify(parsed.document)],
      },
      presentedResourceSchema(legalReferenceResourceSchema),
    );
  }

  private updateStructured<Result extends PostgresResourceDetail>(
    request: PostgresResourceRequest,
    action: string,
    functionName: "update_spreadsheet_resource" | "update_geographic_resource" | "update_legal_reference_resource",
    input: UpdateStructuredInput,
    schema: ZodType<Result>,
  ): Promise<PostgresPresentedResource<Result>> {
    const parsed = updateStructuredInputSchema.parse(input);
    return this.mutateJson(
      request,
      action,
      {
        text: `SELECT hall_api.present_resource(
          hall_api.${functionName}($1::uuid, $2::integer, $3::jsonb)
        ) AS payload`,
        values: [parsed.id, parsed.expectedVersion, JSON.stringify(parsed.document)],
      },
      presentedResourceSchema(schema),
    );
  }

  replaceDocumentContent(
    request: PostgresResourceRequest,
    input: ReplaceDocumentInput,
  ): Promise<PostgresPresentedResource<PostgresDocumentResource>> {
    const parsed = replaceDocumentInputSchema.parse(input);
    return this.mutateJson(
      request,
      "resource.replaceDocumentContent",
      {
        text: `SELECT hall_api.present_resource(
          hall_api.replace_document_content($1::uuid, $2::text, $3::bytea)
        ) AS payload`,
        values: [parsed.id, parsed.mediaType, parsed.content],
      },
      presentedResourceSchema(documentResourceSchema),
    );
  }

  readDocumentContent(request: PostgresResourceRequest, id: string): Promise<PostgresDocumentContent> {
    const resourceId = resourceIdSchema.parse(id);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "resource.readDocumentContent") },
      async (client) => this.readDocumentContentRow(client, resourceId),
    );
  }

  createEditorAsset(
    request: PostgresResourceRequest,
    input: Readonly<{
      ownerId: string;
      title: string;
      fileName: string;
      mediaType: "image/jpeg" | "image/png";
      content: Buffer;
    }>,
  ): Promise<PostgresPresentedResource<PostgresEditorAsset>> {
    const parsed = z
      .object({
        ownerId: resourceIdSchema,
        title: z.string().trim().min(1).max(200),
        fileName: z.string().trim().min(1),
        mediaType: z.enum(["image/jpeg", "image/png"]),
        content: z.instanceof(Buffer),
      })
      .parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "editorAsset.create") },
      async (client) => {
        const presented = await callJson(client, {
          text: `SELECT hall_api.present_editor_asset(
            hall_api.create_editor_asset($1::uuid, $2::text, $3::text, $4::text, $5::bytea)
          ) AS payload`,
          values: [parsed.ownerId, parsed.title, parsed.fileName, parsed.mediaType, parsed.content],
          schema: presentedEditorAssetSchema,
        });
        await recordAuditEvent(client, {
          targetType: "editorAsset",
          targetId: presented.data.id,
          outcome: "succeeded",
          details: { ownerId: presented.data.owner.id },
        });
        return presented;
      },
    );
  }

  openEditorAsset(
    request: PostgresResourceRequest,
    id: string,
  ): Promise<PostgresPresentedResource<PostgresEditorAsset> | null> {
    return this.readJson(
      request,
      "editorAsset.open",
      {
        text: `SELECT CASE
          WHEN asset IS NULL THEN NULL
          ELSE hall_api.present_editor_asset(asset)
        END AS payload
        FROM (SELECT hall_api.open_editor_asset($1::uuid) AS asset) AS opened`,
        values: [resourceIdSchema.parse(id)],
      },
      z.union([presentedEditorAssetSchema, z.null()]),
    );
  }

  readEditorAssetContent(request: PostgresResourceRequest, id: string): Promise<PostgresDocumentContent | null> {
    const assetId = resourceIdSchema.parse(id);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "editorAsset.readContent") },
      async (client) => this.readBinaryContentRow(client, "read_editor_asset_content", assetId, false),
    );
  }

  readBinaryReferenceContent(request: PostgresResourceRequest, id: string): Promise<PostgresDocumentContent | null> {
    const referenceId = resourceIdSchema.parse(id);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "binaryReference.readContent") },
      async (client) => this.readBinaryContentRow(client, "read_binary_reference_content", referenceId, false),
    );
  }

  private async readDocumentContentRow(client: PoolClient, id: string): Promise<PostgresDocumentContent> {
    const content = await this.readBinaryContentRow(client, "read_document_content", id, true);
    if (!content) throw new ProjectionValidationError("PostgreSQL document content call returned no row");
    return content;
  }

  private async readBinaryContentRow(
    client: PoolClient,
    functionName: "read_document_content" | "read_editor_asset_content" | "read_binary_reference_content",
    id: string,
    required: boolean,
  ): Promise<PostgresDocumentContent | null> {
    const result = await client.query<DocumentContentRow>(
      `SELECT content,
              media_type AS "mediaType",
              byte_size::text AS "byteSize",
              content_sha256 AS "contentSha256"
       FROM hall_api.${functionName}($1::uuid)`,
      [id],
    );
    if (result.rowCount === 0 && !required) return null;
    if (result.rowCount !== 1) {
      throw new ProjectionValidationError(
        `PostgreSQL document content call returned ${result.rowCount ?? 0} rows instead of one`,
      );
    }
    const parsed = documentContentRowSchema.safeParse(result.rows[0]);
    if (!parsed.success) {
      throw new ProjectionValidationError(
        "PostgreSQL document content does not satisfy its boundary schema",
        parsed.error,
      );
    }
    const byteSize = Number(parsed.data.byteSize);
    if (!Number.isSafeInteger(byteSize)) {
      throw new ProjectionValidationError("PostgreSQL document byte size exceeds the JavaScript safe integer range");
    }
    return { ...parsed.data, byteSize };
  }

  delete(request: PostgresResourceRequest, id: string): Promise<PostgresPresentedResource<PostgresResourceSummary>> {
    return this.mutateJson(
      request,
      "resource.delete",
      {
        text: "SELECT hall_api.present_resource(hall_api.delete_resource($1::uuid)) AS payload",
        values: [resourceIdSchema.parse(id)],
      },
      presentedResourceSchema(postgresResourceSummarySchema),
    );
  }
}
