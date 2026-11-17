import { matchDiscriminated } from "@hall/domain";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { businessFolderPath, type PathBusiness } from "./paths";
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

/** The refusal of the documents store, taken from it so that the screen announces it only once. */
function resourcesRefusal(): ApiErrorCode {
  const error = useWorkspaceResourcesStore.getState().error ?? "request_failed";
  useWorkspaceResourcesStore.setState({ error: null });
  return error;
}

/** The refusal of the council business store, taken from it so that the screen announces it only once. */
function businessRefusal(): ApiErrorCode {
  const error = useCouncilBusinessStore.getState().error ?? "request_failed";
  useCouncilBusinessStore.setState({ error: null });
  return error;
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
        return relocated ? null : resourcesRefusal();
      },
      councilBusiness: async (entry) => {
        const business = useCouncilBusinessStore.getState().businesses.find((candidate) => candidate.id === entry.id);
        if (!business) return "council_business_not_found";
        if (business.folderPath === targetPath) return null;
        const relocated = await useWorkspaceResourcesStore
          .getState()
          .relocate(business.folderResourceId, { path: targetPath, name: business.title });
        if (!relocated) return resourcesRefusal();
        await useCouncilBusinessStore.getState().refresh(business.id);
        return null;
      },
    });
  } catch (failure) {
    return apiErrorCode(failure);
  }
}

/** A business that receives an item: its identity, its place and its own folder. */
export type MoveTargetBusiness = PathBusiness & { reportResourceId?: string };

/**
 * Moves an item into the folder of a business; a document is also attached to the business, unless it already is.
 * Returns an error code, or null on success.
 * @implements-requirement HALL-FR-WSP-090
 */
export async function moveIntoBusiness(
  payload: DragPayload,
  business: MoveTargetBusiness,
): Promise<ApiErrorCode | null> {
  const moved = await moveToPath(payload, businessFolderPath(business));
  if (moved || payload.kind !== "resource") return moved;
  const resource = useWorkspaceResourcesStore.getState().catalog.find((candidate) => candidate.id === payload.id);
  if (
    !resource ||
    resource.kind === "folder" ||
    resource.id === business.folderResourceId ||
    resource.id === business.reportResourceId
  )
    return null;
  const businesses = useCouncilBusinessStore.getState();
  if (!(await businesses.loadResources(business.id))) return businessRefusal();
  const attached = useCouncilBusinessStore
    .getState()
    .businesses.find((candidate) => candidate.id === business.id)
    ?.resources.some((candidate) => candidate.id === resource.id);
  if (attached) return null;
  return (await businesses.associateResource(business.id, resource.id)) ? null : businessRefusal();
}
