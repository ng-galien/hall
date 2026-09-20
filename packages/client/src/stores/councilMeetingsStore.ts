import { findSirenAction } from "@hall/api-contract";
import { create } from "zustand";
import { type CouncilMeetingView, councilMeetingView } from "../models/councilMeeting";
import { type ApiErrorCode, apiErrorCode, sirenRepresentation } from "../services/apiClient";
import { listCouncilMeetings } from "../services/councilMeetingsApi";

interface CouncilMeetingsState {
  meetings: CouncilMeetingView[];
  loading: boolean;
  error: ApiErrorCode | null;
  canProvision: boolean;
  load(): Promise<void>;
}

export const useCouncilMeetingsStore = create<CouncilMeetingsState>((set) => ({
  meetings: [],
  loading: false,
  error: null,
  canProvision: false,
  async load() {
    set({ loading: true, error: null });
    try {
      const meetings = (await listCouncilMeetings()).map(councilMeetingView);
      const representation = await sirenRepresentation("/council-meetings");
      set({
        meetings,
        canProvision: Boolean(findSirenAction(representation, "meeting.provision-initial")),
        loading: false,
      });
    } catch (error) {
      set({ error: apiErrorCode(error), loading: false });
    }
  },
}));
