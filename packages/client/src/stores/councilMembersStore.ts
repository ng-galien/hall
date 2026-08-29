import { findSirenAction } from "@hall/api-contract";
import type { CouncilMember } from "@hall/domain";
import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import {
  createCouncilMember,
  getCouncilMemberSiren,
  listCouncilMembersSiren,
  updateCouncilMember,
} from "../services/councilMembersApi";

interface CouncilMembersState {
  members: CouncilMember[];
  loading: boolean;
  error: ApiErrorCode | null;
  canCreate: boolean;
  canUpdate: Record<string, boolean>;
  clearError(): void;
  load(): Promise<void>;
  loadDetail(reference: string): Promise<CouncilMember | null>;
  create(input: Record<string, unknown>): Promise<boolean>;
  update(reference: string, input: Record<string, unknown>): Promise<boolean>;
}

export const useCouncilMembersStore = create<CouncilMembersState>((set, get) => ({
  members: [],
  loading: false,
  error: null,
  canCreate: false,
  canUpdate: {},
  clearError() {
    set({ error: null });
  },
  async load() {
    set({ loading: true, error: null });
    try {
      const result = await listCouncilMembersSiren();
      const canUpdate = Object.fromEntries(
        (result.representation?.entities ?? []).flatMap((entity) => {
          if (!("properties" in entity) || !findSirenAction(entity, "member.update")) return [];
          const memberId = entity.properties?.id;
          return typeof memberId === "string" ? [[memberId, true]] : [];
        }),
      );
      set({
        members: result.data,
        canCreate: Boolean(result.representation && findSirenAction(result.representation, "member.create")),
        canUpdate,
        loading: false,
      });
    } catch (error) {
      set({ error: apiErrorCode(error), loading: false });
    }
  },
  async loadDetail(reference) {
    try {
      const result = await getCouncilMemberSiren(reference);
      set((state) => ({
        members: state.members.some((member) => member.id === result.data.id)
          ? state.members.map((member) => (member.id === result.data.id ? result.data : member))
          : [...state.members, result.data],
        canUpdate: {
          ...state.canUpdate,
          [result.data.id]: Boolean(result.representation && findSirenAction(result.representation, "member.update")),
        },
      }));
      return result.data;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return null;
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
  async update(reference, input) {
    set({ error: null });
    try {
      const updated = await updateCouncilMember(reference, input);
      set((state) => ({
        members: state.members.map((member) => (member.id === updated.id ? updated : member)),
      }));
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
}));
