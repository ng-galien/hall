import {
  type Contact,
  type CouncilBusiness,
  type CouncilDecisionListEntry,
  type CouncilMeeting,
  type CouncilMember,
  matchLiteral,
  type ReferenceEntityKind,
  type Resource,
} from "@hall/domain";

export type ReferenceOpenTarget = { kind: "resourcePreview"; resourceId: string } | { kind: "route"; href: string };

export interface ReferenceNavigationCatalog {
  resources: readonly Resource[];
  businesses: readonly CouncilBusiness[];
  decisions: readonly CouncilDecisionListEntry[];
  meetings: readonly CouncilMeeting[];
  members: readonly CouncilMember[];
  contacts: readonly Contact[];
}

export type ResolvedReferenceEntity =
  | { kind: "member"; entity: CouncilMember; open: ReferenceOpenTarget }
  | { kind: "contact"; entity: Contact; open: ReferenceOpenTarget }
  | { kind: "resource"; entity: Resource; open: ReferenceOpenTarget }
  | { kind: "councilBusiness"; entity: CouncilBusiness; open: ReferenceOpenTarget }
  | { kind: "meeting"; entity: CouncilMeeting; open: ReferenceOpenTarget }
  | { kind: "decision"; entity: CouncilDecisionListEntry; open: ReferenceOpenTarget };

export function councilBusinessHref(business: Pick<CouncilBusiness, "id" | "folderPath">): string {
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
        ? { kind: "meeting" as const, entity, open: { kind: "route" as const, href: `/meetings/${entity.slug}` } }
        : null;
    },
    decision: () => {
      const entity = catalog.decisions.find((candidate) => candidate.id === id);
      if (!entity) return null;
      const carrier = catalog.businesses.find(
        (candidate) => candidate.kind === "matter" && candidate.councilDecisionId === id,
      );
      return {
        kind: "decision" as const,
        entity,
        open: { kind: "route" as const, href: carrier ? councilBusinessHref(carrier) : "/council-decisions" },
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
