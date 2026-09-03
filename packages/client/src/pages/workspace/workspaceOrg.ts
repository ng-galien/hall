import { matchDiscriminated } from "@hall/domain";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { reclassifyCouncilBusiness } from "../../services/councilBusinessApi";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import type { WorkspaceItemReference } from "./workspaceItemReference";

export const DRAG_TYPE = "application/x-mairie-item";

export type DragPayload = WorkspaceItemReference;

export function encodeDragPayload(payload: DragPayload): string {
  return `${payload.kind}:${payload.id}`;
}

export function decodeDragPayload(raw: string): DragPayload | null {
  const [kind, id] = raw.split(":");
  if ((kind === "councilBusiness" || kind === "resource") && id) return { kind, id };
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
        await reclassifyCouncilBusiness(business.id, targetPath);
        await useCouncilBusinessStore.getState().load();
        return null;
      },
    });
  } catch (failure) {
    return apiErrorCode(failure);
  }
}
