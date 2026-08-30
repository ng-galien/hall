import { findSirenAction } from "@hall/api-contract";
import type { CouncilBusiness, FolderRenameResult } from "@hall/domain";
import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode, sirenRepresentation } from "../services/apiClient";
import {
  createCouncilBusiness,
  getCouncilBusinessDetailsSiren,
  listCouncilBusinesses,
  updateCouncilBusiness,
} from "../services/councilBusinessApi";

interface CouncilBusinessStoreState {
  businesses: CouncilBusiness[];
  loading: boolean;
  error: ApiErrorCode | null;
  canCreate: boolean;
  updatableIds: string[];
  renamableIds: string[];
  schedulableIds: string[];
  load(): Promise<void>;
  create(input: Record<string, unknown>): Promise<CouncilBusiness | null>;
  update(businessId: string, input: Record<string, unknown>): Promise<boolean>;
  applyFolderRename(result: FolderRenameResult): void;
}

export const useCouncilBusinessStore = create<CouncilBusinessStoreState>((set, get) => ({
  businesses: [],
  loading: false,
  error: null,
  canCreate: false,
  updatableIds: [],
  renamableIds: [],
  schedulableIds: [],
  async load() {
    set({ loading: true, error: null });
    try {
      const businesses = await listCouncilBusinesses();
      const representation = await sirenRepresentation("/council-business");
      const capabilities = await Promise.all(
        businesses.map(async (business) => ({
          id: business.id,
          representation: (await getCouncilBusinessDetailsSiren(business.id)).representation,
        })),
      );
      const updatableIds = capabilities.flatMap(({ id, representation: details }) =>
        details && findSirenAction(details, "council-business.reclassify") ? [id] : [],
      );
      const renamableIds = capabilities.flatMap(({ id, representation: details }) =>
        details && findSirenAction(details, "council-business.update") ? [id] : [],
      );
      const schedulableIds = capabilities.flatMap(({ id, representation: details }) =>
        details && findSirenAction(details, "council-business.schedule") ? [id] : [],
      );
      set({
        businesses,
        canCreate: Boolean(findSirenAction(representation, "council-business.create")),
        updatableIds,
        renamableIds,
        schedulableIds,
        loading: false,
      });
    } catch (error) {
      set({ error: apiErrorCode(error), loading: false });
    }
  },
  async create(input) {
    set({ error: null });
    try {
      const business = await createCouncilBusiness(input);
      await get().load();
      return business;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return null;
    }
  },
  async update(businessId, input) {
    set({ error: null });
    try {
      await updateCouncilBusiness(businessId, input);
      await get().load();
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
  applyFolderRename(result) {
    const prefix = `${result.sourcePath}/`;
    set((state) => ({
      businesses: state.businesses.map((business) => {
        if (business.folderPath !== result.sourcePath && !business.folderPath.startsWith(prefix)) return business;
        return {
          ...business,
          folderPath: `${result.targetPath}${business.folderPath.slice(result.sourcePath.length)}`,
          updatedAt: result.updatedAt,
        };
      }),
    }));
  },
}));
