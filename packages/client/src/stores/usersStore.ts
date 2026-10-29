import { type ApiRole, type ApiUser, findSirenAction } from "@hall/api-contract";
import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode, type SirenApiResult } from "../services/apiClient";
import * as api from "../services/usersApi";

interface UsersState {
  users: ApiUser[];
  loading: boolean;
  error: ApiErrorCode | null;
  canCreate: boolean;
  canUpdate: Record<string, boolean>;
  canAssignRoles: Record<string, boolean>;
  canResetPassword: Record<string, boolean>;
  canDisable: Record<string, boolean>;
  canRevokeAccess: Record<string, boolean>;
  canReactivate: Record<string, boolean>;
  canGeneratePassphrase: boolean;
  load(): Promise<void>;
  loadDetail(id: string): Promise<void>;
  create(input: Record<string, unknown>): Promise<ApiUser | null>;
  update(id: string, input: Record<string, unknown>): Promise<ApiUser | null>;
  assignRoles(id: string, roles: ApiRole[]): Promise<boolean>;
  disable(id: string): Promise<boolean>;
  revokeAccess(id: string): Promise<boolean>;
  reactivate(id: string): Promise<string | null>;
  clearError(): void;
}

export const useUsersStore = create<UsersState>((set, get) => {
  const accept = (result: SirenApiResult<ApiUser>) =>
    set((state) => ({
      users: [...state.users.filter((user) => user.id !== result.data.id), result.data],
      canUpdate: {
        ...state.canUpdate,
        [result.data.id]: Boolean(result.representation && findSirenAction(result.representation, "user.update")),
      },
      canAssignRoles: {
        ...state.canAssignRoles,
        [result.data.id]: Boolean(result.representation && findSirenAction(result.representation, "user.assign-role")),
      },
      canResetPassword: {
        ...state.canResetPassword,
        [result.data.id]: Boolean(
          result.representation && findSirenAction(result.representation, "user.reset-password"),
        ),
      },
      canDisable: {
        ...state.canDisable,
        [result.data.id]: Boolean(result.representation && findSirenAction(result.representation, "user.disable")),
      },
      canRevokeAccess: {
        ...state.canRevokeAccess,
        [result.data.id]: Boolean(
          result.representation && findSirenAction(result.representation, "user.revoke-access"),
        ),
      },
      canReactivate: {
        ...state.canReactivate,
        [result.data.id]: Boolean(result.representation && findSirenAction(result.representation, "user.reactivate")),
      },
    }));
  const mutate = async (operation: () => Promise<SirenApiResult<ApiUser>>) => {
    set({ error: null });
    try {
      accept(await operation());
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  };
  return {
    users: [],
    loading: false,
    error: null,
    canCreate: false,
    canUpdate: {},
    canAssignRoles: {},
    canResetPassword: {},
    canDisable: {},
    canRevokeAccess: {},
    canReactivate: {},
    canGeneratePassphrase: false,
    clearError: () => set({ error: null }),
    async load() {
      set({
        loading: true,
        error: null,
        users: [],
        canCreate: false,
        canUpdate: {},
        canAssignRoles: {},
        canResetPassword: {},
        canDisable: {},
        canRevokeAccess: {},
        canReactivate: {},
        canGeneratePassphrase: false,
      });
      try {
        const result = await api.listUsersSiren();
        set({
          users: result.data,
          canCreate: Boolean(result.representation && findSirenAction(result.representation, "user.create")),
          canGeneratePassphrase: Boolean(
            result.representation && findSirenAction(result.representation, "user.generate-passphrase"),
          ),
        });
      } catch (error) {
        set({ error: apiErrorCode(error) });
      } finally {
        set({ loading: false });
      }
    },
    async loadDetail(id) {
      set({
        loading: true,
        error: null,
        users: [],
        canUpdate: {},
        canAssignRoles: {},
        canResetPassword: {},
        canDisable: {},
        canRevokeAccess: {},
        canReactivate: {},
      });
      try {
        accept(await api.getUserSiren(id));
      } catch (error) {
        set({ error: apiErrorCode(error) });
      } finally {
        set({ loading: false });
      }
    },
    async create(input) {
      set({ error: null });
      try {
        const result = await api.createUser(input);
        await get().load();
        return result.data;
      } catch (error) {
        set({ error: apiErrorCode(error) });
        return null;
      }
    },
    async update(id, input) {
      set({ error: null });
      try {
        const result = await api.updateUser(id, input);
        accept(result);
        return result.data;
      } catch (error) {
        set({ error: apiErrorCode(error) });
        return null;
      }
    },
    assignRoles: (id, roles) => mutate(() => api.assignUserRoles(id, roles)),
    disable: (id) => mutate(() => api.disableUser(id)),
    revokeAccess: (id) => mutate(() => api.revokeUserAccess(id)),
    async reactivate(id) {
      set({ error: null });
      try {
        const result = await api.reactivateUser(id);
        const { passphrase, ...user } = result.data;
        accept({ ...result, data: user });
        return passphrase;
      } catch (error) {
        set({ error: apiErrorCode(error) });
        return null;
      }
    },
  };
});
