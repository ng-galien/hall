import type { AgendaItem } from "@hall/api-contract";
import { create } from "zustand";
import type { TranslationKey } from "../i18n/en";
import type { CouncilMeetingView } from "../models/councilMeeting";
import { type ApiErrorCode, apiErrorCode } from "../services/apiClient";
import { listCouncilBusinessAgendaItems } from "../services/councilBusinessApi";
import { useCouncilBusinessStore } from "./councilBusinessStore";
import { useCouncilMeetingsStore } from "./councilMeetingsStore";

export type WorkspaceBusinessOccurrence = {
  agendaItem: AgendaItem;
  meeting: CouncilMeetingView;
};

interface WorkspaceCouncilActivityState {
  occurrencesByBusinessId: Record<string, WorkspaceBusinessOccurrence[]>;
  loading: boolean;
  error: ApiErrorCode | null;
  load(): Promise<void>;
  upsertOccurrence(businessId: string, agendaItem: AgendaItem): void;
  removeOccurrence(businessId: string, agendaItemId: string): void;
}

let pendingLoad: Promise<void> | null = null;

function batches<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

/**
 * Flat bulk workspace projection, loaded independently from documentary resources.
 * Requests are bounded batches, never one request per CouncilBusiness.
 */
export const useWorkspaceCouncilActivityStore = create<WorkspaceCouncilActivityState>((set) => ({
  occurrencesByBusinessId: {},
  loading: false,
  error: null,
  upsertOccurrence(businessId, agendaItem) {
    const meeting = useCouncilMeetingsStore.getState().meetings.find(({ id }) => id === agendaItem.councilMeetingId);
    if (!meeting) return;
    set((state) => ({
      occurrencesByBusinessId: {
        ...state.occurrencesByBusinessId,
        [businessId]: [
          ...(state.occurrencesByBusinessId[businessId] ?? []).filter(
            ({ agendaItem: current }) => current.id !== agendaItem.id,
          ),
          { agendaItem, meeting },
        ],
      },
    }));
  },
  removeOccurrence(businessId, agendaItemId) {
    set((state) => ({
      occurrencesByBusinessId: {
        ...state.occurrencesByBusinessId,
        [businessId]: (state.occurrencesByBusinessId[businessId] ?? []).filter(
          ({ agendaItem }) => agendaItem.id !== agendaItemId,
        ),
      },
    }));
  },
  async load() {
    if (pendingLoad) return pendingLoad;
    pendingLoad = (async () => {
      set({ loading: true, error: null });
      try {
        const businessIds = useCouncilBusinessStore.getState().businesses.map(({ id }) => id);
        if (businessIds.length === 0) {
          set({ occurrencesByBusinessId: {}, loading: false });
          return;
        }
        const agendaItems = (
          await Promise.all(batches(businessIds, 100).map((ids) => listCouncilBusinessAgendaItems(ids)))
        ).flat();
        const meetings = new Map(useCouncilMeetingsStore.getState().meetings.map((meeting) => [meeting.id, meeting]));
        const occurrencesByBusinessId: Record<string, WorkspaceBusinessOccurrence[]> = {};
        for (const agendaItem of agendaItems) {
          const meeting = meetings.get(agendaItem.councilMeetingId);
          if (!meeting || !agendaItem.councilBusinessId) continue;
          occurrencesByBusinessId[agendaItem.councilBusinessId] ??= [];
          occurrencesByBusinessId[agendaItem.councilBusinessId].push({ agendaItem, meeting });
        }
        for (const occurrences of Object.values(occurrencesByBusinessId)) {
          occurrences.sort(
            (left, right) =>
              left.meeting.number - right.meeting.number ||
              Math.abs(left.agendaItem.position) - Math.abs(right.agendaItem.position),
          );
        }
        set({ occurrencesByBusinessId, loading: false });
      } catch (error) {
        set({ error: apiErrorCode(error), loading: false });
      }
    })().finally(() => {
      pendingLoad = null;
    });
    return pendingLoad;
  },
}));

export { workspaceCurrentOccurrence } from "../features/council-business/workspaceActivity";

export function workspaceAgendaItemStatus(
  agendaItem: AgendaItem,
): "scheduled" | "inProgress" | "examined" | "postponed" {
  if (agendaItem.position < 0) return "postponed";
  if (agendaItem.completedAt) return "examined";
  if (agendaItem.startedAt) return "inProgress";
  return "scheduled";
}

export const workspaceAgendaSubjectKeys: Record<AgendaItem["subject"]["kind"], TranslationKey> = {
  minutesApproval: "agendaSubject.minutesApproval",
  councilDecisionProposal: "agendaSubject.councilDecisionProposal",
  openQuestion: "agendaSubject.openQuestion",
};
