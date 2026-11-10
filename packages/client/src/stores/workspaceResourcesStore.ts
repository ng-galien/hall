import {
  type CreateResource,
  type EditorAsset,
  findSirenAction,
  type LegalReferenceSearchInput,
  type LegalReferenceSearchResult,
  type RelocateResource,
  type ResolveLegalReference,
  type ResourceCatalogEntry,
  type ResourceDetail,
  type ResourceSearchCriteria,
  type ResourceSearchResult,
  type ResourceSummary,
  resourceSummarySchema,
  type SirenEntity,
  type UpdateResourceContent,
  type UpdateResourceMetadata,
} from "@hall/api-contract";
import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode, SirenCapabilityUnavailable } from "../services/apiClient";
import {
  createDocumentaryEditorAsset,
  createDocumentaryResource,
  deleteDocumentaryResource,
  importDocumentarySpreadsheet,
  listDocumentaryResourceCatalog,
  listDocumentaryResourceFolder,
  openDocumentaryResource,
  openPersonalWorkspace,
  refreshDocumentaryLegalReference,
  relocateDocumentaryResource,
  resolveDocumentaryLegalReference,
  searchDocumentaryLegalReferences,
  searchDocumentaryResources,
  updateDocumentaryResourceContent,
  updateDocumentaryResourceMetadata,
  uploadDocumentaryResource,
} from "../services/resourcesApi";

interface WorkspaceResourceCollectionCapabilities {
  create: boolean;
  importSpreadsheet: boolean;
  createEditorAsset: boolean;
  uploadDocument: boolean;
  searchLegalReferences: boolean;
  createCouncilBusiness: boolean;
  importCouncilBusinessBundle: boolean;
}

interface WorkspaceResourcesState {
  catalog: ResourceCatalogEntry[];
  summaries: Record<string, ResourceSummary>;
  details: Record<string, ResourceDetail>;
  representations: Record<string, SirenEntity>;
  collectionRepresentation: SirenEntity | null;
  collectionCapabilities: WorkspaceResourceCollectionCapabilities;
  /** Creation affordances of each listed folder; a folder offers only what the caller may create in it. */
  folderRepresentations: Record<string, SirenEntity>;
  folderCapabilities: Record<string, WorkspaceResourceCollectionCapabilities>;
  /** Full path of the signed-in council member's personal folder, when the account has one. */
  personalWorkspacePath: string | null;
  loadPersonalWorkspace(): Promise<void>;
  catalogLoading: boolean;
  loadedPaths: string[];
  loadingPaths: string[];
  searchResult: ResourceSearchResult | null;
  searchLoading: boolean;
  error: ApiErrorCode | null;
  openErrors: Record<string, ApiErrorCode | null>;
  loadCatalog(): Promise<void>;
  loadFolder(path: string, options?: { force?: boolean }): Promise<void>;
  hydrate(criteria: ResourceSearchCriteria): Promise<ResourceSearchResult | null>;
  open(reference: string): Promise<Awaited<ReturnType<typeof openDocumentaryResource>> | null>;
  search(criteria: ResourceSearchCriteria): Promise<ResourceSearchResult | null>;
  clearSearch(): void;
  create(input: CreateResource, source?: SirenEntity): Promise<ResourceDetail | null>;
  importSpreadsheet(form: FormData, source?: SirenEntity): Promise<ResourceDetail | null>;
  uploadDocument(form: FormData, source?: SirenEntity): Promise<ResourceDetail | null>;
  createEditorAsset(form: FormData): Promise<EditorAsset | null>;
  searchLegalReferences(input: LegalReferenceSearchInput): Promise<LegalReferenceSearchResult[]>;
  resolveLegalReference(reference: string, input: ResolveLegalReference): Promise<ResourceDetail | null>;
  refreshLegalReference(reference: string, expectedSnapshotHash: string): Promise<ResourceDetail | null>;
  updateMetadata(reference: string, input: UpdateResourceMetadata): Promise<ResourceDetail | null>;
  updateContent(reference: string, input: UpdateResourceContent): Promise<ResourceDetail | null>;
  relocate(reference: string, input: RelocateResource): Promise<ResourceDetail | null>;
  remove(reference: string): Promise<boolean>;
  invalidate(invalidation: { ids?: readonly string[]; paths?: readonly string[] }): void;
  /** Summaries read through another projection (a business's documents) without loading the catalog. */
  adoptSummaries(summaries: readonly ResourceSummary[]): void;
  /** Keeps the action-less entities of search results for resources whose representation is not loaded. */
  adoptSearchRepresentations(representation: SirenEntity | null): void;
}

function collectionCapabilities(representation: SirenEntity): WorkspaceResourceCollectionCapabilities {
  return {
    create: Boolean(findSirenAction(representation, "resource.create")),
    importSpreadsheet: Boolean(findSirenAction(representation, "resource.import-spreadsheet")),
    createEditorAsset: Boolean(findSirenAction(representation, "resource.create-editor-asset")),
    uploadDocument: Boolean(findSirenAction(representation, "resource.create-document")),
    searchLegalReferences: Boolean(findSirenAction(representation, "resource.search-legal-references")),
    createCouncilBusiness: Boolean(findSirenAction(representation, "council-business.create")),
    importCouncilBusinessBundle: Boolean(findSirenAction(representation, "council-business.import-bundle")),
  };
}

function formPath(form: FormData): string {
  const path = form.get("path");
  return typeof path === "string" ? path : "";
}

/** Creation capabilities in one folder, from its own listing once loaded. */
export function folderCapabilitiesAt(
  state: Pick<WorkspaceResourcesState, "collectionCapabilities" | "folderCapabilities">,
  path: string,
): WorkspaceResourceCollectionCapabilities {
  return state.folderCapabilities[path] ?? state.collectionCapabilities;
}

function sameSummary(stored: ResourceSummary | undefined, incoming: ResourceSummary): boolean {
  if (!stored) return false;
  const keys = Object.keys(incoming) as (keyof ResourceSummary)[];
  return keys.length === Object.keys(stored).length && keys.every((key) => stored[key] === incoming[key]);
}

const folderLoads = new Map<string, Promise<void>>();
const folderRevisions = new Map<string, number>();
let catalogLoad: Promise<void> | null = null;
let searchRevision = 0;

function embeddedResourceRepresentations(representation: SirenEntity | null): Record<string, SirenEntity> {
  return Object.fromEntries(
    (representation?.entities ?? []).flatMap((entity) => {
      if (!("properties" in entity) || typeof entity.properties?.id !== "string") return [];
      return [[entity.properties.id, entity] as const];
    }),
  );
}

function catalogEntryFrom(resource: ResourceDetail): ResourceCatalogEntry {
  return {
    id: resource.id,
    slug: resource.slug,
    path: resource.path,
    name: resource.name,
    fullPath: resource.fullPath,
    kind: resource.kind,
    ...(resource.kind === "folder" && resource.color ? { color: resource.color } : {}),
  };
}

function relocatedPath(path: string, source: string, target: string): string {
  if (path === source) return target;
  return path.startsWith(`${source}/`) ? `${target}${path.slice(source.length)}` : path;
}

function resourceBefore(state: WorkspaceResourcesState, reference: string) {
  return (
    state.catalog.find((entry) => entry.id === reference || entry.slug === reference) ??
    Object.values(state.summaries).find((entry) => entry.id === reference || entry.slug === reference) ??
    Object.values(state.details).find((entry) => entry.id === reference || entry.slug === reference)
  );
}

/**
 * Canonical documentary authority for the Workspace. Council meeting consumers remain on resourcesStore
 * until their own resource projections are explicitly migrated; Workspace code must never read both stores.
 * Search entities carry no actions: a search result never replaces a loaded representation.
 */
export const useWorkspaceResourcesStore = create<WorkspaceResourcesState>((set, get) => {
  const adopt = (
    detail: ResourceDetail,
    representation: SirenEntity | null,
    before?: ResourceCatalogEntry | ResourceSummary | ResourceDetail,
  ) => {
    const summary = resourceSummarySchema.parse(detail);
    const catalogEntry = catalogEntryFrom(detail);
    const folderRelocated = before?.kind === "folder" && before.fullPath !== detail.fullPath;
    if (folderRelocated && before) {
      const affectedPaths = new Set([
        before.path,
        detail.path,
        ...get().loadedPaths.filter((path) => path === before.fullPath || path.startsWith(`${before.fullPath}/`)),
      ]);
      for (const path of affectedPaths) folderRevisions.set(path, (folderRevisions.get(path) ?? 0) + 1);
    }

    set((state) => {
      const catalog =
        folderRelocated && before
          ? state.catalog.map((entry) => {
              if (entry.id === detail.id) return catalogEntry;
              const path = relocatedPath(entry.path, before.fullPath, detail.fullPath);
              return path === entry.path
                ? entry
                : { ...entry, path, fullPath: path ? `${path}/${entry.name}` : entry.name };
            })
          : state.catalog.map((entry) => (entry.id === detail.id ? catalogEntry : entry));
      if (!catalog.some((entry) => entry.id === detail.id)) catalog.push(catalogEntry);

      const descendantIds = new Set(
        folderRelocated && before
          ? state.catalog
              .filter(
                (entry) =>
                  entry.id !== detail.id &&
                  (entry.path === before.fullPath || entry.path.startsWith(`${before.fullPath}/`)),
              )
              .map((entry) => entry.id)
          : [],
      );
      return {
        catalog,
        summaries: {
          ...Object.fromEntries(
            Object.entries(state.summaries).filter(([id]) => id !== detail.id && !descendantIds.has(id)),
          ),
          [detail.id]: summary,
        },
        details: {
          ...Object.fromEntries(
            Object.entries(state.details).filter(([id]) => id !== detail.id && !descendantIds.has(id)),
          ),
          [detail.id]: detail,
        },
        representations: {
          ...Object.fromEntries(
            Object.entries(state.representations).filter(([id]) => id !== detail.id && !descendantIds.has(id)),
          ),
          ...(representation ? { [detail.id]: representation } : {}),
        },
        loadedPaths:
          folderRelocated && before
            ? state.loadedPaths.filter((path) => path !== before.fullPath && !path.startsWith(`${before.fullPath}/`))
            : state.loadedPaths,
        searchResult: state.searchResult
          ? {
              ...state.searchResult,
              items: state.searchResult.items.filter((item) => item.id !== detail.id && !descendantIds.has(item.id)),
            }
          : null,
      };
    });
  };

  return {
    catalog: [],
    summaries: {},
    details: {},
    representations: {},
    collectionRepresentation: null,
    collectionCapabilities: {
      create: false,
      importSpreadsheet: false,
      createEditorAsset: false,
      uploadDocument: false,
      searchLegalReferences: false,
      createCouncilBusiness: false,
      importCouncilBusinessBundle: false,
    },
    folderRepresentations: {},
    folderCapabilities: {},
    personalWorkspacePath: null,
    // @implements-requirement HALL-FR-WSP-380
    async loadPersonalWorkspace() {
      try {
        const folder = await openPersonalWorkspace();
        set({ personalWorkspacePath: folder?.fullPath ?? null });
      } catch (error) {
        set({ error: apiErrorCode(error) });
      }
    },
    catalogLoading: false,
    loadedPaths: [],
    loadingPaths: [],
    searchResult: null,
    searchLoading: false,
    error: null,
    openErrors: {},
    async loadCatalog() {
      if (catalogLoad) return catalogLoad;
      const pending = (async () => {
        set({ catalogLoading: true, error: null });
        try {
          const result = await listDocumentaryResourceCatalog();
          const catalog = result.data;
          const representation = result.collectionRepresentation;
          const knownIds = new Set(catalog.map((entry) => entry.id));
          set((state) => ({
            catalog,
            summaries: Object.fromEntries(Object.entries(state.summaries).filter(([id]) => knownIds.has(id))),
            details: Object.fromEntries(Object.entries(state.details).filter(([id]) => knownIds.has(id))),
            representations: Object.fromEntries(
              Object.entries(state.representations).filter(([id]) => knownIds.has(id)),
            ),
            collectionRepresentation: representation,
            collectionCapabilities: collectionCapabilities(representation),
            catalogLoading: false,
          }));
        } catch (error) {
          set({ error: apiErrorCode(error), catalogLoading: false });
        }
      })().finally(() => {
        if (catalogLoad === pending) catalogLoad = null;
      });
      catalogLoad = pending;
      return pending;
    },
    async loadFolder(path, options) {
      if (!options?.force && get().loadedPaths.includes(path)) return;
      const inFlight = folderLoads.get(path);
      if (inFlight) return inFlight;
      const revision = folderRevisions.get(path) ?? 0;
      const pending = (async () => {
        set((state) => ({
          error: null,
          loadingPaths: state.loadingPaths.includes(path) ? state.loadingPaths : [...state.loadingPaths, path],
        }));
        try {
          const result = await listDocumentaryResourceFolder(path);
          if ((folderRevisions.get(path) ?? 0) !== revision) return;
          const resources = result.data;
          const representations = embeddedResourceRepresentations(result.representation);
          const directIds = new Set(resources.map((resource) => resource.id));
          set((state) => {
            const summaries = { ...state.summaries };
            for (const [id, summary] of Object.entries(summaries)) {
              if (summary.path === path && !directIds.has(id)) delete summaries[id];
            }
            for (const resource of resources) summaries[resource.id] = resource;
            return {
              summaries,
              representations: { ...state.representations, ...representations },
              ...(result.representation
                ? {
                    folderRepresentations: { ...state.folderRepresentations, [path]: result.representation },
                    folderCapabilities: {
                      ...state.folderCapabilities,
                      [path]: collectionCapabilities(result.representation),
                    },
                  }
                : {}),
              loadedPaths: state.loadedPaths.includes(path) ? state.loadedPaths : [...state.loadedPaths, path],
            };
          });
        } catch (error) {
          set({ error: apiErrorCode(error) });
        } finally {
          set((state) => ({ loadingPaths: state.loadingPaths.filter((candidate) => candidate !== path) }));
        }
      })().finally(() => folderLoads.delete(path));
      folderLoads.set(path, pending);
      return pending;
    },
    async open(reference) {
      set((state) => ({ openErrors: { ...state.openErrors, [reference]: null } }));
      try {
        const result = await openDocumentaryResource(reference);
        adopt(result.data, result.representation);
        return result;
      } catch (error) {
        set((state) => ({ openErrors: { ...state.openErrors, [reference]: apiErrorCode(error) } }));
        return null;
      }
    },
    async hydrate(criteria) {
      set({ error: null });
      try {
        if (!get().collectionRepresentation) await get().loadCatalog();
        const collectionRepresentation = get().collectionRepresentation;
        if (!collectionRepresentation) throw new SirenCapabilityUnavailable("resources");
        const result = await searchDocumentaryResources(collectionRepresentation, criteria);
        const representations = embeddedResourceRepresentations(result.representation);
        set((state) => ({
          summaries: {
            ...state.summaries,
            ...Object.fromEntries(result.data.items.map((item) => [item.id, item])),
          },
          representations: { ...representations, ...state.representations },
        }));
        return result.data;
      } catch (error) {
        set({ error: apiErrorCode(error) });
        return null;
      }
    },
    async search(criteria) {
      const revision = ++searchRevision;
      set({ error: null, searchLoading: true, searchResult: null });
      try {
        if (!get().collectionRepresentation) await get().loadCatalog();
        const collectionRepresentation = get().collectionRepresentation;
        if (!collectionRepresentation) throw new SirenCapabilityUnavailable("resources");
        const result = await searchDocumentaryResources(collectionRepresentation, criteria);
        if (revision !== searchRevision) return null;
        const representations = embeddedResourceRepresentations(result.representation);
        set((state) => ({
          searchResult: result.data,
          searchLoading: false,
          summaries: {
            ...state.summaries,
            ...Object.fromEntries(result.data.items.map((item) => [item.id, item])),
          },
          representations: { ...representations, ...state.representations },
        }));
        return result.data;
      } catch (error) {
        if (revision === searchRevision) set({ error: apiErrorCode(error), searchLoading: false });
        return null;
      }
    },
    clearSearch() {
      searchRevision += 1;
      set({ searchResult: null, searchLoading: false });
    },
    async create(input, source) {
      set({ error: null });
      try {
        const representation = get().folderRepresentations[input.path] ?? get().collectionRepresentation;
        if (!representation) throw new SirenCapabilityUnavailable("resources");
        const result = await createDocumentaryResource(source ?? representation, input);
        adopt(result.data, result.representation);
        return result.data;
      } catch (error) {
        set({ error: apiErrorCode(error) });
        return null;
      }
    },
    async importSpreadsheet(form, source) {
      set({ error: null });
      try {
        const representation = get().folderRepresentations[formPath(form)] ?? get().collectionRepresentation;
        if (!representation) throw new SirenCapabilityUnavailable("resources");
        const result = await importDocumentarySpreadsheet(source ?? representation, form);
        adopt(result.data, result.representation);
        return result.data;
      } catch (error) {
        set({ error: apiErrorCode(error) });
        return null;
      }
    },
    async uploadDocument(form, source) {
      set({ error: null });
      try {
        const representation = get().folderRepresentations[formPath(form)] ?? get().collectionRepresentation;
        if (!representation) throw new SirenCapabilityUnavailable("resources");
        const result = await uploadDocumentaryResource(source ?? representation, form);
        adopt(result.data, result.representation);
        return result.data;
      } catch (error) {
        set({ error: apiErrorCode(error) });
        return null;
      }
    },
    async createEditorAsset(form) {
      set({ error: null });
      try {
        const representation = get().collectionRepresentation;
        if (!representation) throw new SirenCapabilityUnavailable("resources");
        return (await createDocumentaryEditorAsset(representation, form)).data;
      } catch (error) {
        set({ error: apiErrorCode(error) });
        return null;
      }
    },
    async searchLegalReferences(input) {
      set({ error: null });
      try {
        const representation = get().collectionRepresentation;
        if (!representation) throw new SirenCapabilityUnavailable("resources");
        return (await searchDocumentaryLegalReferences(representation, input)).data;
      } catch (error) {
        set({ error: apiErrorCode(error) });
        return [];
      }
    },
    async resolveLegalReference(reference, input) {
      set({ error: null });
      try {
        const before = resourceBefore(get(), reference);
        const representation = before ? get().representations[before.id] : undefined;
        if (!representation) throw new SirenCapabilityUnavailable("resource.resolve-legal-reference");
        const result = await resolveDocumentaryLegalReference(representation, input);
        adopt(result.data, result.representation, before);
        return result.data;
      } catch (error) {
        set({ error: apiErrorCode(error) });
        return null;
      }
    },
    async refreshLegalReference(reference, expectedSnapshotHash) {
      set({ error: null });
      try {
        const before = resourceBefore(get(), reference);
        const representation = before ? get().representations[before.id] : undefined;
        if (!representation) throw new SirenCapabilityUnavailable("resource.refresh-legal-reference");
        const result = await refreshDocumentaryLegalReference(representation, expectedSnapshotHash);
        adopt(result.data, result.representation, before);
        return result.data;
      } catch (error) {
        set({ error: apiErrorCode(error) });
        return null;
      }
    },
    async updateMetadata(reference, input) {
      const before = resourceBefore(get(), reference);
      set({ error: null });
      try {
        const representation = before ? get().representations[before.id] : undefined;
        if (!representation) throw new SirenCapabilityUnavailable("resource.update-metadata");
        const result = await updateDocumentaryResourceMetadata(representation, input);
        adopt(result.data, result.representation, before);
        return result.data;
      } catch (error) {
        set({ error: apiErrorCode(error) });
        return null;
      }
    },
    async updateContent(reference, input) {
      set({ error: null });
      try {
        const before = resourceBefore(get(), reference);
        const representation = before ? get().representations[before.id] : undefined;
        if (!representation) throw new SirenCapabilityUnavailable("resource.update-content");
        const result = await updateDocumentaryResourceContent(representation, input);
        adopt(result.data, result.representation, before);
        return result.data;
      } catch (error) {
        set({ error: apiErrorCode(error) });
        return null;
      }
    },
    async relocate(reference, input) {
      const before = resourceBefore(get(), reference);
      set({ error: null });
      try {
        const representation = before ? get().representations[before.id] : undefined;
        if (!representation) throw new SirenCapabilityUnavailable("resource.relocate");
        const result = await relocateDocumentaryResource(representation, input);
        adopt(result.data, result.representation, before);
        return result.data;
      } catch (error) {
        set({ error: apiErrorCode(error) });
        return null;
      }
    },
    async remove(reference) {
      const before = resourceBefore(get(), reference);
      set({ error: null });
      const representation = before ? get().representations[before.id] : undefined;
      if (!representation) throw new SirenCapabilityUnavailable("resource.delete");
      await deleteDocumentaryResource(representation);
      const removedIds = new Set([
        before?.id ?? reference,
        ...(before?.kind === "folder"
          ? get()
              .catalog.filter((entry) => entry.path === before.fullPath || entry.path.startsWith(`${before.fullPath}/`))
              .map((entry) => entry.id)
          : []),
      ]);
      if (before?.kind === "folder") {
        for (const path of get().loadedPaths.filter(
          (path) => path === before.fullPath || path.startsWith(`${before.fullPath}/`),
        )) {
          folderRevisions.set(path, (folderRevisions.get(path) ?? 0) + 1);
        }
      }
      set((state) => ({
        catalog: state.catalog.filter((entry) => !removedIds.has(entry.id)),
        summaries: Object.fromEntries(Object.entries(state.summaries).filter(([id]) => !removedIds.has(id))),
        details: Object.fromEntries(Object.entries(state.details).filter(([id]) => !removedIds.has(id))),
        representations: Object.fromEntries(
          Object.entries(state.representations).filter(([id]) => !removedIds.has(id)),
        ),
        loadedPaths:
          before?.kind === "folder"
            ? state.loadedPaths.filter((path) => path !== before.fullPath && !path.startsWith(`${before.fullPath}/`))
            : state.loadedPaths,
        searchResult: state.searchResult
          ? {
              ...state.searchResult,
              items: state.searchResult.items.filter((item) => !removedIds.has(item.id)),
            }
          : null,
      }));
      return true;
    },
    adoptSearchRepresentations(representation) {
      const found = embeddedResourceRepresentations(representation);
      set((state) => ({
        representations: { ...found, ...state.representations },
      }));
    },
    adoptSummaries(summaries) {
      const current = get().summaries;
      if (summaries.every((summary) => sameSummary(current[summary.id], summary))) return;
      set((state) => ({
        summaries: { ...state.summaries, ...Object.fromEntries(summaries.map((summary) => [summary.id, summary])) },
      }));
    },
    invalidate({ ids = [], paths = [] }) {
      const invalidIds = new Set(ids);
      const invalidPaths = new Set(paths);
      for (const path of invalidPaths) folderRevisions.set(path, (folderRevisions.get(path) ?? 0) + 1);
      set((state) => ({
        catalog: state.catalog.filter((entry) => !invalidIds.has(entry.id)),
        summaries: Object.fromEntries(
          Object.entries(state.summaries).filter(
            ([id, summary]) => !invalidIds.has(id) && !invalidPaths.has(summary.path),
          ),
        ),
        details: Object.fromEntries(
          Object.entries(state.details).filter(([id, detail]) => !invalidIds.has(id) && !invalidPaths.has(detail.path)),
        ),
        representations: Object.fromEntries(
          Object.entries(state.representations).filter(
            ([id]) =>
              !invalidIds.has(id) && !invalidPaths.has(state.summaries[id]?.path ?? state.details[id]?.path ?? ""),
          ),
        ),
        loadedPaths: state.loadedPaths.filter((path) => !invalidPaths.has(path)),
        searchResult: state.searchResult
          ? {
              ...state.searchResult,
              items: state.searchResult.items.filter(
                (item) => !invalidIds.has(item.id) && !invalidPaths.has(item.path),
              ),
            }
          : null,
      }));
    },
  };
});
