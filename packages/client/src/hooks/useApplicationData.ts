import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import type { ApiErrorCode } from "../services/apiClient";
import { type ApplicationSyncPhase, useApplicationSyncStore } from "../stores/applicationSyncStore";
import { useContactsStore } from "../stores/contactsStore";
import { useCouncilBusinessStore } from "../stores/councilBusinessStore";
import { useCouncilCommitteesStore } from "../stores/councilCommitteesStore";
import { useCouncilDecisionsStore } from "../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";
import { useCouncilMembersStore } from "../stores/councilMembersStore";
import { useWorkspaceCouncilActivityStore } from "../stores/workspaceCouncilActivityStore";

export function useApplicationData(): void {
  const location = useLocation();
  const selectedBusiness = location.pathname === "/workspace" && new URLSearchParams(location.search).has("councilBusiness");
  useEffect(() => {
    if (selectedBusiness) {
      useApplicationSyncStore.getState().finish(null);
      return;
    }
    void reloadApplicationData();
  }, [selectedBusiness]);
}

export async function reloadApplicationData(): Promise<ApiErrorCode | null> {
  useApplicationSyncStore.getState().begin();
  await Promise.all([
    useContactsStore.getState().load(),
    useCouncilMembersStore.getState().load(),
    useCouncilCommitteesStore.getState().load(true),
    useCouncilMeetingsStore.getState().load(),
    useCouncilBusinessStore.getState().load(),
    useCouncilDecisionsStore.getState().load(),
  ]);
  await useWorkspaceCouncilActivityStore.getState().load();
  const error =
    useContactsStore.getState().error ??
    useCouncilMembersStore.getState().error ??
    useCouncilCommitteesStore.getState().error ??
    useCouncilMeetingsStore.getState().error ??
    useCouncilBusinessStore.getState().error ??
    useWorkspaceCouncilActivityStore.getState().error ??
    useCouncilDecisionsStore.getState().error;
  useApplicationSyncStore.getState().finish(error);
  return error;
}

export function useApplicationStatus(): { phase: ApplicationSyncPhase; error: ApiErrorCode | null } {
  const synchronization = useApplicationSyncStore();
  const states = [
    useContactsStore(),
    useCouncilMembersStore(),
    useCouncilCommitteesStore(),
    useCouncilMeetingsStore(),
    useCouncilBusinessStore(),
    useWorkspaceCouncilActivityStore(),
    useCouncilDecisionsStore(),
  ];
  const error = states.find((state) => state.error)?.error ?? synchronization.error;
  if (error) return { phase: "failed", error };
  if (synchronization.phase === "initializing") return { phase: "initializing", error: null };
  if (states.some((state) => state.loading) || synchronization.phase === "synchronizing") {
    return { phase: "synchronizing", error: null };
  }
  return { phase: "synchronized", error: null };
}
