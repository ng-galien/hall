import { matchDiscriminated, type Resource } from "@hall/domain";
import type { ResourcePresentationKind } from "./grammar.js";

type ResourcePresentationSource = {
  [Kind in Resource["kind"] | "event"]: Kind extends "document" ? { kind: Kind; mediaType: string } : { kind: Kind };
}[Resource["kind"] | "event"];

interface ResourcePresentationPolicy {
  preferred: ResourcePresentationKind | null;
  compatibility: Record<ResourcePresentationKind, boolean>;
}

const noPresentationCompatibility = {
  text: false,
  event: false,
  image: false,
  document: false,
  link: false,
  "legal-citation": false,
  map: false,
  table: false,
} satisfies Record<ResourcePresentationKind, boolean>;

function resourcePresentationPolicy(resource: ResourcePresentationSource): ResourcePresentationPolicy {
  return matchDiscriminated(resource, "kind", {
    event: () => ({ preferred: "event" as const, compatibility: { ...noPresentationCompatibility, event: true } }),
    text: () => ({ preferred: "text" as const, compatibility: { ...noPresentationCompatibility, text: true } }),
    remote: () => ({
      preferred: "link" as const,
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
    geographicLayer: () => ({ preferred: null, compatibility: noPresentationCompatibility }),
    document: (entry) => {
      const isImage = entry.mediaType === "image/jpeg" || entry.mediaType === "image/png";
      return {
        preferred: isImage ? ("image" as const) : entry.mediaType === "application/pdf" ? null : ("document" as const),
        compatibility: { ...noPresentationCompatibility, image: isImage, document: true },
      };
    },
  });
}

/**
 * Preferred block presentation offered by the editor for a resource.
 * Resource insertion uses the same presentation in every editor.
 */
// @implements-requirement HALL-FR-SRC-030
export function preferredResourcePresentation(resource: ResourcePresentationSource): ResourcePresentationKind | null {
  return resourcePresentationPolicy(resource).preferred;
}

/** Pure compatibility boundary shared by editor insertion, client rendering and PDF export. */
export function resourceSupportsPresentation(resource: Resource, presentation: ResourcePresentationKind): boolean {
  return resourcePresentationPolicy(resource).compatibility[presentation];
}
