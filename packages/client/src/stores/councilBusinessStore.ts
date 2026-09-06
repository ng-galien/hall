import { type CreateCouncilBusiness, findSirenAction, type SirenEntity } from "@hall/api-contract";
import { create } from "zustand";
import { type CouncilBusinessView, councilBusinessView } from "../models/councilBusiness";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import {
  associateCouncilBusinessResource,
  createCouncilBusiness,
  dissociateCouncilBusinessResource,
  listCouncilBusinesses,
  listCouncilBusinessResourceItems,
  openCouncilBusiness,
  reorderCouncilBusinessResources,
  scheduleCouncilBusinessSubject,
} from "../services/councilBusinessApi";
import { useWorkspaceResourcesStore } from "./workspaceResourcesStore";

interface CouncilBusinessCapabilities {
  associateResource: boolean;
  dissociateResource: boolean;
  reorderResources: boolean;
  scheduleDecisionProposal: boolean;
  scheduleOpenQuestion: boolean;
}

interface CouncilBusinessStoreState {
  businesses: CouncilBusinessView[];
  loading: boolean;
  error: ApiErrorCode | null;
  canCreate: boolean;
  capabilitiesById: Record<string, CouncilBusinessCapabilities>;
  load(): Promise<void>;
  refresh(id: string): Promise<CouncilBusinessView | null>;
  loadResources(id: string): Promise<boolean>;
  associateResource(id: string, resourceId: string): Promise<boolean>;
  dissociateResource(id: string, resourceId: string): Promise<boolean>;
  reorderResources(id: string, resourceIds: string[]): Promise<boolean>;
  schedule(
    id: string,
    kind: "councilDecisionProposal" | "openQuestion",
    councilMeetingId: string,
    position: number,
  ): Promise<boolean>;
  create(input: CreateCouncilBusiness): Promise<CouncilBusinessView | null>;
}

function capabilities(representation: SirenEntity | null): CouncilBusinessCapabilities {
  if (!representation) {
    return {
      associateResource: false,
      dissociateResource: false,
      reorderResources: false,
      scheduleDecisionProposal: false,
      scheduleOpenQuestion: false,
    };
  }
  return {
    associateResource: Boolean(findSirenAction(representation, "council-business.associate-resource")),
    dissociateResource: Boolean(findSirenAction(representation, "council-business.dissociate-resource")),
    reorderResources: Boolean(findSirenAction(representation, "council-business.reorder-resources")),
    scheduleDecisionProposal: Boolean(findSirenAction(representation, "council-business.schedule-decision-proposal")),
    scheduleOpenQuestion: Boolean(findSirenAction(representation, "council-business.schedule-open-question")),
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
  businesses: [],
  loading: false,
  error: null,
  canCreate: false,
  capabilitiesById: {},
  async load() {
    set({ loading: true, error: null });
    try {
      const result = await listCouncilBusinesses();
      const resourceItems = await listCouncilBusinessResourceItems(result.data.map(({ id }) => id));
      set({
        businesses: result.data.map((business) => councilBusinessView(business, resourceItems)),
        capabilitiesById: {},
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
  async schedule(id, kind, councilMeetingId, position) {
    set({ error: null });
    try {
      await scheduleCouncilBusinessSubject(id, kind, { councilMeetingId, position });
      return true;
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
