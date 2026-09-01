export const workspaceItemKinds = ["councilBusiness", "resource"] as const;

type WorkspaceItemKind = (typeof workspaceItemKinds)[number];

export type WorkspaceItemReference = {
  [Kind in WorkspaceItemKind]: { kind: Kind; id: string };
}[WorkspaceItemKind];

export type WorkspaceSelection = WorkspaceItemReference | null;

export function sameWorkspaceItem(left: WorkspaceItemReference, right: WorkspaceItemReference): boolean {
  return left.kind === right.kind && left.id === right.id;
}

/** Validates references restored from browser storage before they reach exhaustive consumers. */
export function isWorkspaceItemReference(value: unknown): value is WorkspaceItemReference {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { kind?: unknown; id?: unknown };
  return (
    typeof candidate.kind === "string" &&
    workspaceItemKinds.some((kind) => kind === candidate.kind) &&
    typeof candidate.id === "string"
  );
}
