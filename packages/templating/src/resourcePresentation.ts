import { matchDiscriminated, type Resource } from "@hall/domain";
import type { ResourcePresentationKind } from "./grammar.js";

interface ResourcePresentationPolicy {
  preferred: ResourcePresentationKind | null;
  compatibility: Record<ResourcePresentationKind, boolean>;
}

const noPresentationCompatibility = {
  image: false,
  document: false,
  link: false,
  "legal-citation": false,
  map: false,
  table: false,
} satisfies Record<ResourcePresentationKind, boolean>;

function resourcePresentationPolicy(resource: Resource): ResourcePresentationPolicy {
  return matchDiscriminated(resource, "kind", {
    text: () => ({ preferred: null, compatibility: noPresentationCompatibility }),
    remote: () => ({
      preferred: null,
      compatibility: { ...noPresentationCompatibility, link: true },
    }),
    spreadsheet: () => ({
      preferred: "table" as const,
      compatibility: { ...noPresentationCompatibility, table: true },
    }),
    geographic: () => ({
      preferred: "map" as const,
      compatibility: { ...noPresentationCompatibility, map: true },
    }),
    legalReference: () => ({
      preferred: "legal-citation" as const,
      compatibility: { ...noPresentationCompatibility, "legal-citation": true },
    }),
    document: (entry) => {
      const isImage = entry.mediaType === "image/jpeg" || entry.mediaType === "image/png";
      return {
        preferred: isImage ? ("image" as const) : ("document" as const),
        compatibility: { ...noPresentationCompatibility, image: isImage, document: true },
      };
    },
  });
}

/**
 * Preferred block presentation offered by the editor for a resource.
 * Inline references remain the default for text and web resources.
 */
export function preferredResourcePresentation(resource: Resource): ResourcePresentationKind | null {
  return resourcePresentationPolicy(resource).preferred;
}

/** Pure compatibility boundary shared by editor insertion, client rendering and PDF export. */
export function resourceSupportsPresentation(resource: Resource, presentation: ResourcePresentationKind): boolean {
  return resourcePresentationPolicy(resource).compatibility[presentation];
}
