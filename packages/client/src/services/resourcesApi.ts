import {
  type UpdateResourceContent as DocumentaryResourceContentUpdate,
  type CreateResource as DocumentaryResourceCreate,
  type UpdateResourceMetadata as DocumentaryResourceMetadataUpdate,
  type RelocateResource as DocumentaryResourceRelocation,
  resourceCatalogSchema as documentaryResourceCatalogSchema,
  resourceDetailSchema as documentaryResourceDetailSchema,
  resourceSummarySchema as documentaryResourceSummarySchema,
  editorAssetSchema,
  findSirenLink,
  type LegalReferenceSearchInput,
  legalReferenceSearchResultSchema,
  type ResolveLegalReference,
  type ResourceSearchCriteria,
  type ResourceSearchResult,
  resourceSearchResultSchema,
} from "@hall/api-contract";
import type { DocumentResource, DocumentUsage, EditorAssetOwner, Resource, ResourceKind } from "@hall/domain";
import {
  apiPathFromHref,
  apiRequest,
  apiResponse,
  apiSirenRequest,
  followSirenLink,
  SirenCapabilityUnavailable,
  sirenRepresentation,
  submitSirenAction,
  submitSirenActionAt,
} from "./apiClient";

const documentaryResourcePath = (reference: string) => `/resources/${encodeURIComponent(reference)}`;

/** Reads the lightweight flat catalogue advertised by the resources collection. */
export async function listDocumentaryResourceCatalog() {
  const collectionRepresentation = await sirenRepresentation("/resources");
  const result = await followSirenLink<unknown>(collectionRepresentation, "catalog");
  return {
    ...result,
    collectionRepresentation,
    data: documentaryResourceCatalogSchema.parse(result.data),
  };
}

/** Reads the presentation summaries directly contained in one folder. */
export async function listDocumentaryResourceFolder(path: string) {
  const params = new URLSearchParams({ path });
  const result = await apiSirenRequest<unknown>(`/resources?${params.toString()}`);
  return { ...result, data: documentaryResourceSummarySchema.array().parse(result.data) };
}

/** Searches documentary presentations through the relation advertised by the collection. */
export async function searchDocumentaryResources(
  collectionRepresentation: Parameters<typeof findSirenLink>[0],
  criteria: ResourceSearchCriteria,
) {
  const search = findSirenLink(collectionRepresentation, "search");
  if (!search) throw new SirenCapabilityUnavailable("search");
  const url = new URL(search.href, window.location.origin);
  url.searchParams.set("query", criteria.query);
  const setValues = (name: string, values: readonly string[]) => {
    if (values.length > 0) url.searchParams.set(name, values.join(","));
  };
  setValues("paths", criteria.paths);
  setValues("kinds", criteria.kinds);
  setValues("tags", criteria.tags);
  setValues("readiness", criteria.readiness);
  setValues("media", criteria.media);
  const result = await apiSirenRequest<unknown>(apiPathFromHref(url.href));
  const data: ResourceSearchResult = resourceSearchResultSchema.parse(result.representation?.properties ?? result.data);
  return { ...result, data };
}

/** Opens one documentary resource and preserves its Siren capabilities for the editing session. */
export async function openDocumentaryResource(reference: string) {
  const result = await apiSirenRequest<unknown>(documentaryResourcePath(reference));
  return { ...result, data: documentaryResourceDetailSchema.parse(result.data) };
}

export async function createDocumentaryResource(
  collectionRepresentation: Parameters<typeof findSirenLink>[0],
  input: DocumentaryResourceCreate,
) {
  const result = await submitSirenAction<unknown>(collectionRepresentation, "resource.create", input);
  return { ...result, data: documentaryResourceDetailSchema.parse(result.data) };
}

export async function importDocumentarySpreadsheet(
  collectionRepresentation: Parameters<typeof findSirenLink>[0],
  form: FormData,
) {
  const result = await submitSirenAction<unknown>(collectionRepresentation, "resource.import-spreadsheet", form);
  return { ...result, data: documentaryResourceDetailSchema.parse(result.data) };
}

export async function uploadDocumentaryResource(
  collectionRepresentation: Parameters<typeof findSirenLink>[0],
  form: FormData,
) {
  const result = await submitSirenAction<unknown>(collectionRepresentation, "resource.create-document", form);
  return { ...result, data: documentaryResourceDetailSchema.parse(result.data) };
}

export async function createDocumentaryEditorAsset(
  collectionRepresentation: Parameters<typeof findSirenLink>[0],
  form: FormData,
) {
  const result = await submitSirenAction<unknown>(collectionRepresentation, "resource.create-editor-asset", form);
  return { ...result, data: editorAssetSchema.parse(result.data) };
}

export async function searchDocumentaryLegalReferences(
  collectionRepresentation: Parameters<typeof findSirenLink>[0],
  input: LegalReferenceSearchInput,
) {
  const result = await submitSirenAction<unknown>(collectionRepresentation, "resource.search-legal-references", input);
  return { ...result, data: legalReferenceSearchResultSchema.array().parse(result.data) };
}

export async function resolveDocumentaryLegalReference(
  representation: Parameters<typeof findSirenLink>[0],
  input: ResolveLegalReference,
) {
  const result = await submitSirenAction<unknown>(representation, "resource.resolve-legal-reference", input);
  return { ...result, data: documentaryResourceDetailSchema.parse(result.data) };
}

export async function refreshDocumentaryLegalReference(
  representation: Parameters<typeof findSirenLink>[0],
  expectedSnapshotHash: string,
) {
  const result = await submitSirenAction<unknown>(representation, "resource.refresh-legal-reference", {
    expectedSnapshotHash,
  });
  return { ...result, data: documentaryResourceDetailSchema.parse(result.data) };
}

export async function openDocumentaryEditorAsset(id: string) {
  const result = await apiSirenRequest<unknown>(`/resources/editor-assets/${encodeURIComponent(id)}`);
  return { ...result, data: editorAssetSchema.parse(result.data) };
}

export function documentaryLink(representation: Parameters<typeof findSirenLink>[0], rel: "content" | "preview") {
  const link = findSirenLink(representation, rel);
  if (!link) throw new SirenCapabilityUnavailable(rel);
  return link;
}

export async function downloadDocumentaryResource(
  resource: Extract<ReturnType<typeof documentaryResourceDetailSchema.parse>, { kind: "document" }>,
  representation: Parameters<typeof findSirenLink>[0],
): Promise<void> {
  const content = documentaryLink(representation, "content");
  const response = await apiResponse(apiPathFromHref(content.href));
  const url = URL.createObjectURL(await response.blob());
  const link = window.document.createElement("a");
  link.href = url;
  link.download = resource.name;
  link.click();
  URL.revokeObjectURL(url);
}

export async function relocateDocumentaryResource(
  representation: Parameters<typeof findSirenLink>[0],
  input: DocumentaryResourceRelocation,
) {
  const result = await submitSirenAction<unknown>(representation, "resource.relocate", input);
  return { ...result, data: documentaryResourceDetailSchema.parse(result.data) };
}

export async function updateDocumentaryResourceMetadata(
  representation: Parameters<typeof findSirenLink>[0],
  input: DocumentaryResourceMetadataUpdate,
) {
  const result = await submitSirenAction<unknown>(representation, "resource.update-metadata", input);
  return { ...result, data: documentaryResourceDetailSchema.parse(result.data) };
}

export async function updateDocumentaryResourceContent(
  representation: Parameters<typeof findSirenLink>[0],
  input: DocumentaryResourceContentUpdate,
) {
  const result = await submitSirenAction<unknown>(representation, "resource.update-content", input);
  return { ...result, data: documentaryResourceDetailSchema.parse(result.data) };
}

export async function deleteDocumentaryResource(representation: Parameters<typeof findSirenLink>[0]): Promise<void> {
  await submitSirenAction(representation, "resource.delete");
}

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
export const uploadResourceDocument = (form: FormData) =>
  submitSirenActionAt<Resource>("/resources", "resource.create-document", form).then((result) => result.data);
export const uploadEditorAsset = (form: FormData) =>
  submitSirenActionAt<Resource>("/resources", "resource.create-editor-asset", form).then((result) => result.data);

export async function resourceContentHref(resourceId: string): Promise<string> {
  const representation = await sirenRepresentation(`/resources/${resourceId}`);
  const content = findSirenLink(representation, "content");
  if (!content) throw new SirenCapabilityUnavailable("content");
  return content.href;
}

/** Canonical binary resolver for persisted editor references, whether document or editor asset. */
export function documentaryBinaryReferenceContentHref(id: string): Promise<string> {
  return Promise.resolve(`/api/resources/binary-references/${encodeURIComponent(id)}/content`);
}

async function resourceContentResponse(resourceId: string): Promise<Response> {
  return apiResponse(apiPathFromHref(await resourceContentHref(resourceId)));
}

export interface ResourcePreviewObjectUrl {
  url: string;
  mediaType: string;
}

export async function loadResourcePreviewObjectUrl(
  representation: Parameters<typeof findSirenLink>[0],
): Promise<ResourcePreviewObjectUrl> {
  const preview = documentaryLink(representation, "preview");
  const type = preview.type?.split(";", 1)[0]?.trim().toLowerCase();
  if (type === "text/plain" || type === "text/markdown") {
    const response = await apiResponse(apiPathFromHref(preview.href));
    const blob = await response.blob();
    return { url: URL.createObjectURL(blob), mediaType: blob.type || preview.type || type };
  }
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
