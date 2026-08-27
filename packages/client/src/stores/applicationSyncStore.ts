import { create } from "zustand";
import type { ApiErrorCode } from "../services/apiClient";

export type ApplicationSyncPhase = "initializing" | "synchronizing" | "synchronized" | "failed";

interface ApplicationSyncState {
  phase: ApplicationSyncPhase;
  error: ApiErrorCode | null;
  begin(): void;
  finish(error: ApiErrorCode | null): void;
}

export const useApplicationSyncStore = create<ApplicationSyncState>((set, get) => ({
  phase: "initializing",
  error: null,
  begin() {
    set({ phase: get().phase === "initializing" ? "initializing" : "synchronizing", error: null });
  },
  finish(error) {
    set({ phase: error ? "failed" : "synchronized", error });
  },
}));
