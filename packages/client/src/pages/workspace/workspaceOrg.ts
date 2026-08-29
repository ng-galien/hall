import { create } from "zustand";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { reclassifyCouncilBusiness } from "../../services/councilBusinessApi";
import { updateResource } from "../../services/resourcesApi";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useResourcesStore } from "../../stores/resourcesStore";

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

export type DragPayload = { kind: "councilBusiness" | "resource"; id: string };

export function encodeDragPayload(payload: DragPayload): string {
  return `${payload.kind}:${payload.id}`;
}

export function decodeDragPayload(raw: string): DragPayload | null {
  const [kind, id] = raw.split(":");
  if ((kind === "councilBusiness" || kind === "resource") && id) return { kind, id };
  return null;
}

/** Reclasse un business ou une ressource vers un chemin. Retourne un code d'erreur ou null. */
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
    const business = useCouncilBusinessStore.getState().businesses.find((candidate) => candidate.id === payload.id);
    if (!business) return "council_business_not_found";
    if (business.folderPath === targetPath) return null;
    await reclassifyCouncilBusiness(business.id, targetPath);
    await useCouncilBusinessStore.getState().load();
    return null;
  } catch (failure) {
    return apiErrorCode(failure);
  }
}
