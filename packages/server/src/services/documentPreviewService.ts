import { createHash } from "node:crypto";
import { inspectDocument } from "../domain/documentPolicy.js";
import type { ResourceRepository, StoredDocumentPreview } from "../repositories/contracts.js";
import { type DocumentPreviewConverter, DocumentPreviewConverterUnavailableError } from "./documentPreviewConverter.js";
import { DomainError } from "./errors.js";

export interface DocumentPreviewService {
  get(resourceId: string): Promise<StoredDocumentPreview>;
}

const convertibleFormats = new Set(["docx", "odt", "xlsx", "pptx", "txt", "csv"]);

export function createDocumentPreviewService({
  resourceRepository,
  documentPreviewConverter,
}: {
  resourceRepository: ResourceRepository;
  documentPreviewConverter: DocumentPreviewConverter;
}): DocumentPreviewService {
  const conversions = new Map<string, Promise<StoredDocumentPreview>>();

  async function convert(resourceId: string): Promise<StoredDocumentPreview> {
    const resource = await resourceRepository.find(resourceId);
    if (!resource) throw new DomainError("resource_not_found", 404);
    if (resource.kind !== "document" || !convertibleFormats.has(resource.format)) {
      throw new DomainError("resource_preview_unavailable", 409);
    }
    const cached = await resourceRepository.findPreview(resource.contentSha256, resource.format);
    if (cached) return cached;
    let content: Buffer;
    try {
      content = await documentPreviewConverter.convertToPdf(resource);
    } catch (error) {
      if (error instanceof DocumentPreviewConverterUnavailableError) {
        throw new DomainError("resource_preview_conversion_unavailable", 503);
      }
      throw new DomainError("resource_preview_conversion_failed", 502);
    }
    try {
      await inspectDocument("preview.pdf", content);
    } catch {
      throw new DomainError("resource_preview_conversion_failed", 502);
    }
    return resourceRepository.savePreview({
      sourceContentSha256: resource.contentSha256,
      sourceFormat: resource.format,
      contentSha256: createHash("sha256").update(content).digest("hex"),
      byteSize: content.byteLength,
      content,
      createdAt: new Date().toISOString(),
    });
  }

  return {
    async get(resourceId) {
      const resource = await resourceRepository.findMetadata(resourceId);
      if (!resource) throw new DomainError("resource_not_found", 404);
      if (resource.kind !== "document") throw new DomainError("resource_preview_unavailable", 409);
      const conversionKey = `${resource.contentSha256}:${resource.format}`;
      const existing = conversions.get(conversionKey);
      if (existing) return existing;
      const pending = convert(resource.id).finally(() => conversions.delete(conversionKey));
      conversions.set(conversionKey, pending);
      return pending;
    },
  };
}
