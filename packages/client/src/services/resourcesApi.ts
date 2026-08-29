import { findSirenLink } from "@hall/api-contract";
import type { DocumentResource, EditorAssetOwner, Resource, ResourceDetails } from "@hall/domain";
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
  kind?: "text" | "document";
  meetingId?: string;
  tags?: string[];
  usage?: "document" | "editorAsset";
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
export const createTextResource = (input: Record<string, unknown>) =>
  submitSirenActionAt<Resource>("/resources", "resource.create-text", input).then((result) => result.data);
export const uploadResourceDocument = (form: FormData) =>
  submitSirenActionAt<Resource>("/resources", "resource.create-document", form).then((result) => result.data);
export const uploadEditorAsset = (form: FormData) =>
  submitSirenActionAt<Resource>("/resources", "resource.create-editor-asset", form).then((result) => result.data);
export const getResourceDetails = (resourceId: string) => apiRequest<ResourceDetails>(`/resources/${resourceId}`);
export const getResourceDetailsSiren = (resourceId: string) =>
  apiSirenRequest<ResourceDetails>(`/resources/${resourceId}`);
export const updateResource = (resourceId: string, input: Record<string, unknown>) =>
  submitSirenActionAt<Resource>(`/resources/${resourceId}`, "resource.update", input).then((result) => result.data);
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
  const response = await apiResponse(apiPathFromHref(preview.href), {
    headers: preview.type ? { Accept: preview.type } : undefined,
  });
  const blob = await response.blob();
  const responseMediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
  return {
    url: URL.createObjectURL(blob),
    mediaType: responseMediaType || preview.type || blob.type || "application/octet-stream",
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
