import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { updateResource } from "../../services/resourcesApi";
import { reclassifyTopic } from "../../services/topicsApi";
import { useResourcesStore } from "../../stores/resourcesStore";
import { useTopicsStore } from "../../stores/topicsStore";

/** Chemins créés à la main, pas encore matérialisés par un objet. */
interface WorkspaceOrgState {
  pendingPaths: string[];
  addPendingPath(path: string): void;
  prunePendingPaths(materialized: Iterable<string>): void;
}

export const useWorkspaceOrgStore = create<WorkspaceOrgState>((set) => ({
  pendingPaths: [],
  addPendingPath(path) {
    set((state) => (state.pendingPaths.includes(path) ? state : { pendingPaths: [...state.pendingPaths, path] }));
  },
  prunePendingPaths(materialized) {
    const existing = new Set(materialized);
    set((state) => ({ pendingPaths: state.pendingPaths.filter((path) => !existing.has(path)) }));
  },
}));

export const DRAG_TYPE = "application/x-mairie-item";

export type DragPayload = { kind: "topic" | "resource"; id: string };

export function encodeDragPayload(payload: DragPayload): string {
  return `${payload.kind}:${payload.id}`;
}

export function decodeDragPayload(raw: string): DragPayload | null {
  const [kind, id] = raw.split(":");
  if ((kind === "topic" || kind === "resource") && id) return { kind, id };
  return null;
}

/** Reclasse un topic ou une ressource vers un chemin. Retourne un code d'erreur ou null. */
export async function moveToPath(payload: DragPayload, targetPath: string): Promise<ApiErrorCode | null> {
  try {
    if (payload.kind === "resource") {
      const resource = useResourcesStore.getState().resources.find((candidate) => candidate.id === payload.id);
      if (!resource) return "resource_not_found";
      if (resource.folderPath === targetPath) return null;
      await updateResource(resource.id, {
        title: resource.title,
        folderPath: targetPath,
        tags: resource.tags,
        ...(resource.kind === "text" ? { content: resource.content } : {}),
      });
      await useResourcesStore.getState().load();
      return null;
    }
    const topic = useTopicsStore.getState().topics.find((candidate) => candidate.id === payload.id);
    if (!topic) return "topic_not_found";
    if (topic.folderPath === targetPath) return null;
    await reclassifyTopic(topic.id, targetPath);
    await useTopicsStore.getState().load();
    return null;
  } catch (failure) {
    return apiErrorCode(failure);
  }
}
