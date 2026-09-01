import {
  documentCategorySchema,
  documentFormatSchema,
  documentUsageSchema,
  editorAssetOwnerSchema,
  type GeographicResource,
  identifierSchema,
  type LegalReferenceResource,
  type LegalReferenceSnapshot,
  legalReferenceFundSchema,
  legalReferenceVerificationStatusSchema,
  matchLiteral,
  type RemoteResource,
  type Resource,
  resourceKindSchema,
  type SpreadsheetResource,
  type TextResource,
} from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { StoredDocumentPreview } from "./contracts.js";
import { asBoolean, asInteger, asNullableString, asString, type DatabaseRow } from "./row.js";

export function structuredValue<T>(value: unknown, schema: { parse(value: unknown): T }): T {
  return schema.parse(typeof value === "string" ? JSON.parse(value) : value);
}

export function assertResourceKind<K extends Resource["kind"]>(
  resource: Resource,
  kind: K,
): asserts resource is Extract<Resource, { kind: K }> {
  if (resource.kind !== kind) throw new Error(`Expected persisted resource kind ${kind}, received ${resource.kind}`);
}

export function requiredRow(row: DatabaseRow | null | undefined, context: string): DatabaseRow {
  if (!row) throw new Error(`Missing persisted row after ${context}`);
  return row;
}

export function binaryValue(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  throw new Error("Expected persisted binary content");
}

export function mapLegalSnapshot(row: DatabaseRow): LegalReferenceSnapshot {
  return {
    id: identifierSchema.parse(row.id),
    commonId: asString(row.common_id, "legal_reference_snapshot.common_id"),
    versionId: asString(row.version_id, "legal_reference_snapshot.version_id"),
    effectiveAt: asNullableString(row.effective_at, "legal_reference_snapshot.effective_at"),
    fetchedAt: asString(row.fetched_at, "legal_reference_snapshot.fetched_at"),
    validFrom: asNullableString(row.valid_from, "legal_reference_snapshot.valid_from"),
    validTo: asNullableString(row.valid_to, "legal_reference_snapshot.valid_to"),
    legalStatus: asString(row.legal_status, "legal_reference_snapshot.legal_status"),
    normalizedContent: asString(row.normalized_content, "legal_reference_snapshot.normalized_content"),
    contentHash: asString(row.content_hash, "legal_reference_snapshot.content_hash"),
    snapshotHash: asString(row.snapshot_hash, "legal_reference_snapshot.snapshot_hash"),
  };
}

export function mapResource(row: DatabaseRow, tags: string[]): Resource {
  const common = {
    id: identifierSchema.parse(row.id),
    slug: asString(row.slug, "resource.slug"),
    title: asString(row.title, "resource.title"),
    folderPath: asString(row.folder_path, "resource.folder_path"),
    tags,
    autosaveEnabled: asBoolean(row.autosave_enabled, "resource.autosave_enabled"),
    createdAt: asString(row.created_at, "resource.created_at"),
    updatedAt: asString(row.updated_at, "resource.updated_at"),
  };
  return matchLiteral(resourceKindSchema.parse(row.kind), {
    text: () => {
      const content = asString(row.text_content, "resource.text_content");
      return {
        kind: "text",
        ...common,
        state: { readiness: content.trim() ? "ready" : "empty", availability: null },
        content,
      } satisfies TextResource;
    },
    remote: () => {
      const url = asNullableString(row.remote_url, "resource.remote_url");
      return {
        kind: "remote",
        ...common,
        state: { readiness: url ? "ready" : "incomplete", availability: url ? "unchecked" : null },
        url,
      } satisfies RemoteResource;
    },
    spreadsheet: () =>
      ({
        kind: "spreadsheet",
        ...common,
        state: { readiness: "ready", availability: null },
        version: asInteger(row.spreadsheet_version, "resource.spreadsheet_version"),
      }) satisfies SpreadsheetResource,
    geographic: () =>
      ({
        kind: "geographic",
        ...common,
        state: { readiness: "ready", availability: "unchecked" },
        provider: "ign",
        version: asInteger(row.geographic_version, "resource.geographic_version"),
      }) satisfies GeographicResource,
    legalReference: () => {
      if (row.legal_common_id === null) {
        return {
          kind: "legalReference",
          ...common,
          state: { readiness: "incomplete", availability: null },
          resolutionStatus: "draft",
          provider: "legifrance",
          referenceKind: "article",
        } satisfies LegalReferenceResource;
      }
      const verificationStatus = legalReferenceVerificationStatusSchema.parse(row.legal_verification_status);
      return {
        kind: "legalReference",
        ...common,
        state: {
          readiness: "ready",
          availability: matchLiteral(verificationStatus, {
            current: () => "available" as const,
            verificationUnavailable: () => "unavailable" as const,
          }),
        },
        resolutionStatus: "resolved",
        provider: "legifrance",
        referenceKind: "article",
        fund: legalReferenceFundSchema.parse(row.legal_fund),
        commonId: asString(row.legal_common_id, "resource.legal_common_id"),
        versionId: asString(row.legal_version_id, "resource.legal_version_id"),
        effectiveAt: asNullableString(row.legal_effective_at, "resource.legal_effective_at"),
        legalStatus: asString(row.legal_status, "resource.legal_status"),
        sourceUrl: asString(row.legal_source_url, "resource.legal_source_url"),
        fetchedAt: asString(row.legal_fetched_at, "resource.legal_fetched_at"),
        providerUpdatedAt: asNullableString(row.legal_provider_updated_at, "resource.legal_provider_updated_at"),
        citationLabel: asString(row.legal_citation_label, "resource.legal_citation_label"),
        attribution: asString(row.legal_attribution, "resource.legal_attribution"),
        snapshotHash: asString(row.legal_snapshot_hash, "resource.legal_snapshot_hash"),
        verificationDueAt: new Date(
          Date.parse(asString(row.legal_fetched_at, "resource.legal_fetched_at")) + 24 * 60 * 60 * 1000,
        ).toISOString(),
        verificationStatus,
        verificationFailedAt: asNullableString(
          row.legal_verification_failed_at,
          "resource.legal_verification_failed_at",
        ),
      } satisfies LegalReferenceResource;
    },
    document: () => {
      const documentCommon = {
        kind: "document" as const,
        ...common,
        state: { readiness: "ready" as const, availability: null },
        meetingId: identifierSchema.nullable().parse(row.meeting_id),
        fileName: asString(row.file_name, "resource.file_name"),
        format: documentFormatSchema.parse(row.format),
        mediaType: asString(row.media_type, "resource.media_type"),
        byteSize: asInteger(row.byte_size, "resource.byte_size"),
        contentSha256: asString(row.content_sha256, "resource.content_sha256"),
      };
      return matchLiteral(documentUsageSchema.parse(row.usage), {
        document: () => {
          if (row.editor_owner_kind !== null || row.editor_owner_id !== null) {
            throw new Error("A documentary resource cannot have an editor owner");
          }
          return {
            ...documentCommon,
            usage: "document" as const,
            category: documentCategorySchema.parse(row.category),
            editorOwner: null,
          };
        },
        editorAsset: () => {
          if (row.category !== null) throw new Error("An editor asset cannot have a document category");
          const owner = editorAssetOwnerSchema.parse({ kind: row.editor_owner_kind, id: row.editor_owner_id });
          return {
            ...documentCommon,
            usage: "editorAsset" as const,
            category: null,
            editorOwner: matchLiteral(owner.kind, {
              textResourceContent: () => ({ kind: "textResourceContent" as const, id: owner.id }),
              councilBusinessReport: () => ({ kind: "councilBusinessReport" as const, id: owner.id }),
              councilDecisionDraft: () => ({ kind: "councilDecisionDraft" as const, id: owner.id }),
              agendaItemDiscussionSummary: () => ({ kind: "agendaItemDiscussionSummary" as const, id: owner.id }),
            }),
          };
        },
      });
    },
  });
}

export async function tagsFor(sqlExecutor: SqlExecutor, resourceId: string): Promise<string[]> {
  return (await sqlExecutor.all("resource.tags", { resourceId })).map((row) => asString(row.tag, "resource.tag"));
}

export async function mapStoredResource(sqlExecutor: SqlExecutor, row: DatabaseRow): Promise<Resource> {
  return mapResource(row, await tagsFor(sqlExecutor, identifierSchema.parse(row.id)));
}

export function mapDocumentPreview(row: DatabaseRow): StoredDocumentPreview {
  return {
    sourceContentSha256: asString(row.source_content_sha256, "document_preview.source_content_sha256"),
    sourceFormat: documentFormatSchema.parse(row.source_format),
    contentSha256: asString(row.content_sha256, "document_preview.content_sha256"),
    byteSize: asInteger(row.byte_size, "document_preview.byte_size"),
    content: Buffer.from(binaryValue(row.content)),
    createdAt: asString(row.created_at, "document_preview.created_at"),
  };
}
