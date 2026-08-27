import type { DocumentMetadata } from "@mairie/domain";
import { apiRequest, apiResponse } from "./apiClient";

export const listDocuments = () => apiRequest<DocumentMetadata[]>("/documents");
export const uploadDocument = (form: FormData) =>
  apiRequest<DocumentMetadata>("/documents", { method: "POST", body: form });
export const deleteDocument = (documentId: string) => apiRequest(`/documents/${documentId}`, { method: "DELETE" });

export async function downloadDocument(document: DocumentMetadata): Promise<void> {
  const response = await apiResponse(`/documents/${document.id}/content`);
  const url = URL.createObjectURL(await response.blob());
  const link = window.document.createElement("a");
  link.href = url;
  link.download = document.fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export async function loadDocumentObjectUrl(document: DocumentMetadata): Promise<string> {
  const response = await apiResponse(`/documents/${document.id}/content`);
  return URL.createObjectURL(await response.blob());
}
