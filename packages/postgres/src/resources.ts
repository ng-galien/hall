import { eventDocumentSchema } from "@hall/contracts";
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
  "event",
  "document",
  "legalReference",
  "geographicLayer",
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
const textResourceAuditChangeSchema = z.object({
  actorId: z.string().min(1),
  action: z.enum(["resource.updateMetadata", "resource.updateText", "resource.relocate"]),
  changedFields: z.array(z.enum(["content", "name", "path", "tags", "autosave"])),
  occurredAt: z.iso.datetime({ offset: true }),
});
export type PostgresTextResourceAuditChange = z.infer<typeof textResourceAuditChangeSchema>;
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
const eventResourceSummarySchema = resourcePresentationSchema.extend({
  kind: z.literal("event"),
  autosaveEnabled: z.boolean(),
});
const legalReferenceResourceSummarySchema = resourcePresentationSchema.extend({ kind: z.literal("legalReference") });
const geographicLayerResourceSummarySchema = resourcePresentationSchema.extend({ kind: z.literal("geographicLayer") });
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
  eventResourceSummarySchema,
  legalReferenceResourceSummarySchema,
  documentResourceSummarySchema,
  geographicLayerResourceSummarySchema,
]);
export const postgresResourceSearchResultSchema = z.object({
  total: z.number().int().nonnegative(),
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
// @implements-requirement HALL-FR-DOC-330
const geographicMapOverlaySchema = z.object({
  layerId: resourceIdSchema,
  slug: resourceSlugSchema,
  name: resourceNameSchema,
  featureCount: z.number().int().positive(),
  version: versionSchema,
  position: z.number().int().nonnegative(),
  visible: z.boolean(),
  opacity: z.number().gt(0).max(1),
});
const geographicResourceSchema = geographicResourceSummarySchema.extend({
  document: jsonDocumentSchema,
  version: versionSchema,
  overlays: z.array(geographicMapOverlaySchema),
});
// @implements-requirement HALL-FR-DOC-310
const geographicLayerResourceSchema = geographicLayerResourceSummarySchema.extend({
  featureCount: z.number().int().positive(),
  extent: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  source: z.object({
    format: z.literal("geojson"),
    fileName: z.string().trim().min(1),
    byteSize: z.number().int().nonnegative(),
    contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
    importedAt: z.iso.datetime({ offset: true }),
  }),
  version: versionSchema,
  featureKey: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("cadastreParcel"), property: z.enum(["idu", "id"]) }),
    z.object({ kind: z.literal("sourceId") }),
    z.object({ kind: z.literal("none") }),
  ]),
  propertyKeys: z.array(z.string()),
});
// @implements-requirement HALL-FR-DOC-390
const geographicFeatureNoteSchema = z.object({
  key: z.string().min(1),
  subjectKind: z.enum(["cadastreParcel", "layerFeature", "drawnElement"]),
  noteId: resourceIdSchema,
  slug: resourceSlugSchema,
  name: resourceNameSchema,
  fullPath: z.string().min(1),
});
// @implements-requirement HALL-FR-DOC-400
const municipalPropertySchema = z.object({
  source: z
    .object({
      id: resourceIdSchema,
      label: z.string().min(1),
      fileName: z.string().min(1).nullable(),
      parcelCount: z.number().int().nonnegative(),
      importedAt: z.iso.datetime({ offset: true }),
      importedBy: z.string().min(1),
    })
    .nullable(),
  sources: z.array(
    z.object({
      id: resourceIdSchema,
      label: z.string().min(1),
      fileName: z.string().min(1).nullable(),
      parcelCount: z.number().int().nonnegative(),
      importedAt: z.iso.datetime({ offset: true }),
      importedBy: z.string().min(1),
    }),
  ),
  parcelIds: z.array(z.string().min(1)),
  parcelSourceIds: z.record(z.string(), resourceIdSchema),
  matchedParcelCount: z.number().int().nonnegative(),
});
const geographicLayerFeatureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      id: z.number().int().nonnegative(),
      sourceId: z.string().nullable(),
      key: z.string().min(1).nullable(),
      label: z.string().min(1).nullable(),
      geometry: z.object({
        type: z.enum(["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"]),
        coordinates: z.array(z.unknown()),
      }),
      properties: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
});
const eventResourceSchema = eventResourceSummarySchema.extend({
  document: eventDocumentSchema,
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
  eventResourceSchema,
  documentResourceSchema,
  legalReferenceResourceSchema,
  geographicLayerResourceSchema,
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
export type PostgresGeographicLayerResource = z.infer<typeof geographicLayerResourceSchema>;
export type PostgresGeographicLayerFeatureCollection = z.infer<typeof geographicLayerFeatureCollectionSchema>;
export type PostgresGeographicFeatureNote = z.infer<typeof geographicFeatureNoteSchema>;
export type PostgresMunicipalProperty = z.infer<typeof municipalPropertySchema>;

export type PostgresResourceRequest = PostgresRequest;
export type PostgresResourceSearchCriteria = Readonly<{
  offset?: number;
  limit?: number;
  context?: string;
  preferredIds?: readonly string[];
  excludedIds?: readonly string[];
  includedIds?: readonly string[];
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
const createWorkingResourceInputSchema = createFolderInputSchema.extend({
  councilBusinessId: resourceIdSchema.optional(),
});
const createTextInputSchema = createWorkingResourceInputSchema.extend({ content: z.string() });
const createRemoteInputSchema = createWorkingResourceInputSchema.extend({ target: remoteResourceTargetSchema });
const createStructuredInputSchema = createWorkingResourceInputSchema.extend({ document: jsonDocumentSchema });
// @implements-requirement HALL-FR-DOC-320
const createGeographicLayerInputSchema = createWorkingResourceInputSchema.extend({
  source: z.object({
    format: z.literal("geojson"),
    fileName: z.string().trim().min(1),
    byteSize: z.number().int().nonnegative(),
    contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
    importedAt: z.iso.datetime({ offset: true }),
  }),
  featureKeyRule: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("cadastreParcel"), property: z.enum(["idu", "id"]) }),
    z.object({ kind: z.literal("sourceId") }),
    z.object({ kind: z.literal("none") }),
  ]),
  propertyKeys: z.array(z.string()).max(10_000),
  features: z
    .array(
      z.object({
        sourceId: z.string().nullable(),
        key: z.string().min(1).nullable(),
        label: z.string().min(1).nullable(),
        geometry: z.object({ type: z.string(), coordinates: z.array(z.unknown()) }),
        properties: z.unknown(),
        bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      }),
    )
    .min(1)
    .max(20_000),
  geographicResourceId: resourceIdSchema.optional(),
});
const geographicMapOverlayInputSchema = z.object({
  mapId: resourceIdSchema,
  layerId: resourceIdSchema,
  visible: z.boolean(),
  opacity: z.number().gt(0).max(1).optional(),
});
const createDocumentInputSchema = createWorkingResourceInputSchema.extend({
  mediaType: z.string().trim().min(1),
  content: z.instanceof(Buffer),
});
const updateTextInputSchema = z.object({
  id: resourceIdSchema,
  expectedVersion: versionSchema,
  content: z.string(),
  name: resourceNameSchema.optional(),
});
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
type CreateGeographicLayerInput = z.input<typeof createGeographicLayerInputSchema>;
type GeographicMapOverlayInput = z.input<typeof geographicMapOverlayInputSchema>;
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
        accept: z.string().min(1).optional(),
      }),
    )
    .optional(),
});

// @implements-requirement HALL-FR-DOC-400
const presentedMunicipalPropertySchema = z
  .object({
    class: z.tuple([z.literal("municipal-property")]),
    properties: municipalPropertySchema,
    actions: z.array(postgresSirenActionSchema).optional(),
    links: z.array(postgresSirenLinkSchema).min(1),
  })
  .transform((representation) => ({ data: representation.properties, representation }));

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

// @implements-requirement HALL-FR-DOC-280
function changedTextFields(before: PostgresResourceDetail, after: PostgresResourceDetail): string[] {
  if (before.kind !== "text" || after.kind !== "text") return [];
  const fields: string[] = [];
  if (before.content !== after.content) fields.push("content");
  if (before.name !== after.name) fields.push("name");
  if (before.path !== after.path) fields.push("path");
  if (before.tags.slice().sort().join("\u0000") !== after.tags.slice().sort().join("\u0000")) fields.push("tags");
  if (before.autosaveEnabled !== after.autosaveEnabled) fields.push("autosave");
  return fields;
}

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
    councilBusinessId?: string,
    auditBeforeResourceId?: string,
  ): Promise<PostgresPresentedResource<Result>> {
    return this.transactions.run({ role: request.role, context: this.runContext(request, action) }, async (client) => {
      const before = auditBeforeResourceId
        ? await callJson(client, {
            text: "SELECT hall_api.open_resource($1::uuid) AS payload",
            values: [resourceIdSchema.parse(auditBeforeResourceId)],
            schema: postgresResourceDetailSchema,
          })
        : null;
      const presented = await callJson(client, { ...call, schema });
      if (councilBusinessId)
        await client.query("SELECT hall_api.associate_council_business_resource($1::uuid, $2::uuid)", [
          councilBusinessId,
          presented.data.id,
        ]);
      const changedFields = before
        ? changedTextFields(before, postgresResourceDetailSchema.parse(presented.data))
        : null;
      await recordAuditEvent(client, {
        targetType: "resource",
        targetId: presented.data.id,
        outcome: "succeeded",
        details: {
          fullPath: presented.data.fullPath,
          ...(councilBusinessId ? { councilBusinessId } : {}),
          ...(changedFields ? { changedFields } : {}),
        },
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

  // @implements-requirement HALL-FR-DOC-280
  listTextResourceChanges(request: PostgresResourceRequest, id: string): Promise<PostgresTextResourceAuditChange[]> {
    return this.readJson(
      request,
      "resource.listTextResourceChanges",
      {
        text: "SELECT hall_api.list_text_resource_changes($1::uuid) AS payload",
        values: [resourceIdSchema.parse(id)],
      },
      z.array(textResourceAuditChangeSchema),
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

  findDocumentsByHashes(request: PostgresResourceRequest, hashes: readonly string[]) {
    const parsed = z
      .array(z.string().regex(/^[0-9a-f]{64}$/))
      .min(1)
      .max(100)
      .parse(hashes);
    const search = new URLSearchParams({ sha256: parsed.join(",") }).toString();
    return this.readJson(
      request,
      "resource.findDocumentsByHashes",
      {
        text: `SELECT hall_api.present_resource_collection(hall_api.find_documents_by_hashes($1::text[]), $2::text, false, false) AS payload`,
        values: [parsed, `/api/resources/documents/by-hashes?${search}`],
      },
      presentedResourceCollectionSchema(postgresResourceSummarySchema),
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
            $6::text[], $7::integer, $8::integer, $9::text, $10::uuid[], $11::uuid[], $12::uuid[]
          )
        ) AS payload`,
        values: [
          criteria.query,
          [...criteria.paths],
          [...criteria.kinds],
          [...criteria.tags],
          [...criteria.readiness],
          [...criteria.media],
          criteria.offset ?? 0,
          criteria.limit ?? 100,
          criteria.context ?? "",
          [...(criteria.preferredIds ?? [])],
          [...(criteria.excludedIds ?? [])],
          criteria.includedIds === undefined ? null : [...criteria.includedIds],
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
      parsed.councilBusinessId,
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
      parsed.councilBusinessId,
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

  createEvent(
    request: PostgresResourceRequest,
    input: CreateStructuredInput,
  ): Promise<PostgresPresentedResource<PostgresEventResource>> {
    return this.createStructured(request, "resource.createEvent", "create_event_resource", input, eventResourceSchema);
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
    functionName:
      | "create_spreadsheet_resource"
      | "create_geographic_resource"
      | "create_event_resource"
      | "create_legal_reference_resource",
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
      parsed.councilBusinessId,
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
      parsed.councilBusinessId,
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
      undefined,
      resourceIdSchema.parse(id),
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
      undefined,
      parsed.id,
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
          hall_api.update_text_resource($1::uuid, $2::integer, $3::text, $4::uuid[], $5::text)
        ) AS payload`,
        values: [
          parsed.id,
          parsed.expectedVersion,
          parsed.content,
          parsed.referencedEditorAssetIds,
          parsed.name ?? null,
        ],
      },
      presentedResourceSchema(textResourceSchema),
      undefined,
      parsed.id,
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

  updateEvent(
    request: PostgresResourceRequest,
    input: UpdateStructuredInput,
  ): Promise<PostgresPresentedResource<PostgresEventResource>> {
    return this.updateStructured(request, "resource.updateEvent", "update_event_resource", input, eventResourceSchema);
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
    functionName:
      | "update_spreadsheet_resource"
      | "update_geographic_resource"
      | "update_event_resource"
      | "update_legal_reference_resource",
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

  // @implements-requirement HALL-FR-DOC-320
  // @implements-requirement HALL-FR-DOC-330
  createGeographicLayer(
    request: PostgresResourceRequest,
    input: CreateGeographicLayerInput,
  ): Promise<PostgresPresentedResource<PostgresGeographicLayerResource>> {
    const parsed = createGeographicLayerInputSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "resource.createGeographicLayer") },
      async (client) => {
        const presented = await callJson(client, {
          text: `SELECT hall_api.present_resource(
            hall_api.create_geographic_layer_resource($1::text, $2::text, $3::jsonb, $4::jsonb, $5::text[], $6::jsonb)
          ) AS payload`,
          values: [
            parsed.path,
            parsed.name,
            JSON.stringify(parsed.source),
            JSON.stringify(parsed.featureKeyRule),
            parsed.propertyKeys,
            JSON.stringify(parsed.features),
          ],
          schema: presentedResourceSchema(geographicLayerResourceSchema),
        });
        if (parsed.councilBusinessId)
          await client.query("SELECT hall_api.associate_council_business_resource($1::uuid, $2::uuid)", [
            parsed.councilBusinessId,
            presented.data.id,
          ]);
        await recordAuditEvent(client, {
          targetType: "resource",
          targetId: presented.data.id,
          outcome: "succeeded",
          details: {
            fullPath: presented.data.fullPath,
            featureCount: presented.data.featureCount,
            ...(parsed.councilBusinessId ? { councilBusinessId: parsed.councilBusinessId } : {}),
          },
        });
        if (parsed.geographicResourceId) {
          const map = await callJson(client, {
            text: "SELECT hall_api.set_geographic_map_overlay($1::uuid, $2::uuid, true, NULL) AS payload",
            values: [parsed.geographicResourceId, presented.data.id],
            schema: geographicResourceSchema,
          });
          await recordAuditEvent(client, {
            targetType: "resource",
            targetId: map.id,
            outcome: "succeeded",
            details: { fullPath: map.fullPath, linkedGeographicLayerId: presented.data.id, visible: true },
          });
        }
        return presented;
      },
    );
  }

  // @implements-requirement HALL-FR-DOC-310
  listGeographicLayers(
    request: PostgresResourceRequest,
  ): Promise<PostgresPresentedResourceCollection<PostgresGeographicLayerResource>> {
    return this.readJson(
      request,
      "resource.listGeographicLayers",
      {
        text: `SELECT hall_api.present_geographic_layer_collection(
          hall_api.list_geographic_layer_resources()
        ) AS payload`,
      },
      presentedResourceCollectionSchema(geographicLayerResourceSchema),
    );
  }

  // @implements-requirement HALL-FR-DOC-310
  readGeographicLayerFeatures(
    request: PostgresResourceRequest,
    id: string,
  ): Promise<PostgresGeographicLayerFeatureCollection> {
    return this.readJson(
      request,
      "resource.readGeographicLayerFeatures",
      {
        text: "SELECT hall_api.geographic_layer_features($1::uuid) AS payload",
        values: [resourceIdSchema.parse(id)],
      },
      geographicLayerFeatureCollectionSchema,
    );
  }

  /**
   * Serves the same FeatureCollection as text produced by PostgreSQL, so the HTTP edge neither parses nor
   * serializes large layers; every feature row was validated at import and is constrained by CHECKs.
   */
  // @implements-requirement HALL-FR-DOC-310
  readGeographicLayerFeaturesText(request: PostgresResourceRequest, id: string): Promise<string> {
    return this.readJson(
      request,
      "resource.readGeographicLayerFeatures",
      {
        text: "SELECT hall_api.geographic_layer_features_text($1::uuid) AS payload",
        values: [resourceIdSchema.parse(id)],
      },
      z.string().startsWith('{"type": "FeatureCollection"'),
    );
  }

  // @implements-requirement HALL-FR-DOC-390
  listGeographicFeatureNotes(
    request: PostgresResourceRequest,
    layerId: string,
  ): Promise<PostgresGeographicFeatureNote[]> {
    return this.readJson(
      request,
      "resource.listGeographicFeatureNotes",
      {
        text: "SELECT hall_api.geographic_feature_notes($1::uuid) AS payload",
        values: [resourceIdSchema.parse(layerId)],
      },
      z.array(geographicFeatureNoteSchema),
    );
  }

  // @implements-requirement HALL-FR-DOC-390
  createGeographicFeatureNote(
    request: PostgresResourceRequest,
    layerId: string,
    position: number,
  ): Promise<PostgresGeographicFeatureNote> {
    const parsedLayerId = resourceIdSchema.parse(layerId);
    const parsedPosition = z.number().int().nonnegative().parse(position);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "resource.createGeographicFeatureNote") },
      async (client) => {
        const note = await callJson(client, {
          text: "SELECT hall_api.create_geographic_feature_note($1::uuid, $2::integer) AS payload",
          values: [parsedLayerId, parsedPosition],
          schema: geographicFeatureNoteSchema,
        });
        await recordAuditEvent(client, {
          targetType: "resource",
          targetId: note.noteId,
          outcome: "succeeded",
          details: { fullPath: note.fullPath, geographicLayerId: parsedLayerId, subjectKey: note.key },
        });
        return note;
      },
    );
  }

  // @implements-requirement HALL-FR-DOC-430
  listGeographicDrawnElementNotes(
    request: PostgresResourceRequest,
    mapId: string,
  ): Promise<PostgresGeographicFeatureNote[]> {
    return this.readJson(
      request,
      "resource.listGeographicDrawnElementNotes",
      {
        text: "SELECT hall_api.geographic_drawn_element_notes($1::uuid) AS payload",
        values: [resourceIdSchema.parse(mapId)],
      },
      z.array(geographicFeatureNoteSchema),
    );
  }

  // @implements-requirement HALL-FR-DOC-430
  createGeographicDrawnElementNote(
    request: PostgresResourceRequest,
    mapId: string,
    elementId: string,
  ): Promise<PostgresGeographicFeatureNote> {
    const parsedMapId = resourceIdSchema.parse(mapId);
    const parsedElementId = z.string().min(1).max(200).parse(elementId);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "resource.createGeographicDrawnElementNote") },
      async (client) => {
        const note = await callJson(client, {
          text: "SELECT hall_api.create_geographic_drawn_element_note($1::uuid, $2::text) AS payload",
          values: [parsedMapId, parsedElementId],
          schema: geographicFeatureNoteSchema,
        });
        await recordAuditEvent(client, {
          targetType: "resource",
          targetId: note.noteId,
          outcome: "succeeded",
          details: { fullPath: note.fullPath, geographicResourceId: parsedMapId, subjectKey: note.key },
        });
        return note;
      },
    );
  }

  // @implements-requirement HALL-FR-DOC-400
  readMunicipalProperty(request: PostgresResourceRequest) {
    return this.readJson(
      request,
      "resource.readMunicipalProperty",
      { text: "SELECT hall_api.present_municipal_property(hall_api.municipal_property()) AS payload" },
      presentedMunicipalPropertySchema,
    );
  }

  // @implements-requirement HALL-FR-DOC-400
  replaceMunicipalProperty(
    request: PostgresResourceRequest,
    input: Readonly<{ label: string; fileName: string | null; importerName: string; parcelIds: readonly string[] }>,
  ) {
    const parsed = z
      .object({
        label: z.string().trim().min(1).max(200),
        fileName: z.string().trim().min(1).nullable(),
        importerName: z.string().trim().min(1),
        parcelIds: z.array(z.string().min(1)).max(50_000),
      })
      .parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "resource.replaceMunicipalProperty") },
      async (client) => {
        const presented = await callJson(client, {
          text: `SELECT hall_api.present_municipal_property(
            hall_api.replace_municipal_property($1::text, $2::text, $3::text, $4::text[])
          ) AS payload`,
          values: [parsed.label, parsed.fileName, parsed.importerName, parsed.parcelIds],
          schema: presentedMunicipalPropertySchema,
        });
        await recordAuditEvent(client, {
          targetType: "municipal-property",
          targetId: presented.data.source?.id ?? null,
          outcome: "succeeded",
          details: { label: parsed.label, fileName: parsed.fileName, parcelCount: presented.data.parcelIds.length },
        });
        return presented;
      },
    );
  }

  // @implements-requirement HALL-FR-DOC-330
  setGeographicMapOverlay(
    request: PostgresResourceRequest,
    input: GeographicMapOverlayInput,
  ): Promise<PostgresPresentedResource<PostgresGeographicResource>> {
    const parsed = geographicMapOverlayInputSchema.parse(input);
    return this.mutateJson(
      request,
      "resource.setGeographicMapOverlay",
      {
        text: `SELECT hall_api.present_resource(
          hall_api.set_geographic_map_overlay($1::uuid, $2::uuid, $3::boolean, $4::numeric)
        ) AS payload`,
        values: [parsed.mapId, parsed.layerId, parsed.visible, parsed.opacity ?? null],
      },
      presentedResourceSchema(geographicResourceSchema),
    );
  }

  // @implements-requirement HALL-FR-DOC-330
  removeGeographicMapOverlay(
    request: PostgresResourceRequest,
    mapId: string,
    layerId: string,
  ): Promise<PostgresPresentedResource<PostgresGeographicResource>> {
    return this.mutateJson(
      request,
      "resource.removeGeographicMapOverlay",
      {
        text: `SELECT hall_api.present_resource(
          hall_api.remove_geographic_map_overlay($1::uuid, $2::uuid)
        ) AS payload`,
        values: [resourceIdSchema.parse(mapId), resourceIdSchema.parse(layerId)],
      },
      presentedResourceSchema(geographicResourceSchema),
    );
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

export type PostgresEventResource = z.infer<typeof eventResourceSchema>;
