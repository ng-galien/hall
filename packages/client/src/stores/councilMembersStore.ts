import type { CouncilMember } from "@mairie/domain";
import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import { createCouncilMember, listCouncilMembers } from "../services/councilMembersApi";

interface CouncilMembersState {
  members: CouncilMember[];
  loading: boolean;
  error: ApiErrorCode | null;
  load(): Promise<void>;
  create(input: Record<string, unknown>): Promise<boolean>;
}

export const useCouncilMembersStore = create<CouncilMembersState>((set, get) => ({
  members: [],
  loading: false,
  error: null,
  async load() {
    set({ loading: true, error: null });
    try {
      set({ members: await listCouncilMembers(), loading: false });
    } catch (error) {
      set({ error: apiErrorCode(error), loading: false });
    }
  },
  async create(input) {
    set({ error: null });
    try {
      await createCouncilMember(input);
      await get().load();
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
}));
