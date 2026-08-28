import { findSirenAction } from "@hall/api-contract";
import type { CouncilMember } from "@hall/domain";
import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode, sirenRepresentation } from "../services/apiClient";
import { createCouncilMember, listCouncilMembers } from "../services/councilMembersApi";

interface CouncilMembersState {
  members: CouncilMember[];
  loading: boolean;
  error: ApiErrorCode | null;
  canCreate: boolean;
  load(): Promise<void>;
  create(input: Record<string, unknown>): Promise<boolean>;
}

export const useCouncilMembersStore = create<CouncilMembersState>((set, get) => ({
  members: [],
  loading: false,
  error: null,
  canCreate: false,
  async load() {
    set({ loading: true, error: null });
    try {
      const members = await listCouncilMembers();
      const representation = await sirenRepresentation("/council-members");
      set({ members, canCreate: Boolean(findSirenAction(representation, "member.create")), loading: false });
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
