import type { ResourceDetail } from "@hall/api-contract";
import { sirenRepresentation } from "../../services/apiClient";
import { listDocumentaryResourceFolder, uploadDocumentaryResource } from "../../services/resourcesApi";

export type ProxyDocument = Extract<ResourceDetail, { kind: "document" }>;

/**
 * Stores the scanned written proxy as a document, or returns the document already stored at the root with the same
 * name and content. Used by the roll call and by the proxies registered before the meeting.
 */
export async function uploadProxyDocument(file: File): Promise<ProxyDocument | null> {
  const { data: documents } = await listDocumentaryResourceFolder("");
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const existing = documents.find(
    (document) => document.kind === "document" && document.name === file.name && document.binary.contentSha256 === hash,
  );
  if (existing?.kind === "document") return existing;
  const form = new FormData();
  form.set("file", file);
  const representation = await sirenRepresentation("/resources");
  const { data } = await uploadDocumentaryResource(representation, form);
  return data.kind === "document" ? data : null;
}
