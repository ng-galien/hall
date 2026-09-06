import type { Contact } from "@hall/api-contract";
import {
  type CouncilDecisionListEntry,
  type CouncilMember,
  matchLiteral,
  type ReferenceEntityKind,
  type Resource,
} from "@hall/domain";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import type { CouncilMeetingView } from "../../models/councilMeeting";

export type ReferenceOpenTarget = { kind: "resourcePreview"; resourceId: string } | { kind: "route"; href: string };

export interface ReferenceNavigationCatalog {
  resources: readonly Resource[];
  businesses: readonly CouncilBusinessView[];
  decisions: readonly CouncilDecisionListEntry[];
  meetings: readonly CouncilMeetingView[];
  members: readonly CouncilMember[];
  contacts: readonly Contact[];
}

export type ResolvedReferenceEntity =
  | { kind: "member"; entity: CouncilMember; open: ReferenceOpenTarget }
  | { kind: "contact"; entity: Contact; open: ReferenceOpenTarget }
  | { kind: "resource"; entity: Resource; open: ReferenceOpenTarget }
  | { kind: "councilBusiness"; entity: CouncilBusinessView; open: ReferenceOpenTarget }
  | { kind: "meeting"; entity: CouncilMeetingView; open: ReferenceOpenTarget }
  | { kind: "decision"; entity: CouncilDecisionListEntry; open: ReferenceOpenTarget };

export function councilBusinessHref(business: Pick<CouncilBusinessView, "id" | "folderPath">): string {
  const parameters = new URLSearchParams();
  if (business.folderPath) parameters.set("path", business.folderPath);
  parameters.set("councilBusiness", business.id);
  return `/workspace?${parameters.toString()}`;
}

export function resolveReferenceEntity(
  kind: ReferenceEntityKind,
  id: string,
  catalog: ReferenceNavigationCatalog,
): ResolvedReferenceEntity | null {
  return matchLiteral(kind, {
    member: () => {
      const entity = catalog.members.find((candidate) => candidate.id === id);
      return entity
        ? { kind: "member" as const, entity, open: { kind: "route" as const, href: `/council-members/${id}` } }
        : null;
    },
    contact: () => {
      const entity = catalog.contacts.find((candidate) => candidate.id === id);
      return entity
        ? { kind: "contact" as const, entity, open: { kind: "route" as const, href: `/contacts/${id}` } }
        : null;
    },
    resource: () => {
      const entity = catalog.resources.find((candidate) => candidate.id === id);
      return entity
        ? { kind: "resource" as const, entity, open: { kind: "resourcePreview" as const, resourceId: id } }
        : null;
    },
    councilBusiness: () => {
      const entity = catalog.businesses.find((candidate) => candidate.id === id);
      return entity
        ? {
            kind: "councilBusiness" as const,
            entity,
            open: { kind: "route" as const, href: councilBusinessHref(entity) },
          }
        : null;
    },
    meeting: () => {
      const entity = catalog.meetings.find((candidate) => candidate.id === id);
      return entity
        ? {
            kind: "meeting" as const,
            entity,
            open: { kind: "route" as const, href: `/meetings/${entity.reference}` },
          }
        : null;
    },
    decision: () => {
      const entity = catalog.decisions.find((candidate) => candidate.id === id);
      if (!entity) return null;
      return {
        kind: "decision" as const,
        entity,
        open: { kind: "route" as const, href: "/council-decisions" },
      };
    },
  });
}

/** Canonical navigation semantics for every entity addressable by an editor reference. */
export function referenceOpenTarget(
  kind: ReferenceEntityKind,
  id: string,
  catalog: ReferenceNavigationCatalog,
): ReferenceOpenTarget | null {
  return resolveReferenceEntity(kind, id, catalog)?.open ?? null;
}
