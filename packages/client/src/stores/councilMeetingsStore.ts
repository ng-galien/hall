import { findSirenAction, type PrepareCouncilMeeting } from "@hall/api-contract";
import { create } from "zustand";
import { councilMeetingView, type CouncilMeetingView } from "../models/councilMeeting";
import { type ApiErrorCode, apiErrorCode, sirenRepresentation } from "../services/apiClient";
import { listCouncilMeetings, prepareCouncilMeeting } from "../services/councilMeetingsApi";

interface CouncilMeetingsState {
  meetings: CouncilMeetingView[];
  loading: boolean;
  error: ApiErrorCode | null;
  canProvision: boolean;
  load(): Promise<void>;
  schedule(meetingReference: string, input: PrepareCouncilMeeting): Promise<boolean>;
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
      set({ meetings, canProvision: Boolean(findSirenAction(representation, "meeting.provision-initial")), loading: false });
    } catch (error) {
      set({ error: apiErrorCode(error), loading: false });
    }
  },
  async schedule(meetingReference, input) {
    set({ error: null });
    try {
      await prepareCouncilMeeting(meetingReference, input);
      const meetings = (await listCouncilMeetings()).map(councilMeetingView);
      set({ meetings });
      return true;
    } catch (error) {
      set({ error: apiErrorCode(error) });
      return false;
    }
  },
}));
