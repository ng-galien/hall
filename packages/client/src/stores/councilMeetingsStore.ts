import { findSirenAction } from "@hall/api-contract";
import type { CouncilMeeting } from "@hall/domain";
import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode, sirenRepresentation } from "../services/apiClient";
import { createCouncilMeeting, listCouncilMeetings } from "../services/councilMeetingsApi";

interface CouncilMeetingsState {
  meetings: CouncilMeeting[];
  loading: boolean;
  error: ApiErrorCode | null;
  canCreate: boolean;
  load(): Promise<void>;
  create(input: Record<string, unknown>): Promise<boolean>;
}

export const useCouncilMeetingsStore = create<CouncilMeetingsState>((set, get) => ({
  meetings: [],
  loading: false,
  error: null,
  canCreate: false,
  async load() {
    set({ loading: true, error: null });
    try {
      const meetings = await listCouncilMeetings();
      const representation = await sirenRepresentation("/council-meetings");
      set({ meetings, canCreate: Boolean(findSirenAction(representation, "meeting.create")), loading: false });
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
