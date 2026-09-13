import { matchDiscriminated } from "@hall/domain";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import type { WorkspaceItemReference } from "./workspaceItemReference";

export const DRAG_TYPE = "application/x-mairie-item";

export type DragPayload = WorkspaceItemReference;

export function encodeDragPayload(payloads: readonly DragPayload[]): string {
  return JSON.stringify(payloads);
}

export function decodeDragPayload(raw: string): DragPayload[] | null {
  try {
    const payloads: unknown = JSON.parse(raw);
    if (!Array.isArray(payloads) || payloads.length === 0) return null;
    if (
      payloads.every(
        (payload) =>
          typeof payload === "object" &&
          payload !== null &&
          "kind" in payload &&
          "id" in payload &&
          (payload.kind === "councilBusiness" || payload.kind === "resource") &&
          typeof payload.id === "string" &&
          payload.id.length > 0,
      )
    ) {
      return payloads as DragPayload[];
    }
  } catch {
    return null;
  }
  return null;
}

/** Moves a business or a resource to a path. Returns an error code, or null on success. */
export async function moveToPath(payload: DragPayload, targetPath: string): Promise<ApiErrorCode | null> {
  try {
    return await matchDiscriminated(payload, "kind", {
      resource: async (entry) => {
        let workspace = useWorkspaceResourcesStore.getState();
        let resource = workspace.catalog.find((candidate) => candidate.id === entry.id);
        if (!resource) {
          await workspace.loadCatalog();
          workspace = useWorkspaceResourcesStore.getState();
          resource = workspace.catalog.find((candidate) => candidate.id === entry.id);
        }
        if (!resource) return "resource_not_found";
        if (resource.path === targetPath) return null;
        const relocated = await workspace.relocate(resource.id, { path: targetPath, name: resource.name });
        return relocated ? null : useWorkspaceResourcesStore.getState().error;
      },
      councilBusiness: async (entry) => {
        const business = useCouncilBusinessStore.getState().businesses.find((candidate) => candidate.id === entry.id);
        if (!business) return "council_business_not_found";
        if (business.folderPath === targetPath) return null;
        const relocated = await useWorkspaceResourcesStore
          .getState()
          .relocate(business.folderResourceId, { path: targetPath, name: business.title });
        if (!relocated) return useWorkspaceResourcesStore.getState().error;
        await useCouncilBusinessStore.getState().refresh(business.id);
        return null;
      },
    });
  } catch (failure) {
    return apiErrorCode(failure);
  }
}
