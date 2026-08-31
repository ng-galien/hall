import { matchDiscriminated, type Resource } from "@hall/domain";

export interface ResourceEditorState {
  content: string;
  remoteUrl: string;
}

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
  return matchDiscriminated(resource, "kind", {
    document: () => true,
    geographic: () => true,
    spreadsheet: () => true,
    text: () => false,
    remote: () => false,
    legalReference: () => false,
  });
}

export function resourceSupportsAutosave(resource: Resource): boolean {
  return matchDiscriminated(resource, "kind", {
    text: () => true,
    remote: () => true,
    geographic: () => true,
    spreadsheet: () => true,
    document: () => false,
    legalReference: () => false,
  });
}
