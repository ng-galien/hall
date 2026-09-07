import type { CouncilDecisionSummary } from "@hall/api-contract";
import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import { listCouncilDecisionDocuments } from "../services/councilDecisionsApi";

interface CouncilDecisionsState {
  councilDecisions: CouncilDecisionSummary[];
  loading: boolean;
  error: ApiErrorCode | null;
  load(): Promise<void>;
  accept(summary: CouncilDecisionSummary): void;
}

export const useCouncilDecisionsStore = create<CouncilDecisionsState>((set, get) => ({
  councilDecisions: [],
  loading: false,
  error: null,
  accept(summary) {
    set((state) => ({
      councilDecisions: state.councilDecisions.some((entry) => entry.id === summary.id)
        ? state.councilDecisions.map((entry) => (entry.id === summary.id ? summary : entry))
        : [...state.councilDecisions, summary],
    }));
  },
  async load() {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      set({ councilDecisions: await listCouncilDecisionDocuments(), loading: false });
    } catch (error) {
      set({ error: apiErrorCode(error), loading: false });
    }
  },
}));
