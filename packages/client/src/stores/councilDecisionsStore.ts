import type { CouncilDecisionListEntry } from "@hall/domain";
import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import { createCouncilDecision, listCouncilDecisions, updateCouncilDecision } from "../services/councilDecisionsApi";

interface CouncilDecisionsState {
  councilDecisions: CouncilDecisionListEntry[];
  loading: boolean;
  error: ApiErrorCode | null;
  load(): Promise<void>;
  create(input: Record<string, unknown>): Promise<boolean>;
  update(decisionId: string, input: Record<string, unknown>): Promise<boolean>;
}

export const useCouncilDecisionsStore = create<CouncilDecisionsState>((set, get) => ({
  councilDecisions: [],
  loading: false,
  error: null,
  async load() {
    set({ loading: true, error: null });
    try {
      set({ councilDecisions: await listCouncilDecisions(), loading: false });
    } catch (error) {
      set({ error: apiErrorCode(error), loading: false });
    }
  },
  async create(input) {
    set({ error: null });
    try {
      await createCouncilDecision(input);
      await get().load();
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
  async update(decisionId, input) {
    set({ error: null });
    try {
      await updateCouncilDecision(decisionId, input);
      await get().load();
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
}));
