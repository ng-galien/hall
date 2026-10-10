import { z } from "zod";
import { editorAssetSchema, resourceDetailSchema, resourceIdSchema, resourceNameSchema } from "./resources.js";

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const bundleFileSchema = z
  .object({
    path: z.string().regex(/^blobs\/[a-f0-9]{64}$/),
    sha256: digestSchema,
    byteSize: z.number().int().nonnegative(),
    mediaType: z.string().min(1).max(255),
  })
  .strict();

/** Transfer contract only: source identities are not destination resource identifiers. */
export const councilBusinessBundleManifestSchema = z
  .object({
    format: z.literal("hall-council-business"),
    version: z.literal(1),
    sender: z
      .object({
        firstName: z.string().trim().min(1).max(200),
        lastName: z.string().trim().min(1).max(200),
        slug: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(400),
      })
      .strict(),
    business: z
      .object({
        sourceId: resourceIdSchema,
        folderSourceId: resourceIdSchema,
        name: resourceNameSchema,
        reportSourceId: resourceIdSchema,
        resourceSourceIds: z.array(resourceIdSchema).max(2000),
      })
      .strict(),
    resources: z
      .array(
        z
          .object({
            data: resourceDetailSchema,
            binaryPath: bundleFileSchema.shape.path.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(2000),
    files: z.array(bundleFileSchema).max(4000),
    editorAssets: z
      .array(z.object({ data: editorAssetSchema, binaryPath: bundleFileSchema.shape.path }).strict())
      .max(4000),
    externalReferenceIds: z.array(z.string().min(1)).max(4000),
    // @implements-requirement HALL-FR-DOC-390
    geographicFeatureNotes: z
      .array(
        z
          .object({
            noteSourceId: resourceIdSchema,
            subjectKind: z.enum(["cadastreParcel", "layerFeature"]),
            layerSourceId: resourceIdSchema.nullable(),
            key: z.string().min(1),
          })
          .strict(),
      )
      .max(20_000)
      .default([]),
    // @implements-requirement HALL-FR-DOC-400
    municipalProperty: z
      .object({
        sources: z
          .array(
            z
              .object({
                id: resourceIdSchema,
                label: z.string().min(1),
                fileName: z.string().min(1).nullable(),
                importedAt: z.iso.datetime({ offset: true }),
                importedBy: z.string().min(1),
              })
              .strict(),
          )
          .max(1000),
        parcels: z.array(z.object({ parcelId: z.string().min(1), sourceId: resourceIdSchema }).strict()).max(50_000),
      })
      .strict()
      .nullable()
      .default(null),
  })
  .strict();

export type CouncilBusinessBundleManifest = z.infer<typeof councilBusinessBundleManifestSchema>;
