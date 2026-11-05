import {
  type CreateCouncilBusiness,
  type CreatePreparedCouncilSubject,
  findSirenAction,
  type PreparedCouncilSubject,
  type ResourceDetail,
  type SirenEmbeddedEntity,
  type SirenEntity,
} from "@hall/api-contract";
import { create } from "zustand";
import { type CouncilBusinessView, councilBusinessView } from "../models/councilBusiness";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import {
  associateCouncilBusinessResource,
  createCouncilBusiness,
  createPreparedCouncilSubject,
  dissociateCouncilBusinessResource,
  listCouncilBusinesses,
  listCouncilBusinessResourceItems,
  listPreparedCouncilSubjects,
  openCouncilBusiness,
  openPreparedCouncilSubject,
  reorderCouncilBusinessResources,
} from "../services/councilBusinessApi";
import { useWorkspaceResourcesStore } from "./workspaceResourcesStore";

interface CouncilBusinessCapabilities {
  delete: boolean;
  exportBundle: boolean;
  createResource: boolean;
  uploadDocument: boolean;
  importSpreadsheet: boolean;
  createPreparedSubject: boolean;
  associateResource: boolean;
  dissociateResource: boolean;
  reorderResources: boolean;
}

interface CouncilBusinessStoreState {
  representationsById: Record<string, SirenEntity>;
  preparedSubjects: PreparedCouncilSubject[];
  preparedSubjectRepresentations: Record<string, SirenEntity>;
  loadPreparedSubjects(businessId?: string): Promise<void>;
  refreshPreparedSubject(subject: PreparedCouncilSubject): Promise<void>;
  createPreparedSubject(id: string, input: CreatePreparedCouncilSubject): Promise<PreparedCouncilSubject | null>;
  businesses: CouncilBusinessView[];
  loading: boolean;
  error: ApiErrorCode | null;
  canImportBundle: boolean;
  canCreate: boolean;
  capabilitiesById: Record<string, CouncilBusinessCapabilities>;
  resourceItemsLoadedById: Record<string, boolean>;
  resourceItemsErrorById: Record<string, ApiErrorCode | null>;
  load(): Promise<void>;
  /** Rereads every business after another session or the MCP changed them; the selected one is hydrated again. */
  reloadAfterExternalChange(selectedId: string | null): Promise<void>;
  loadSelected(id: string): Promise<CouncilBusinessView | null>;
  adoptReport(id: string, report: Extract<ResourceDetail, { kind: "text" }>): void;
  refresh(id: string): Promise<CouncilBusinessView | null>;
  loadResources(id: string): Promise<boolean>;
  /** Loads, in one request, the documents of the listed businesses that are not loaded yet. */
  loadResourceItems(ids: readonly string[]): Promise<void>;
  associateResource(id: string, resourceId: string): Promise<boolean>;
  dissociateResource(id: string, resourceId: string): Promise<boolean>;
  reorderResources(id: string, resourceIds: string[]): Promise<boolean>;
  create(input: CreateCouncilBusiness): Promise<CouncilBusinessView | null>;
}

function capabilities(representation: SirenEntity | null): CouncilBusinessCapabilities {
  if (!representation) {
    return {
      delete: false,
      exportBundle: false,
      createResource: false,
      uploadDocument: false,
      importSpreadsheet: false,
      createPreparedSubject: false,
      associateResource: false,
      dissociateResource: false,
      reorderResources: false,
    };
  }
  return {
    delete: Boolean(findSirenAction(representation, "council-business.delete")),
    exportBundle: Boolean(findSirenAction(representation, "council-business.export-bundle")),
    createResource: Boolean(findSirenAction(representation, "resource.create")),
    uploadDocument: Boolean(findSirenAction(representation, "resource.create-document")),
    importSpreadsheet: Boolean(findSirenAction(representation, "resource.import-spreadsheet")),
    createPreparedSubject: Boolean(findSirenAction(representation, "council-business.create-prepared-subject")),
    associateResource: Boolean(findSirenAction(representation, "council-business.associate-resource")),
    dissociateResource: Boolean(findSirenAction(representation, "council-business.dissociate-resource")),
    reorderResources: Boolean(findSirenAction(representation, "council-business.reorder-resources")),
  };
}

// @implements-requirement HALL-FR-WSP-370
/** A business's documents carry the summaries its report references need: adopt them without the catalog. */
async function loadBusinessResourceItems(ids: readonly string[]) {
  const items = await listCouncilBusinessResourceItems(ids);
  useWorkspaceResourcesStore
    .getState()
    .adoptSummaries(items.map(({ councilBusinessId: _business, position: _position, ...summary }) => summary));
  return items;
}

async function hydrateCouncilBusiness(id: string): Promise<{
  view: CouncilBusinessView;
  representation: SirenEntity | null;
}> {
  const opened = await openCouncilBusiness(id);
  const business = opened.data;
  const resources = useWorkspaceResourcesStore.getState();
  const [folder, report, resourceItems] = await Promise.all([
    resources.open(business.folderResourceId),
    resources.open(business.reportResourceId),
    loadBusinessResourceItems([business.id]),
  ]);
  if (!folder || !report) throw new Error("CouncilBusiness documentary resources are unavailable");
  if (folder.data.kind !== "folder") throw new Error("CouncilBusiness folder resource is invalid");
  if (report.data.kind !== "text") throw new Error("CouncilBusiness report resource is invalid");
  return {
    view: councilBusinessView(
      {
        ...business,
        title: folder.data.name,
        folderPath: folder.data.path,
        report: report.data.content,
        createdAt: folder.data.createdAt,
        updatedAt: folder.data.updatedAt > report.data.updatedAt ? folder.data.updatedAt : report.data.updatedAt,
      },
      resourceItems,
    ),
    representation: opened.representation,
  };
}

const pendingSelectedLoads = new Map<string, Promise<CouncilBusinessView | null>>();

export const useCouncilBusinessStore = create<CouncilBusinessStoreState>((set, get) => ({
  representationsById: {},
  preparedSubjects: [],
  preparedSubjectRepresentations: {},
  async loadPreparedSubjects(businessId) {
    try {
      const result = await listPreparedCouncilSubjects(undefined, businessId);
      const preparedSubjects = result.data;
      const representations = Object.fromEntries(
        (result.representation?.entities ?? [])
          .filter((entity): entity is SirenEmbeddedEntity => "properties" in entity)
          .map((entity) => {
            const subject = entity.properties as PreparedCouncilSubject;
            return [`${subject.kind}:${subject.id}`, entity];
          }),
      );
      set((state) => ({
        preparedSubjects: businessId
          ? [
              ...state.preparedSubjects.filter((subject) => subject.councilBusinessId !== businessId),
              ...preparedSubjects,
            ]
          : preparedSubjects,
        preparedSubjectRepresentations: businessId
          ? { ...state.preparedSubjectRepresentations, ...representations }
          : representations,
      }));
    } catch (error) {
      set({ error: apiErrorCode(error) });
    }
  },
  async refreshPreparedSubject(subject) {
    const result = await openPreparedCouncilSubject(subject.kind, subject.id);
    if (!result.representation) throw new Error("Prepared subject representation is unavailable");
    set((state) => ({
      preparedSubjects: state.preparedSubjects.map((candidate) =>
        candidate.id === subject.id && candidate.kind === subject.kind ? result.data : candidate,
      ),
      preparedSubjectRepresentations: {
        ...state.preparedSubjectRepresentations,
        [`${subject.kind}:${subject.id}`]: result.representation as SirenEntity,
      },
    }));
  },
  async createPreparedSubject(id, input) {
    set({ error: null });
    try {
      const subject = await createPreparedCouncilSubject(id, input);
      await get().loadPreparedSubjects(id);
      return subject;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return null;
    }
  },
  businesses: [],
  loading: false,
  error: null,
  canImportBundle: false,
  canCreate: false,
  capabilitiesById: {},
  resourceItemsLoadedById: {},
  resourceItemsErrorById: {},
  async load() {
    set({ loading: true, error: null });
    try {
      const result = await listCouncilBusinesses();
      set((state) => ({
        businesses: result.data.map((business) => {
          const current = state.businesses.find((entry) => entry.id === business.id);
          if (current && business.id in state.capabilitiesById) return current;
          return {
            ...business,
            resources: current && state.resourceItemsLoadedById[business.id] ? current.resources : [],
          };
        }),
        canImportBundle: Boolean(
          result.representation && findSirenAction(result.representation, "council-business.import-bundle"),
        ),
        canCreate: Boolean(result.representation && findSirenAction(result.representation, "council-business.create")),
        loading: false,
      }));
    } catch (error) {
      set({ error: apiErrorCode(error), loading: false });
    }
  },
  async reloadAfterExternalChange(selectedId) {
    let result: Awaited<ReturnType<typeof listCouncilBusinesses>>;
    try {
      result = await listCouncilBusinesses();
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return;
    }
    set((state) => ({
      businesses: result.data.map((business) => {
        const current = state.businesses.find((entry) => entry.id === business.id);
        return current ? { ...current, ...business, resources: current.resources } : { ...business, resources: [] };
      }),
      canImportBundle: Boolean(
        result.representation && findSirenAction(result.representation, "council-business.import-bundle"),
      ),
      canCreate: Boolean(result.representation && findSirenAction(result.representation, "council-business.create")),
      capabilitiesById: {},
      representationsById: {},
      resourceItemsLoadedById: {},
      resourceItemsErrorById: {},
    }));
    await get().loadPreparedSubjects();
    if (selectedId && result.data.some((business) => business.id === selectedId)) await get().refresh(selectedId);
  },
  async loadSelected(id) {
    const existing = pendingSelectedLoads.get(id);
    if (existing) return existing;
    const pending = (async () => {
      set({ error: null });
      try {
        const opened = await openCouncilBusiness(id);
        const business = opened.data;
        const resources = useWorkspaceResourcesStore.getState();
        const folder = await resources.open(business.folderResourceId);
        if (folder?.data.kind !== "folder") throw new Error("CouncilBusiness folder resource is unavailable");
        const current = get().businesses.find((entry) => entry.id === id);
        const view: CouncilBusinessView = {
          ...business,
          title: folder.data.name,
          folderPath: folder.data.path,
          report: current?.reportResourceId === business.reportResourceId ? current.report : "",
          createdAt: folder.data.createdAt,
          updatedAt: current && current.updatedAt > folder.data.updatedAt ? current.updatedAt : folder.data.updatedAt,
          resources: current && get().resourceItemsLoadedById[id] ? current.resources : [],
        };
        set((state) => ({
          businesses: state.businesses.some((entry) => entry.id === id)
            ? state.businesses.map((entry) => (entry.id === id ? view : entry))
            : [...state.businesses, view],
          capabilitiesById: { ...state.capabilitiesById, [id]: capabilities(opened.representation) },
          representationsById: opened.representation
            ? { ...state.representationsById, [id]: opened.representation }
            : state.representationsById,
        }));
        if (!get().resourceItemsLoadedById[id]) void get().loadResources(id);
        return view;
      } catch (error) {
        set({ error: apiErrorCode(error) });
        return null;
      }
    })();
    pendingSelectedLoads.set(id, pending);
    return pending.finally(() => {
      if (pendingSelectedLoads.get(id) === pending) pendingSelectedLoads.delete(id);
    });
  },
  adoptReport(id, report) {
    set((state) => ({
      businesses: state.businesses.map((business) =>
        business.id === id && business.reportResourceId === report.id
          ? {
              ...business,
              report: report.content,
              updatedAt: business.updatedAt > report.updatedAt ? business.updatedAt : report.updatedAt,
            }
          : business,
      ),
    }));
  },
  async refresh(id) {
    set({ error: null });
    try {
      const refreshed = await hydrateCouncilBusiness(id);
      set((state) => ({
        businesses: state.businesses.some((business) => business.id === id)
          ? state.businesses.map((business) => (business.id === id ? refreshed.view : business))
          : [...state.businesses, refreshed.view],
        capabilitiesById: {
          ...state.capabilitiesById,
          [id]: capabilities(refreshed.representation),
        },
        resourceItemsLoadedById: { ...state.resourceItemsLoadedById, [id]: true },
        resourceItemsErrorById: { ...state.resourceItemsErrorById, [id]: null },
        representationsById: refreshed.representation
          ? { ...state.representationsById, [id]: refreshed.representation }
          : state.representationsById,
      }));
      return refreshed.view;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return null;
    }
  },
  // @implements-requirement HALL-FR-WSP-370
  async loadResourceItems(ids) {
    const missing = [...new Set(ids)].filter((id) => !get().resourceItemsLoadedById[id]);
    if (missing.length === 0) return;
    try {
      const resourceItems = await loadBusinessResourceItems(missing);
      set((state) => ({
        businesses: state.businesses.map((business) =>
          missing.includes(business.id) && !state.resourceItemsLoadedById[business.id]
            ? councilBusinessView(business, resourceItems)
            : business,
        ),
        resourceItemsLoadedById: {
          ...state.resourceItemsLoadedById,
          ...Object.fromEntries(missing.map((id) => [id, true])),
        },
      }));
    } catch (error) {
      set({ error: apiErrorCode(error) });
    }
  },
  async loadResources(id) {
    set((state) => ({ error: null, resourceItemsErrorById: { ...state.resourceItemsErrorById, [id]: null } }));
    try {
      const [representation, resourceItems] = await Promise.all([
        id in get().capabilitiesById
          ? Promise.resolve(get().representationsById[id] ?? null)
          : openCouncilBusiness(id).then((opened) => opened.representation),
        loadBusinessResourceItems([id]),
      ]);
      set((state) => ({
        businesses: state.businesses.map((business) =>
          business.id === id ? councilBusinessView(business, resourceItems) : business,
        ),
        capabilitiesById: {
          ...state.capabilitiesById,
          [id]: capabilities(representation),
        },
        resourceItemsLoadedById: { ...state.resourceItemsLoadedById, [id]: true },
        resourceItemsErrorById: { ...state.resourceItemsErrorById, [id]: null },
        representationsById: representation
          ? { ...state.representationsById, [id]: representation }
          : state.representationsById,
      }));
      return true;
    } catch (error) {
      set((state) => ({
        error: apiErrorCode(error),
        resourceItemsErrorById: { ...state.resourceItemsErrorById, [id]: apiErrorCode(error) },
      }));
      return false;
    }
  },
  async associateResource(id, resourceId) {
    set({ error: null });
    try {
      await associateCouncilBusinessResource(id, { resourceId });
      return await get().loadResources(id);
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
  async dissociateResource(id, resourceId) {
    set({ error: null });
    try {
      await dissociateCouncilBusinessResource(id, { resourceId });
      return await get().loadResources(id);
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
  async reorderResources(id, resourceIds) {
    set({ error: null });
    try {
      await reorderCouncilBusinessResources(id, { resourceIds });
      return await get().loadResources(id);
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
  async create(input) {
    set({ error: null });
    try {
      const created = await createCouncilBusiness(input);
      await useWorkspaceResourcesStore.getState().loadCatalog();
      await get().load();
      return get().businesses.find((business) => business.id === created.data.id) ?? null;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return null;
    }
  },
}));
