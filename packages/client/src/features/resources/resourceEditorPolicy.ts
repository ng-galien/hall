import { matchDiscriminated, type Resource, type ResourceDetails, type ResourceKind } from "@hall/domain";
import type { ResourceCapabilities } from "./resourceCapabilities";

export interface ResourceEditorState {
  content: string;
  remoteUrl: string;
}

interface StaticResourceEditorPolicy {
  fillsExtendedView: boolean;
  supportsAutosave: boolean;
}

/** Static editor behavior owned by ResourceKind; payload-dependent operations stay in their exhaustive functions. */
const resourceKindEditorPolicies: Record<ResourceKind, StaticResourceEditorPolicy> = {
  text: { fillsExtendedView: false, supportsAutosave: true },
  spreadsheet: { fillsExtendedView: true, supportsAutosave: true },
  document: { fillsExtendedView: true, supportsAutosave: false },
  remote: { fillsExtendedView: false, supportsAutosave: true },
  geographic: { fillsExtendedView: true, supportsAutosave: true },
  legalReference: { fillsExtendedView: false, supportsAutosave: false },
};

/** Values owned by the generic resource editor for each resource kind. */
export function resourceEditorState(resource: Resource): ResourceEditorState {
  return matchDiscriminated(resource, "kind", {
    text: (entry) => ({ content: entry.content, remoteUrl: "" }),
    remote: (entry) => ({ content: "", remoteUrl: entry.url ?? "" }),
    document: () => ({ content: "", remoteUrl: "" }),
    geographic: () => ({ content: "", remoteUrl: "" }),
    spreadsheet: () => ({ content: "", remoteUrl: "" }),
    legalReference: () => ({ content: "", remoteUrl: "" }),
  });
}

/** Kind-specific fields accepted by the generic resource update endpoint. */
export function resourceSpecificUpdate(resource: Resource, state: ResourceEditorState) {
  return matchDiscriminated(resource, "kind", {
    text: () => ({ content: state.content }),
    remote: () => ({ url: state.remoteUrl || null }),
    document: () => ({}),
    geographic: () => ({}),
    spreadsheet: () => ({}),
    legalReference: () => ({}),
  });
}

export function resourceContentDirty(resource: Resource, state: ResourceEditorState): boolean {
  return matchDiscriminated(resource, "kind", {
    text: (entry) => state.content !== entry.content,
    remote: (entry) => state.remoteUrl !== (entry.url ?? ""),
    document: () => false,
    geographic: () => false,
    spreadsheet: () => false,
    legalReference: () => false,
  });
}

export function resourceFillsExtendedView(resource: Resource): boolean {
  return resourceKindEditorPolicies[resource.kind].fillsExtendedView;
}

export function resourceSupportsAutosave(resource: Resource): boolean {
  return resourceKindEditorPolicies[resource.kind].supportsAutosave;
}

/** Editability is a product policy constrained by the actions granted for this representation. */
export function resourceCanEdit(
  resource: Resource,
  details: ResourceDetails,
  capabilities: ResourceCapabilities,
): boolean {
  if (details.snapshotted) return false;
  return matchDiscriminated(resource, "kind", {
    text: () => capabilities.updateResource,
    remote: () => capabilities.updateResource,
    geographic: () => capabilities.updateGeography,
    spreadsheet: () => capabilities.updateSpreadsheet,
    legalReference: (entry) => entry.resolutionStatus === "draft" && capabilities.resolveLegalReference,
    document: () => false,
  });
}
