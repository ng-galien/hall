import type { ResourceDetail, ResourceKind, UpdateResourceContent } from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import type { ResourceCapabilities } from "./resourceCapabilities";

export interface ResourceEditorState {
  content: string;
  remoteUrl: string;
}

interface StaticResourceEditorPolicy {
  fillsExtendedView: boolean;
  supportsAutosave: boolean;
}

/** Static editor behavior owned by the canonical documentary kind union. */
const resourceKindEditorPolicies: Record<ResourceKind, StaticResourceEditorPolicy> = {
  folder: { fillsExtendedView: false, supportsAutosave: false },
  text: { fillsExtendedView: false, supportsAutosave: true },
  spreadsheet: { fillsExtendedView: true, supportsAutosave: true },
  document: { fillsExtendedView: true, supportsAutosave: false },
  remote: { fillsExtendedView: true, supportsAutosave: true },
  geographic: { fillsExtendedView: true, supportsAutosave: true },
  event: { fillsExtendedView: false, supportsAutosave: true },
  legalReference: { fillsExtendedView: false, supportsAutosave: false },
};

export function resourceEditorState(resource: ResourceDetail): ResourceEditorState {
  return matchDiscriminated(resource, "kind", {
    folder: () => ({ content: "", remoteUrl: "" }),
    text: (entry) => ({ content: entry.content, remoteUrl: "" }),
    remote: (entry) => ({ content: "", remoteUrl: entry.target.kind === "url" ? entry.target.url : "" }),
    document: () => ({ content: "", remoteUrl: "" }),
    geographic: () => ({ content: "", remoteUrl: "" }),
    event: () => ({ content: "", remoteUrl: "" }),
    spreadsheet: () => ({ content: "", remoteUrl: "" }),
    legalReference: () => ({ content: "", remoteUrl: "" }),
  });
}

export function resourceContentUpdate(
  resource: ResourceDetail,
  state: ResourceEditorState,
): UpdateResourceContent | null {
  return matchDiscriminated(resource, "kind", {
    folder: () => null,
    text: (entry) => ({ kind: "text" as const, expectedVersion: entry.version, content: state.content }),
    remote: (entry) => ({
      kind: "remote" as const,
      expectedVersion: entry.version,
      target: state.remoteUrl.trim()
        ? ({ kind: "url", url: state.remoteUrl.trim() } as const)
        : ({ kind: "unconfigured" } as const),
    }),
    document: () => null,
    geographic: () => null,
    event: () => null,
    spreadsheet: () => null,
    legalReference: () => null,
  });
}

export function resourceContentDirty(resource: ResourceDetail, state: ResourceEditorState): boolean {
  return matchDiscriminated(resource, "kind", {
    folder: () => false,
    text: (entry) => state.content !== entry.content,
    remote: (entry) => state.remoteUrl !== (entry.target.kind === "url" ? entry.target.url : ""),
    document: () => false,
    geographic: () => false,
    event: () => false,
    spreadsheet: () => false,
    legalReference: () => false,
  });
}

export function resourceFillsExtendedView(resource: ResourceDetail): boolean {
  return resourceKindEditorPolicies[resource.kind].fillsExtendedView;
}

export function resourceSupportsAutosave(resource: ResourceDetail): boolean {
  return resourceKindEditorPolicies[resource.kind].supportsAutosave;
}

/** Editability is constrained exclusively by the actions granted on the opened Siren representation. */
export function resourceCanEdit(resource: ResourceDetail, capabilities: ResourceCapabilities): boolean {
  return matchDiscriminated(resource, "kind", {
    folder: () => false,
    text: () => capabilities.updateContent,
    remote: () => capabilities.updateContent,
    geographic: () => capabilities.updateContent,
    event: () => capabilities.updateContent,
    spreadsheet: () => capabilities.updateContent,
    legalReference: () => false,
    document: () => false,
  });
}
