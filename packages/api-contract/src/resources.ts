import { eventDocumentSchema } from "@hall/contracts";
import { z } from "zod";

export const resourceKinds = [
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

export const resourceKindSchema = z.enum(resourceKinds);
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
export const resourceSlugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine((slug) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(slug));
export const resourceIdSchema = z.string().uuid();
export const resourceReferenceSchema = z.union([resourceIdSchema, resourceSlugSchema]);

// @implements-requirement HALL-FR-DOC-280
export const resourceChangeKindSchema = z.enum(["content", "metadata", "location"]);
export const resourceChangeFieldSchema = z.enum(["content", "name", "path", "tags", "autosave"]);
export const resourceChangeSchema = z
  .object({
    actor: z.object({ id: z.string().min(1), displayName: z.string().min(1) }).strict(),
    kind: resourceChangeKindSchema,
    fields: z.array(resourceChangeFieldSchema),
    occurredAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const resourceChangesSchema = z
  .object({ resourceId: resourceIdSchema, changes: z.array(resourceChangeSchema) })
  .strict();
export type ResourceChange = z.infer<typeof resourceChangeSchema>;
export type ResourceChanges = z.infer<typeof resourceChangesSchema>;

export const editorAssetTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((title) => !resourceIdSchema.safeParse(title).success, "Editor asset title must be human-readable")
  .refine(
    (title) => !/^(?:codex-clipboard|clipboard|image|img)[-_]?[0-9a-f-]{8,}/i.test(title),
    "Editor asset title must be human-readable",
  );

export const editorAssetSchema = z.object({
  id: resourceIdSchema,
  title: editorAssetTitleSchema,
  fileName: z.string().trim().min(1),
  mediaType: z.enum(["image/jpeg", "image/png"]),
  byteSize: z.number().int().nonnegative().safe(),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  owner: z.object({ kind: z.literal("textResourceContent"), id: resourceIdSchema }),
  createdAt: z.iso.datetime({ offset: true }),
});

const resourceIdentitySchema = z.object({
  id: resourceIdSchema,
  slug: resourceSlugSchema,
  path: resourcePathSchema,
  name: resourceNameSchema,
  fullPath: z.string().min(1),
  kind: resourceKindSchema,
});
export const resourceCatalogEntrySchema = resourceIdentitySchema;

const versionSchema = z.number().int().positive();
const resourceTagsSchema = z.array(z.string().trim().min(1));

export type ResourceJsonValue =
  | string
  | number
  | boolean
  | null
  | ResourceJsonValue[]
  | { [key: string]: ResourceJsonValue };
export type ResourceJsonObject = { [key: string]: ResourceJsonValue };
export const resourceJsonValueSchema: z.ZodType<ResourceJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(resourceJsonValueSchema),
    z.record(z.string(), resourceJsonValueSchema),
  ]),
);
export const resourceJsonObjectSchema: z.ZodType<ResourceJsonObject> = z.record(z.string(), resourceJsonValueSchema);

export const spreadsheetDocumentSchema = z
  .object({
    schemaVersion: z.literal(2),
    workbook: resourceJsonObjectSchema,
  })
  .strict();

const longitudeSchema = z.number().finite().min(-180).max(180);
const latitudeSchema = z.number().finite().min(-90).max(90);
const geographicPositionSchema = z.tuple([longitudeSchema, latitudeSchema]);
const geographicColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const geographicLabelSchema = z.string().trim().min(1).max(160).nullable();
export const geographicLayerIds = [
  "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2",
  "ORTHOIMAGERY.ORTHOPHOTOS",
  "CADASTRALPARCELS.PARCELLAIRE_EXPRESS",
] as const;
export const geographicLayerIdSchema = z.enum(geographicLayerIds);
export const geographicViewSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("center"), center: geographicPositionSchema, zoom: z.number().min(0).max(22) }).strict(),
  z
    .object({
      kind: z.literal("extent"),
      extent: z.tuple([longitudeSchema, latitudeSchema, longitudeSchema, latitudeSchema]),
      zoom: z.number().min(0).max(22),
    })
    .strict()
    .refine(({ extent }) => extent[0] < extent[2] && extent[1] < extent[3], "Invalid geographic extent"),
]);
export const geographicLayersSchema = z
  .array(
    z
      .object({
        id: geographicLayerIdSchema,
        visible: z.boolean(),
        opacity: z.number().finite().min(0).max(1),
      })
      .strict(),
  )
  .min(1)
  .max(geographicLayerIds.length)
  .refine((layers) => new Set(layers.map(({ id }) => id)).size === layers.length)
  .refine((layers) => layers.some(({ visible, opacity }) => visible && opacity > 0));
const geographicPointSchema = z.object({ type: z.literal("Point"), coordinates: geographicPositionSchema }).strict();
const geographicLineSchema = z
  .object({ type: z.literal("LineString"), coordinates: z.array(geographicPositionSchema).min(2).max(500) })
  .strict();
const geographicPolygonSchema = z
  .object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(geographicPositionSchema).min(4).max(500)).min(1).max(10),
  })
  .strict();
const hallGeographicFeatureSchema = z.union([
  z
    .object({
      type: z.literal("Feature"),
      id: resourceIdSchema,
      properties: z
        .object({
          kind: z.literal("marker"),
          visible: z.boolean(),
          label: geographicLabelSchema,
          style: z.object({ color: geographicColorSchema, size: z.enum(["small", "medium", "large"]) }).strict(),
        })
        .strict(),
      geometry: geographicPointSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("Feature"),
      id: resourceIdSchema,
      properties: z
        .object({
          kind: z.literal("line"),
          visible: z.boolean(),
          label: geographicLabelSchema,
          style: z.object({ color: geographicColorSchema, width: z.number().int().min(1).max(8) }).strict(),
        })
        .strict(),
      geometry: geographicLineSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("Feature"),
      id: resourceIdSchema,
      properties: z
        .object({
          kind: z.literal("area"),
          visible: z.boolean(),
          label: geographicLabelSchema,
          style: z
            .object({
              fillColor: geographicColorSchema,
              strokeColor: geographicColorSchema,
              strokeWidth: z.number().int().min(1).max(8),
              fillOpacity: z.number().min(0.05).max(0.8),
            })
            .strict(),
        })
        .strict(),
      geometry: geographicPolygonSchema,
    })
    .strict(),
]);
export const hallGeographicFeatureCollectionSchema = z
  .object({ type: z.literal("FeatureCollection"), features: z.array(hallGeographicFeatureSchema).max(100) })
  .strict();
export const geographicProvenanceSchema = z
  .object({
    attribution: z.string(),
    license: z.literal("Licence Ouverte 2.0"),
    metadataUrl: z.url(),
    configuredAt: z.iso.datetime({ offset: true }),
    sourceUpdatedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export const geographicDocumentSchema = z
  .object({
    view: geographicViewSchema,
    layers: geographicLayersSchema,
    hallLayer: hallGeographicFeatureCollectionSchema,
    provenance: geographicProvenanceSchema,
  })
  .strict();

// @implements-requirement HALL-FR-DOC-320
export const GEOGRAPHIC_LAYER_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const GEOGRAPHIC_LAYER_MAX_FEATURES = 20_000;
export const geographicLayerGeometryTypes = [
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
] as const;
export const geographicLayerGeometryTypeSchema = z.enum(geographicLayerGeometryTypes);
export const geographicExtentSchema = z
  .tuple([longitudeSchema, latitudeSchema, longitudeSchema, latitudeSchema])
  .refine(([west, south, east, north]) => west <= east && south <= north, "Invalid geographic extent");
// @implements-requirement HALL-FR-DOC-310
export const geographicLayerSourceSchema = z
  .object({
    format: z.literal("geojson"),
    fileName: z.string().trim().min(1),
    byteSize: z.number().int().nonnegative().max(GEOGRAPHIC_LAYER_MAX_FILE_BYTES),
    contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
    importedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
// The features read model is checked for its envelope and geometry type; coordinates were validated at import.
export const geographicLayerFeatureCollectionSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z
      .array(
        z
          .object({
            type: z.literal("Feature"),
            id: z.number().int().nonnegative(),
            sourceId: z.string().nullable(),
            geometry: z.object({ type: geographicLayerGeometryTypeSchema, coordinates: z.array(z.unknown()) }).strict(),
            properties: z.record(z.string(), z.unknown()).nullable(),
          })
          .strict(),
      )
      .max(GEOGRAPHIC_LAYER_MAX_FEATURES),
  })
  .strict();
// @implements-requirement HALL-FR-DOC-330
export const geographicMapOverlaySchema = z
  .object({
    layerId: z.string().uuid(),
    slug: z.string().min(1),
    name: z.string().trim().min(1),
    featureCount: z.number().int().positive(),
    version: z.number().int().positive(),
    position: z.number().int().nonnegative(),
    visible: z.boolean(),
    opacity: z.number().gt(0).max(1),
  })
  .strict();
export const linkGeographicLayerSchema = z
  .object({
    layerId: z.string().uuid(),
    visible: z.boolean(),
    opacity: z.number().gt(0).max(1).optional(),
  })
  .strict();
export const unlinkGeographicLayerSchema = z.object({ layerId: z.string().uuid() }).strict();
// @implements-requirement HALL-FR-DOC-320
export const geographicLayerImportIssueSchema = z
  .object({
    featureIndex: z.number().int().nonnegative().nullable(),
    code: z.enum([
      "invalidJson",
      "notFeatureCollection",
      "unsupportedCrs",
      "tooManyFeatures",
      "noFeatures",
      "invalidFeature",
      "unsupportedGeometry",
      "invalidCoordinates",
      "coordinatesOutOfRange",
      "lineTooShort",
      "ringTooShort",
      "ringNotClosed",
    ]),
    path: z.string(),
  })
  .strict();

export const legalReferenceSnapshotSchema = z
  .object({
    id: resourceIdSchema,
    commonId: z.string().min(1),
    versionId: z.string().min(1),
    effectiveAt: z.iso.date().nullable(),
    fetchedAt: z.iso.datetime({ offset: true }),
    validFrom: z.iso.date().nullable(),
    validTo: z.iso.date().nullable(),
    legalStatus: z.string().min(1),
    normalizedContent: z.string(),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
const legalReferenceDraftDocumentSchema = z
  .object({
    resolutionStatus: z.literal("draft"),
    provider: z.literal("legifrance"),
    referenceKind: z.literal("article"),
    snapshots: z.array(legalReferenceSnapshotSchema).length(0),
  })
  .strict();
export const legalReferenceFundSchema = z.enum(["CODE_ETAT", "CODE_DATE"]);
const legalReferenceResolvedDocumentSchema = z
  .object({
    resolutionStatus: z.literal("resolved"),
    provider: z.literal("legifrance"),
    referenceKind: z.literal("article"),
    fund: legalReferenceFundSchema,
    commonId: z.string().min(1),
    versionId: z.string().min(1),
    effectiveAt: z.iso.date().nullable(),
    legalStatus: z.string().min(1),
    sourceUrl: z.url(),
    fetchedAt: z.iso.datetime({ offset: true }),
    providerUpdatedAt: z.iso.datetime({ offset: true }).nullable(),
    citationLabel: z.string().min(1),
    attribution: z.string().min(1),
    snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
    verificationDueAt: z.iso.datetime({ offset: true }),
    verificationStatus: z.enum(["current", "verificationUnavailable"]),
    verificationFailedAt: z.iso.datetime({ offset: true }).nullable(),
    snapshots: z.array(legalReferenceSnapshotSchema).min(1),
  })
  .strict();
export const legalReferenceDocumentSchema = z.discriminatedUnion("resolutionStatus", [
  legalReferenceDraftDocumentSchema,
  legalReferenceResolvedDocumentSchema,
]);
export const legalReferenceSearchInputSchema = z
  .object({ query: z.string().trim().min(1).max(200), effectiveAt: z.iso.date().nullable().default(null) })
  .strict();
export const legalReferenceSearchResultSchema = z
  .object({
    provider: z.literal("legifrance"),
    referenceKind: z.literal("article"),
    fund: legalReferenceFundSchema,
    versionId: z.string().min(1),
    title: z.string().trim().min(1),
    citationLabel: z.string().trim().min(1),
    effectiveAt: z.iso.date().nullable(),
    legalStatus: z.string().trim().min(1),
    sourceUrl: z.url(),
  })
  .strict();
export const resolveLegalReferenceSchema = z
  .object({
    title: resourceNameSchema,
    provider: z.literal("legifrance"),
    referenceKind: z.literal("article"),
    fund: legalReferenceFundSchema,
    versionId: z
      .string()
      .trim()
      .regex(/^LEGIARTI[0-9A-Z]+$/),
    effectiveAt: z.iso.date().nullable().default(null),
  })
  .strict()
  .refine(({ fund, effectiveAt }) => (fund === "CODE_ETAT" ? effectiveAt === null : effectiveAt !== null), {
    message: "CODE_DATE requires an effective date and CODE_ETAT forbids it",
    path: ["effectiveAt"],
  });
export const refreshLegalReferenceSchema = z
  .object({ expectedSnapshotHash: z.string().regex(/^[0-9a-f]{64}$/) })
  .strict();
export const resourceStateSchema = z.object({
  readiness: z.enum(["incomplete", "empty", "ready"]),
  availability: z.enum(["unchecked", "available", "unavailable"]).nullable(),
});
const resourcePresentationSchema = resourceIdentitySchema.extend({
  tags: resourceTagsSchema,
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
export const remoteResourceTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unconfigured") }),
  z.object({ kind: z.literal("url"), url: z.string().trim().min(1) }),
]);

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

export const resourceSummarySchema = z.discriminatedUnion("kind", [
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
export const resourceCatalogSchema = z.array(resourceCatalogEntrySchema);

export const resourceDetailSchema = z.discriminatedUnion("kind", [
  folderResourceSummarySchema,
  textResourceSummarySchema.extend({ content: z.string(), version: versionSchema }),
  remoteResourceSummarySchema.extend({
    target: remoteResourceTargetSchema,
    version: versionSchema,
  }),
  spreadsheetResourceSummarySchema.extend({
    document: spreadsheetDocumentSchema,
    version: versionSchema,
  }),
  geographicResourceSummarySchema.extend({
    document: geographicDocumentSchema,
    version: versionSchema,
    overlays: z.array(geographicMapOverlaySchema).default([]),
  }),
  eventResourceSummarySchema.extend({ document: eventDocumentSchema, version: versionSchema }),
  legalReferenceResourceSummarySchema.extend({
    document: legalReferenceDocumentSchema,
    version: versionSchema,
  }),
  documentResourceSummarySchema,
  geographicLayerResourceSummarySchema.extend({
    featureCount: z.number().int().positive().max(GEOGRAPHIC_LAYER_MAX_FEATURES),
    extent: geographicExtentSchema,
    source: geographicLayerSourceSchema,
    version: versionSchema,
  }),
]);

const createResourceBaseSchema = z.object({ path: resourcePathSchema, name: resourceNameSchema }).strict();

const createWorkingResourceBaseSchema = createResourceBaseSchema.extend({
  councilBusinessId: resourceIdSchema.optional(),
});

export const createResourceSchema = z.discriminatedUnion("kind", [
  createResourceBaseSchema.extend({ kind: z.literal("folder") }),
  createWorkingResourceBaseSchema.extend({ kind: z.literal("text"), content: z.string() }),
  createWorkingResourceBaseSchema.extend({ kind: z.literal("remote"), target: remoteResourceTargetSchema }),
  createWorkingResourceBaseSchema.extend({ kind: z.literal("spreadsheet"), document: spreadsheetDocumentSchema }),
  createWorkingResourceBaseSchema.extend({ kind: z.literal("geographic") }),
  createWorkingResourceBaseSchema.extend({ kind: z.literal("event"), document: eventDocumentSchema }),
  createWorkingResourceBaseSchema.extend({ kind: z.literal("legalReference") }),
]);

export const relocateResourceSchema = z.object({ path: resourcePathSchema, name: resourceNameSchema });
export const resourceEditingPreferenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fixed") }),
  z.object({ kind: z.literal("autosave"), enabled: z.boolean() }),
]);
export const updateResourceMetadataSchema = relocateResourceSchema.extend({
  tags: resourceTagsSchema,
  editing: resourceEditingPreferenceSchema,
});

export const updateResourceContentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("event"), expectedVersion: versionSchema, document: eventDocumentSchema }),
  z.object({
    kind: z.literal("text"),
    expectedVersion: versionSchema,
    content: z.string(),
    name: resourceNameSchema.optional(),
  }),
  z.object({ kind: z.literal("remote"), expectedVersion: versionSchema, target: remoteResourceTargetSchema }),
  z.object({ kind: z.literal("spreadsheet"), expectedVersion: versionSchema, document: spreadsheetDocumentSchema }),
  z.object({ kind: z.literal("geographic"), expectedVersion: versionSchema, document: geographicDocumentSchema }),
  z.object({
    kind: z.literal("legalReference"),
    expectedVersion: versionSchema,
    document: legalReferenceDocumentSchema,
  }),
]);

export const eventInvitationMethodSchema = z.enum(["request", "cancel"]);
export const generateEventInvitationSchema = z.object({ method: eventInvitationMethodSchema }).strict();

export const resourceSearchMediaSchema = z.enum(["image"]);
// @implements-requirement HALL-FR-SRC-020
export const resourceSearchCriteriaSchema = z.object({
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  context: resourcePathSchema.optional(),
  preferredIds: z.array(resourceIdSchema).optional(),
  excludedIds: z.array(resourceIdSchema).optional(),
  includedIds: z.array(resourceIdSchema).optional(),
  query: z.string().max(200).default(""),
  paths: z.array(resourcePathSchema).default([]),
  kinds: z.array(resourceKindSchema).default([]),
  tags: resourceTagsSchema.default([]),
  readiness: z.array(resourceStateSchema.shape.readiness).default([]),
  media: z.array(resourceSearchMediaSchema).default([]),
});
export const resourceSearchResultSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(resourceSummarySchema),
  facets: z.object({
    paths: z.array(resourcePathSchema),
    tags: resourceTagsSchema,
    readiness: z.array(resourceStateSchema.shape.readiness),
    media: z.array(resourceSearchMediaSchema),
  }),
});

export type ResourceKind = z.infer<typeof resourceKindSchema>;
export type ResourceCatalogEntry = z.infer<typeof resourceCatalogEntrySchema>;
export type ResourceSummary = z.infer<typeof resourceSummarySchema>;
export type ResourceCatalog = z.infer<typeof resourceCatalogSchema>;
export type ResourceDetail = z.infer<typeof resourceDetailSchema>;
export type CreateResource = z.infer<typeof createResourceSchema>;
export type RelocateResource = z.infer<typeof relocateResourceSchema>;
export type UpdateResourceMetadata = z.infer<typeof updateResourceMetadataSchema>;
export type UpdateResourceContent = z.infer<typeof updateResourceContentSchema>;
export type GenerateEventInvitation = z.infer<typeof generateEventInvitationSchema>;
export type ResourceSearchCriteria = z.infer<typeof resourceSearchCriteriaSchema>;
export type ResourceSearchResult = z.infer<typeof resourceSearchResultSchema>;
export type EditorAsset = z.infer<typeof editorAssetSchema>;
export type LegalReferenceSearchInput = z.infer<typeof legalReferenceSearchInputSchema>;
export type LegalReferenceSearchResult = z.infer<typeof legalReferenceSearchResultSchema>;
export type ResolveLegalReference = z.infer<typeof resolveLegalReferenceSchema>;
export type GeographicMapOverlay = z.infer<typeof geographicMapOverlaySchema>;
export type GeographicLayerFeatureCollection = z.infer<typeof geographicLayerFeatureCollectionSchema>;
export type GeographicLayerImportIssue = z.infer<typeof geographicLayerImportIssueSchema>;
export type LinkGeographicLayer = z.infer<typeof linkGeographicLayerSchema>;
export type UnlinkGeographicLayer = z.infer<typeof unlinkGeographicLayerSchema>;

export type { EventDocument, EventSchedule } from "@hall/contracts";
export { eventDocumentSchema } from "@hall/contracts";

export const documentContentHashesSchema = z.array(binarySummarySchema.shape.contentSha256).min(1).max(100);
