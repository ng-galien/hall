import { z } from "zod";
import { documentFormats, templateKinds } from "./model.js";

const nonEmpty = z.string().trim().min(1);
const boundedText = (maximum: number) => z.string().trim().max(maximum);
const longitudeSchema = z.number().finite().min(-180).max(180);
const latitudeSchema = z.number().finite().min(-90).max(90);
const geographicPositionSchema = z.tuple([longitudeSchema, latitudeSchema]);
const templateTypeName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9.-]*$/);

const timeZoneSchema = nonEmpty.max(100).refine((timeZone) => {
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}, "Invalid IANA time zone");

const webUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "URL must use HTTP or HTTPS");

export const identifierSchema = z.string().uuid();
export const documentFormatSchema = z.enum(documentFormats);
export const templateKindSchema = z.enum(templateKinds);

export const updateHallSettingsSchema = z.object({
  name: nonEmpty.max(160),
  inseeCode: z
    .string()
    .trim()
    .regex(/^(?:\d{5}|2[AB]\d{3})$/)
    .nullable(),
  siren: z
    .string()
    .trim()
    .regex(/^\d{9}$/)
    .nullable(),
  population: z.number().int().nonnegative().nullable(),
  populationReferenceDate: z.iso.date().nullable(),
  addressLine1: boundedText(200),
  addressLine2: boundedText(200),
  postalCode: boundedText(16),
  city: boundedText(160),
  geographicPosition: geographicPositionSchema.nullable(),
  phone: boundedText(40),
  email: z.email().nullable(),
  website: webUrlSchema.nullable(),
  meetingLocations: z
    .array(nonEmpty.max(200))
    .max(100)
    .refine((names) => new Set(names).size === names.length),
  timeZone: timeZoneSchema,
  outboundEmailSenderName: boundedText(160),
  outboundEmailSenderAddress: z.email().nullable(),
  outboundEmailReplyToAddress: z.email().nullable(),
});

const contentTemplateShape = {
  documentType: templateTypeName,
  name: nonEmpty.max(160),
  bodyMarkdown: z.string().max(500_000),
  subject: z.string().max(500).nullable().optional(),
  stylesheet: z.string().max(100_000).default(""),
  headerHtml: z.string().max(100_000).default(""),
  footerHtml: z.string().max(100_000).default(""),
};

export const createContentTemplateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pdf"),
    ...contentTemplateShape,
    subject: z.null().optional().default(null),
  }),
  z.object({
    kind: z.literal("message"),
    ...contentTemplateShape,
    subject: nonEmpty.max(500),
    stylesheet: z.literal("").optional().default(""),
    headerHtml: z.literal("").optional().default(""),
    footerHtml: z.literal("").optional().default(""),
  }),
]);

export const updateContentTemplateSchema = createContentTemplateSchema;

const templateRenderContextSchema = z.object({
  meetingId: z.string().uuid().optional(),
  minutesId: z.string().uuid().optional(),
});

export const previewContentTemplateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pdf"),
    bodyMarkdown: z.string().max(500_000),
    subject: z.null().optional().default(null),
    stylesheet: z.string().max(100_000).default(""),
    headerHtml: z.string().max(100_000).default(""),
    footerHtml: z.string().max(100_000).default(""),
    context: templateRenderContextSchema.default({}),
  }),
  z.object({
    kind: z.literal("message"),
    bodyMarkdown: z.string().max(500_000),
    subject: z.string().max(500),
    context: templateRenderContextSchema.default({}),
  }),
]);

export const previewPdfSchema = z.object({
  bodyMarkdown: z.string().max(500_000),
  context: templateRenderContextSchema.default({}),
  /** Append the PDF documents the text references, linked from the text; otherwise they stay plain text. */
  attachPdfDocuments: z.boolean().default(true),
});

export const generateContentTemplateSchema = z.object({
  context: templateRenderContextSchema.default({}),
  attachmentResourceIds: z.array(z.string().uuid()).max(20).default([]),
  to: z.array(z.email()).max(200).default([]),
  cc: z.array(z.email()).max(200).default([]),
  bcc: z.array(z.email()).max(200).default([]),
});

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);
function isJsonObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const spreadsheetWorkbookSchema = z.record(z.string(), jsonValueSchema).superRefine((workbook, context) => {
  if (typeof workbook.id !== "string" || !workbook.id.trim()) {
    context.addIssue({ code: "custom", message: "Spreadsheet workbook must have an id", path: ["id"] });
  }
  if (typeof workbook.name !== "string") {
    context.addIssue({ code: "custom", message: "Spreadsheet workbook must have a name", path: ["name"] });
  }
  const sheetOrder = workbook.sheetOrder;
  const sheets = workbook.sheets;
  if (!Array.isArray(sheetOrder) || sheetOrder.length === 0 || sheetOrder.length > 100) {
    context.addIssue({
      code: "custom",
      message: "Spreadsheet workbook must contain between 1 and 100 sheets",
      path: ["sheetOrder"],
    });
    return;
  }
  if (!sheets || Array.isArray(sheets) || typeof sheets !== "object") {
    context.addIssue({ code: "custom", message: "Spreadsheet workbook sheets must be an object", path: ["sheets"] });
    return;
  }
  const uniqueSheetIds = new Set<string>();
  for (const sheetId of sheetOrder) {
    if (typeof sheetId !== "string" || !sheetId || uniqueSheetIds.has(sheetId) || !(sheetId in sheets)) {
      context.addIssue({
        code: "custom",
        message: "Spreadsheet sheet order must contain unique existing sheet ids",
        path: ["sheetOrder"],
      });
      return;
    }
    uniqueSheetIds.add(sheetId);
    const sheet = sheets[sheetId];
    if (!isJsonObject(sheet)) {
      context.addIssue({ code: "custom", message: "Spreadsheet sheets must be objects", path: ["sheets", sheetId] });
      continue;
    }
    if (sheet.id !== sheetId) {
      context.addIssue({
        code: "custom",
        message: "Spreadsheet sheet id must match its key",
        path: ["sheets", sheetId, "id"],
      });
    }
    if (typeof sheet.name !== "string" || !sheet.name.trim()) {
      context.addIssue({
        code: "custom",
        message: "Spreadsheet sheet must have a name",
        path: ["sheets", sheetId, "name"],
      });
    }
    if (!Number.isInteger(sheet.rowCount) || Number(sheet.rowCount) < 1 || Number(sheet.rowCount) > 1_048_576) {
      context.addIssue({
        code: "custom",
        message: "Spreadsheet sheet row count is invalid",
        path: ["sheets", sheetId, "rowCount"],
      });
    }
    if (!Number.isInteger(sheet.columnCount) || Number(sheet.columnCount) < 1 || Number(sheet.columnCount) > 16_384) {
      context.addIssue({
        code: "custom",
        message: "Spreadsheet sheet column count is invalid",
        path: ["sheets", sheetId, "columnCount"],
      });
    }
    for (const property of ["cellData", "rowData", "columnData"] as const) {
      if (sheet[property] !== undefined && !isJsonObject(sheet[property])) {
        context.addIssue({
          code: "custom",
          message: `Spreadsheet sheet ${property} must be an object`,
          path: ["sheets", sheetId, property],
        });
      }
    }
    if (sheet.mergeData !== undefined && !Array.isArray(sheet.mergeData)) {
      context.addIssue({
        code: "custom",
        message: "Spreadsheet sheet mergeData must be an array",
        path: ["sheets", sheetId, "mergeData"],
      });
    }
  }
  for (const sheetId of Object.keys(sheets)) {
    if (!uniqueSheetIds.has(sheetId)) {
      context.addIssue({
        code: "custom",
        message: "Spreadsheet workbook contains an unordered sheet",
        path: ["sheets", sheetId],
      });
    }
  }
});

export const spreadsheetDocumentSchema = z
  .object({
    schemaVersion: z.literal(2),
    workbook: spreadsheetWorkbookSchema,
  })
  .strict()
  .superRefine((document, context) => {
    if (new TextEncoder().encode(JSON.stringify(document)).byteLength > 10_000_000) {
      context.addIssue({ code: "custom", message: "Spreadsheet document is too large" });
    }
  });
