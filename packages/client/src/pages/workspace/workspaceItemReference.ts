export type WorkspaceItemReference = { kind: "councilBusiness"; id: string } | { kind: "resource"; id: string };

export type WorkspaceSelection = WorkspaceItemReference | null;

export function sameWorkspaceItem(left: WorkspaceItemReference, right: WorkspaceItemReference): boolean {
  return left.kind === right.kind && left.id === right.id;
}
