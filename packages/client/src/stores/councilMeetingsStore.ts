import type { CouncilMeeting } from "@mairie/domain";
import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import { createCouncilMeeting, listCouncilMeetings } from "../services/councilMeetingsApi";

interface CouncilMeetingsState {
  meetings: CouncilMeeting[];
  loading: boolean;
  error: ApiErrorCode | null;
  load(): Promise<void>;
  create(input: Record<string, unknown>): Promise<boolean>;
}

export const useCouncilMeetingsStore = create<CouncilMeetingsState>((set, get) => ({
  meetings: [],
  loading: false,
  error: null,
  async load() {
    set({ loading: true, error: null });
    try {
      set({ meetings: await listCouncilMeetings(), loading: false });
    } catch (error) {
      set({ error: apiErrorCode(error), loading: false });
    }
  },
  async create(input) {
    set({ error: null });
    try {
      await createCouncilMeeting(input);
      await get().load();
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
}));
