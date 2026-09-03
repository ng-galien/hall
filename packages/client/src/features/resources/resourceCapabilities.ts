import { findSirenAction, type SirenEntity } from "@hall/api-contract";

export interface ResourceCapabilities {
  relocate: boolean;
  updateMetadata: boolean;
  updateContent: boolean;
  resolveLegalReference: boolean;
  refreshLegalReference: boolean;
  deleteResource: boolean;
}

export const noResourceCapabilities: ResourceCapabilities = {
  relocate: false,
  updateMetadata: false,
  updateContent: false,
  resolveLegalReference: false,
  refreshLegalReference: false,
  deleteResource: false,
};

/** The sole client-side interpretation of the actions exposed by a resource representation. */
export function resourceCapabilities(representation: SirenEntity | null): ResourceCapabilities {
  if (!representation) return noResourceCapabilities;
  return {
    relocate: Boolean(findSirenAction(representation, "resource.relocate")),
    updateMetadata: Boolean(findSirenAction(representation, "resource.update-metadata")),
    updateContent: Boolean(findSirenAction(representation, "resource.update-content")),
    resolveLegalReference: Boolean(findSirenAction(representation, "resource.resolve-legal-reference")),
    refreshLegalReference: Boolean(findSirenAction(representation, "resource.refresh-legal-reference")),
    deleteResource: Boolean(findSirenAction(representation, "resource.delete")),
  };
}
