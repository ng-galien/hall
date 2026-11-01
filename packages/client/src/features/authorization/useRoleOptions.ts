import type { AuthorizationRoleOption } from "@hall/api-contract";
import { useEffect } from "react";
import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode, apiSirenRequest } from "../../services/apiClient";

export const useRoleOptionsStore = create<{
  roles: AuthorizationRoleOption[];
  loading: boolean;
  error: ApiErrorCode | null;
  load(): Promise<void>;
}>((set, get) => ({
  roles: [],
  loading: false,
  error: null,
  async load() {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      set({ roles: (await apiSirenRequest<AuthorizationRoleOption[]>("/roles/options")).data });
    } catch (error) {
      set({ error: apiErrorCode(error) });
    } finally {
      set({ loading: false });
    }
  },
}));

export function useRoleOptions() {
  const state = useRoleOptionsStore();
  useEffect(() => {
    void state.load();
  }, [state.load]);
  return {
    ...state,
    requiresActiveMember: (selected: readonly string[]) =>
      state.roles.some((role) => selected.includes(role.id) && role.requiresActiveMember),
    roleName: (id: string) => state.roles.find((role) => role.id === id)?.name ?? id,
  };
}
