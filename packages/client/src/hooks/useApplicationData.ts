import { useEffect } from "react";
import type { ApiErrorCode } from "../services/apiClient";
import { type ApplicationSyncPhase, useApplicationSyncStore } from "../stores/applicationSyncStore";
import { useCouncilBusinessStore } from "../stores/councilBusinessStore";
import { useCouncilCommitteesStore } from "../stores/councilCommitteesStore";
import { useCouncilDecisionsStore } from "../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";
import { useCouncilMembersStore } from "../stores/councilMembersStore";
import { useResourcesStore } from "../stores/resourcesStore";

export function useApplicationData(): void {
  useEffect(() => {
    void reloadApplicationData();
  }, []);
}

export async function reloadApplicationData(): Promise<ApiErrorCode | null> {
  useApplicationSyncStore.getState().begin();
  await Promise.all([
    useCouncilMembersStore.getState().load(),
    useCouncilCommitteesStore.getState().load(true),
    useCouncilMeetingsStore.getState().load(),
    useCouncilBusinessStore.getState().load(),
    useCouncilDecisionsStore.getState().load(),
    useResourcesStore.getState().load(),
  ]);
  const error =
    useCouncilMembersStore.getState().error ??
    useCouncilCommitteesStore.getState().error ??
    useCouncilMeetingsStore.getState().error ??
    useCouncilBusinessStore.getState().error ??
    useCouncilDecisionsStore.getState().error ??
    useResourcesStore.getState().error;
  useApplicationSyncStore.getState().finish(error);
  return error;
}

export function useApplicationStatus(): { phase: ApplicationSyncPhase; error: ApiErrorCode | null } {
  const synchronization = useApplicationSyncStore();
  const states = [
    useCouncilMembersStore(),
    useCouncilCommitteesStore(),
    useCouncilMeetingsStore(),
    useCouncilBusinessStore(),
    useCouncilDecisionsStore(),
    useResourcesStore(),
  ];
  const error = states.find((state) => state.error)?.error ?? synchronization.error;
  if (error) return { phase: "failed", error };
  if (synchronization.phase === "initializing") return { phase: "initializing", error: null };
  if (states.some((state) => state.loading) || synchronization.phase === "synchronizing") {
    return { phase: "synchronizing", error: null };
  }
  return { phase: "synchronized", error: null };
}
