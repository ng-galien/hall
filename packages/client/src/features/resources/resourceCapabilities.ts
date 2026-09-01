import { findSirenAction, type SirenEntity } from "@hall/api-contract";

export interface ResourceCapabilities {
  updateResource: boolean;
  updateGeography: boolean;
  updateSpreadsheet: boolean;
  resolveLegalReference: boolean;
  refreshLegalReference: boolean;
  deleteResource: boolean;
}

export const noResourceCapabilities: ResourceCapabilities = {
  updateResource: false,
  updateGeography: false,
  updateSpreadsheet: false,
  resolveLegalReference: false,
  refreshLegalReference: false,
  deleteResource: false,
};

/** The sole client-side interpretation of the actions exposed by a resource representation. */
export function resourceCapabilities(representation: SirenEntity | null): ResourceCapabilities {
  if (!representation) return noResourceCapabilities;
  return {
    updateResource: Boolean(findSirenAction(representation, "resource.update")),
    updateGeography: Boolean(findSirenAction(representation, "resource.update-geography")),
    updateSpreadsheet: Boolean(findSirenAction(representation, "resource.update-spreadsheet")),
    resolveLegalReference: Boolean(findSirenAction(representation, "resource.resolve-legal-reference")),
    refreshLegalReference: Boolean(findSirenAction(representation, "resource.refresh-legal-reference")),
    deleteResource: Boolean(findSirenAction(representation, "resource.delete")),
  };
}
