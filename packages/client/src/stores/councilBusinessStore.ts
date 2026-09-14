import {
  type CreateCouncilBusiness,
  type CreatePreparedCouncilSubject,
  findSirenAction,
  type PreparedCouncilSubject,
  type SirenEmbeddedEntity,
  type SirenEntity,
} from "@hall/api-contract";
import { create } from "zustand";
import { type CouncilBusinessView, councilBusinessView, councilBusinessViews } from "../models/councilBusiness";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import {
  associateCouncilBusinessResource,
  createCouncilBusiness,
  createPreparedCouncilSubject,
  dissociateCouncilBusinessResource,
  listCouncilBusinesses,
  listCouncilBusinessResourceItems,
  listPreparedCouncilSubjects,
  openPreparedCouncilSubject,
  openCouncilBusiness,
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
  load(): Promise<void>;
  refresh(id: string): Promise<CouncilBusinessView | null>;
  loadResources(id: string): Promise<boolean>;
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
    listCouncilBusinessResourceItems([business.id]),
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
          ? [...state.preparedSubjects.filter((subject) => subject.councilBusinessId !== businessId), ...preparedSubjects]
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
      preparedSubjects: state.preparedSubjects.map((candidate) => candidate.id === subject.id && candidate.kind === subject.kind ? result.data : candidate),
      preparedSubjectRepresentations: { ...state.preparedSubjectRepresentations, [`${subject.kind}:${subject.id}`]: result.representation as SirenEntity },
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
  async load() {
    set({ loading: true, error: null });
    try {
      const result = await listCouncilBusinesses();
      const resourceItems = await listCouncilBusinessResourceItems(result.data.map(({ id }) => id));
      set({
        businesses: councilBusinessViews(result.data, resourceItems),
        capabilitiesById: {},
        canImportBundle: Boolean(
          result.representation && findSirenAction(result.representation, "council-business.import-bundle"),
        ),
        canCreate: Boolean(result.representation && findSirenAction(result.representation, "council-business.create")),
        loading: false,
      });
    } catch (error) {
      set({ error: apiErrorCode(error), loading: false });
    }
  },
  async refresh(id) {
    set({ error: null });
    try {
      const refreshed = await hydrateCouncilBusiness(id);
      set((state) => ({
        businesses: state.businesses.map((business) => (business.id === id ? refreshed.view : business)),
        capabilitiesById: {
          ...state.capabilitiesById,
          [id]: capabilities(refreshed.representation),
        },
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
  async loadResources(id) {
    set({ error: null });
    try {
      const [opened, resourceItems] = await Promise.all([
        openCouncilBusiness(id),
        listCouncilBusinessResourceItems([id]),
      ]);
      set((state) => ({
        businesses: state.businesses.map((business) =>
          business.id === id ? councilBusinessView(business, resourceItems) : business,
        ),
        capabilitiesById: {
          ...state.capabilitiesById,
          [id]: capabilities(opened.representation),
        },
        representationsById: opened.representation
          ? { ...state.representationsById, [id]: opened.representation }
          : state.representationsById,
      }));
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
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
