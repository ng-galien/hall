import { createHash } from "node:crypto";
import { extname } from "node:path";
import { type DocumentFormat, matchLiteral } from "@hall/domain";
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

export type DocumentPreviewMode = "native" | "convertible" | "unavailable";

/**
 * Single exhaustive authority for document preview support. Routes and Siren
 * representations must consult this policy instead of maintaining format lists.
 */
export function documentPreviewMode(format: DocumentFormat): DocumentPreviewMode {
  return matchLiteral(format, {
    pdf: () => "native" as const,
    jpeg: () => "native" as const,
    png: () => "native" as const,
    docx: () => "convertible" as const,
    odt: () => "convertible" as const,
    xlsx: () => "convertible" as const,
    pptx: () => "convertible" as const,
    txt: () => "convertible" as const,
    csv: () => "convertible" as const,
  });
}

function isUtf8Text(content: Buffer): boolean {
  if (content.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(content);
    return true;
  } catch {
    return false;
  }
}

const documentPoliciesByExtension: Record<string, DocumentFormatPolicy> = {
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
  ".pptx": {
    format: "pptx",
    mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    detectedExtension: "pptx",
  },
  ".txt": { format: "txt", mediaType: "text/plain; charset=utf-8", text: true },
};

const spreadsheetImportPoliciesByExtension: Record<string, DocumentFormatPolicy> = {
  ".csv": { format: "csv", mediaType: "text/csv; charset=utf-8", text: true },
  ".xlsx": {
    format: "xlsx",
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    detectedExtension: "xlsx",
  },
};

export const acceptedDocumentExtensions = Object.freeze(Object.keys(documentPoliciesByExtension));
export const acceptedSpreadsheetImportExtensions = Object.freeze(Object.keys(spreadsheetImportPoliciesByExtension));

/**
 * Inspects an uploaded original before persistence. The request-provided MIME type is deliberately
 * ignored. Binary containers are parsed by file-type; text formats must be valid UTF-8 without NUL bytes.
 */
async function inspect(
  policiesByExtension: Record<string, DocumentFormatPolicy>,
  fileName: string,
  content: Buffer,
): Promise<DocumentInspection> {
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

export function inspectDocument(fileName: string, content: Buffer): Promise<DocumentInspection> {
  return inspect(documentPoliciesByExtension, fileName, content);
}

export function inspectSpreadsheetImport(fileName: string, content: Buffer): Promise<DocumentInspection> {
  return inspect(spreadsheetImportPoliciesByExtension, fileName, content);
}
