import type { CaseFile } from "@mairie/domain";
import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import { createCaseFile, listCaseFiles } from "../services/caseFilesApi";

interface CaseFilesState {
  caseFiles: CaseFile[];
  loading: boolean;
  error: ApiErrorCode | null;
  load(): Promise<void>;
  create(input: Record<string, unknown>): Promise<boolean>;
}

export const useCaseFilesStore = create<CaseFilesState>((set, get) => ({
  caseFiles: [],
  loading: false,
  error: null,
  async load() {
    set({ loading: true, error: null });
    try {
      set({ caseFiles: await listCaseFiles(), loading: false });
    } catch (error) {
      set({ error: apiErrorCode(error), loading: false });
    }
  },
  async create(input) {
    set({ error: null });
    try {
      await createCaseFile(input);
      await get().load();
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
}));
