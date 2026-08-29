import { createHash } from "node:crypto";
import { extname } from "node:path";
import type { DocumentFormat } from "@hall/domain";
import { fileTypeFromBuffer } from "file-type";
import { DomainError } from "../services/errors.js";

export interface DocumentInspection {
  format: DocumentFormat;
  mediaType: string;
  contentSha256: string;
}

interface BinaryDocumentPolicy {
  format: DocumentFormat;
  mediaType: string;
  detectedExtension: string;
}

interface TextDocumentPolicy {
  format: "txt" | "csv";
  mediaType: string;
  text: true;
}

type DocumentFormatPolicy = BinaryDocumentPolicy | TextDocumentPolicy;

function isUtf8Text(content: Buffer): boolean {
  if (content.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(content);
    return true;
  } catch {
    return false;
  }
}

const policiesByExtension: Record<string, DocumentFormatPolicy> = {
  ".pdf": { format: "pdf", mediaType: "application/pdf", detectedExtension: "pdf" },
  ".jpg": { format: "jpeg", mediaType: "image/jpeg", detectedExtension: "jpg" },
  ".jpeg": { format: "jpeg", mediaType: "image/jpeg", detectedExtension: "jpg" },
  ".png": { format: "png", mediaType: "image/png", detectedExtension: "png" },
  ".docx": {
    format: "docx",
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    detectedExtension: "docx",
  },
  ".odt": {
    format: "odt",
    mediaType: "application/vnd.oasis.opendocument.text",
    detectedExtension: "odt",
  },
  ".xlsx": {
    format: "xlsx",
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    detectedExtension: "xlsx",
  },
  ".pptx": {
    format: "pptx",
    mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    detectedExtension: "pptx",
  },
  ".txt": { format: "txt", mediaType: "text/plain; charset=utf-8", text: true },
  ".csv": { format: "csv", mediaType: "text/csv; charset=utf-8", text: true },
};

export const acceptedDocumentExtensions = Object.freeze(Object.keys(policiesByExtension));

/**
 * Inspects an uploaded original before persistence. The request-provided MIME type is deliberately
 * ignored. Binary containers are parsed by file-type; text formats must be valid UTF-8 without NUL bytes.
 */
export async function inspectDocument(fileName: string, content: Buffer): Promise<DocumentInspection> {
  const policy = policiesByExtension[extname(fileName).toLowerCase()];
  if (!policy) throw new DomainError("unsupported_document_format", 415);
  if ("text" in policy) {
    if (!isUtf8Text(content)) throw new DomainError("document_content_mismatch", 422);
  } else {
    const detected = await fileTypeFromBuffer(content);
    if (detected?.ext !== policy.detectedExtension || detected.mime !== policy.mediaType) {
      throw new DomainError("document_content_mismatch", 422);
    }
  }
  return {
    format: policy.format,
    mediaType: policy.mediaType,
    contentSha256: createHash("sha256").update(content).digest("hex"),
  };
}
