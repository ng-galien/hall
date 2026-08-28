import { findSirenLink } from "@hall/api-contract";
import type { DocumentResource, Resource, ResourceDetails } from "@hall/domain";
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
}

const resourceQuery = (filters: ResourceFilters = {}) => {
  const params = new URLSearchParams();
  if (filters.folderPath !== undefined) params.set("folderPath", filters.folderPath);
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.meetingId) params.set("meetingId", filters.meetingId);
  if (filters.tags?.length) params.set("tags", filters.tags.join(","));
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

export async function downloadResourceDocument(resource: DocumentResource): Promise<void> {
  const response = await resourceContentResponse(resource.id);
  const url = URL.createObjectURL(await response.blob());
  const link = window.document.createElement("a");
  link.href = url;
  link.download = resource.fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export async function loadResourceObjectUrl(resource: DocumentResource): Promise<string> {
  const response = await resourceContentResponse(resource.id);
  return URL.createObjectURL(await response.blob());
}
