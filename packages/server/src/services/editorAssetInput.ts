import { resourceIdSchema } from "@hall/api-contract";
import { collectResourceReferences, parse } from "@hall/templating";
import { inspectDocument } from "../domain/documentPolicy.js";
import { DomainError } from "./errors.js";

export async function inspectEditorImage(fileName: string, content: Buffer) {
  const inspection = await inspectDocument(fileName, content);
  if (inspection.format !== "jpeg" && inspection.format !== "png") {
    throw new DomainError("unsupported_document_format", 415);
  }
  return {
    mediaType: inspection.format === "jpeg" ? ("image/jpeg" as const) : ("image/png" as const),
    contentSha256: inspection.contentSha256,
  };
}

export function referencedEditorAssetIds(content: string): string[] {
  return collectResourceReferences(parse(content))
    .map(({ id }) => id)
    .filter((id) => resourceIdSchema.safeParse(id).success);
}
