import type {
  CouncilBusinessResourceItem,
  CouncilBusinessWorkspaceItem,
  ResourceSummary,
} from "@hall/api-contract";

export type CouncilBusinessResource = Exclude<ResourceSummary, { kind: "folder" }>;

export interface CouncilBusinessView extends CouncilBusinessWorkspaceItem {
  resources: CouncilBusinessResource[];
}

export function councilBusinessView(
  business: CouncilBusinessWorkspaceItem,
  resourceItems: readonly CouncilBusinessResourceItem[],
): CouncilBusinessView {
  return {
    ...business,
    resources: resourceItems
      .filter(
        (item): item is CouncilBusinessResourceItem & CouncilBusinessResource =>
          item.councilBusinessId === business.id && item.kind !== "folder" && item.id !== business.reportResourceId,
      )
      .sort((left, right) => left.position - right.position)
      .map(({ councilBusinessId: _councilBusinessId, position: _position, ...resource }) => resource),
  };
}
