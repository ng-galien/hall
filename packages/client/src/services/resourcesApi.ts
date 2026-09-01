import { findSirenLink } from "@hall/api-contract";
import type {
  DocumentResource,
  DocumentUsage,
  EditorAssetOwner,
  FolderCreateResult,
  FolderRenameResult,
  GeographicResource,
  LegalReferenceResource,
  LegalReferenceSearchResult,
  RemoteResource,
  Resource,
  ResourceDetails,
  ResourceKind,
  SpreadsheetResource,
} from "@hall/domain";
import {
  apiPathFromHref,
  apiRequest,
  apiResponse,
  apiSirenRequest,
  SirenCapabilityUnavailable,
  sirenRepresentation,
  submitSirenActionAt,
} from "./apiClient";

export interface ResourceFilters {
  folderPath?: string;
  kind?: ResourceKind;
  meetingId?: string;
  tags?: string[];
  usage?: DocumentUsage;
  editorOwner?: EditorAssetOwner;
}

const resourceQuery = (filters: ResourceFilters = {}) => {
  const params = new URLSearchParams();
  if (filters.folderPath !== undefined) params.set("folderPath", filters.folderPath);
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.meetingId) params.set("meetingId", filters.meetingId);
  if (filters.tags?.length) params.set("tags", filters.tags.join(","));
  if (filters.usage) params.set("usage", filters.usage);
  if (filters.editorOwner) {
    params.set("editorOwnerKind", filters.editorOwner.kind);
    params.set("editorOwnerId", filters.editorOwner.id);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
};

export const listResources = (filters?: ResourceFilters) =>
  apiRequest<Resource[]>(`/resources${resourceQuery(filters)}`);
export const listFolderPaths = () => apiRequest<string[]>("/resources/paths");
export const createFolder = (parentPath: string, name: string) =>
  submitSirenActionAt<FolderCreateResult>("/resources", "workspace.create-folder", { parentPath, name }).then(
    (result) => result.data,
  );
export const renameFolder = (folderPath: string, name: string) =>
  submitSirenActionAt<FolderRenameResult>("/resources", "workspace.rename-folder", { folderPath, name }).then(
    (result) => result.data,
  );
export const createTextResource = (input: Record<string, unknown>) =>
  submitSirenActionAt<Resource>("/resources", "resource.create-text", input).then((result) => result.data);
export const createRemoteResource = (input: Record<string, unknown>) =>
  submitSirenActionAt<RemoteResource>("/resources", "resource.create-remote", input).then((result) => result.data);
export const createGeographicResource = (input: Record<string, unknown>) =>
  submitSirenActionAt<GeographicResource>("/resources", "resource.create-geographic", input).then(
    (result) => result.data,
  );
export const createSpreadsheetResource = (input: Record<string, unknown>) =>
  submitSirenActionAt<SpreadsheetResource>("/resources", "resource.create-spreadsheet", input).then(
    (result) => result.data,
  );
export const importSpreadsheetResource = (form: FormData) =>
  submitSirenActionAt<SpreadsheetResource>("/resources", "resource.import-spreadsheet", form).then(
    (result) => result.data,
  );
export const searchLegalReferences = (input: { query: string; effectiveAt: string | null }) =>
  submitSirenActionAt<LegalReferenceSearchResult[]>("/resources", "resource.search-legal-references", input).then(
    (result) => result.data,
  );
export const createLegalReferenceResource = (input: Record<string, unknown>) =>
  submitSirenActionAt<LegalReferenceResource>("/resources", "resource.create-legal-reference", input).then(
    (result) => result.data,
  );
export const resolveLegalReferenceResource = (resourceId: string, input: Record<string, unknown>) =>
  submitSirenActionAt<LegalReferenceResource>(
    `/resources/${resourceId}`,
    "resource.resolve-legal-reference",
    input,
  ).then((result) => result.data);
export const uploadResourceDocument = (form: FormData) =>
  submitSirenActionAt<Resource>("/resources", "resource.create-document", form).then((result) => result.data);
export const uploadEditorAsset = (form: FormData) =>
  submitSirenActionAt<Resource>("/resources", "resource.create-editor-asset", form).then((result) => result.data);
export const getResourceDetails = (resourceId: string) => apiRequest<ResourceDetails>(`/resources/${resourceId}`);
export const getResourceDetailsSiren = (resourceId: string) =>
  apiSirenRequest<ResourceDetails>(`/resources/${resourceId}`);
export const updateResource = (resourceId: string, input: Record<string, unknown>) =>
  submitSirenActionAt<Resource>(`/resources/${resourceId}`, "resource.update", input).then((result) => result.data);
export const updateGeographicResource = (resourceId: string, input: Record<string, unknown>) =>
  submitSirenActionAt<GeographicResource>(`/resources/${resourceId}`, "resource.update-geography", input).then(
    (result) => result.data,
  );
export const updateSpreadsheetResource = (resourceId: string, input: Record<string, unknown>) =>
  submitSirenActionAt<SpreadsheetResource>(`/resources/${resourceId}`, "resource.update-spreadsheet", input).then(
    (result) => result.data,
  );
export const refreshLegalReferenceResource = (resourceId: string, expectedSnapshotHash: string) =>
  submitSirenActionAt<LegalReferenceResource>(`/resources/${resourceId}`, "resource.refresh-legal-reference", {
    expectedSnapshotHash,
  }).then((result) => result.data);
export const deleteResource = (resourceId: string) =>
  submitSirenActionAt(`/resources/${resourceId}`, "resource.delete").then((result) => result.data);

export async function resourceContentHref(resourceId: string): Promise<string> {
  const representation = await sirenRepresentation(`/resources/${resourceId}`);
  const content = findSirenLink(representation, "content");
  if (!content) throw new SirenCapabilityUnavailable("content");
  return content.href;
}

async function resourceContentResponse(resourceId: string): Promise<Response> {
  return apiResponse(apiPathFromHref(await resourceContentHref(resourceId)));
}

export interface ResourcePreviewObjectUrl {
  url: string;
  mediaType: string;
}

export async function loadResourcePreviewObjectUrl(resourceId: string): Promise<ResourcePreviewObjectUrl> {
  const representation = await sirenRepresentation(`/resources/${resourceId}`);
  const preview = findSirenLink(representation, "preview");
  if (!preview) throw new SirenCapabilityUnavailable("preview");
  return {
    url: preview.href,
    mediaType: preview.type || "application/octet-stream",
  };
}

export async function downloadResourceDocument(resource: DocumentResource): Promise<void> {
  const response = await resourceContentResponse(resource.id);
  const url = URL.createObjectURL(await response.blob());
  const link = window.document.createElement("a");
  link.href = url;
  link.download = resource.fileName;
  link.click();
  URL.revokeObjectURL(url);
}
