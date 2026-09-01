import type {
  CouncilBusiness,
  CouncilDecisionListEntry,
  CouncilMeeting,
  CouncilMember,
  ReferenceEntityKind,
  Resource,
} from "@hall/domain";
import { useMemo } from "react";
import { type FacetOptionSets, facetOptionsFrom } from "../../components/search/facetSuggestions";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import type { Searchable, SearchableMedia, SearchableState } from "../../lib/search";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { useResourcesStore } from "../../stores/resourcesStore";
import { formatMeetingLabel } from "../council-meetings/meetingPresentation";
import { resourceTone } from "../documents/ResourceGlyph";
import { domainStatusKeys } from "../status/DomainStatusBadge";

/* The searchable corpus per search scope: the workspace searches the documentary space
   (matters and resources), while the global palette and the editor search everything,
   members included. Every entity travels with its searchable fields and its source object. */

export type SearchScope = "workspace" | "global";

export type SearchEntityType = ReferenceEntityKind;

type SearchHitFor<TKind extends SearchEntityType, TEntity> = Searchable<TKind> & { entity: TEntity };

/** A searchable row keeps its discriminant and source entity correlated by construction. */
export type SearchHit =
  | SearchHitFor<"councilBusiness", { entityKind: "councilBusiness"; business: CouncilBusiness }>
  | SearchHitFor<"resource", { entityKind: "resource"; resource: Resource }>
  | SearchHitFor<"meeting", { entityKind: "meeting"; meeting: CouncilMeeting }>
  | SearchHitFor<"decision", { entityKind: "decision"; decision: CouncilDecisionListEntry }>
  | SearchHitFor<"member", { entityKind: "member"; member: CouncilMember }>;

export type WorkspaceSearchHit = Extract<SearchHit, { kind: "councilBusiness" | "resource" }>;

export const searchTypeLabelKeys: Record<SearchEntityType, TranslationKey> = {
  councilBusiness: "workspace.councilBusinessHeading",
  resource: "workspace.resourcesHeading",
  meeting: "navigation.meetings",
  decision: "navigation.decisions",
  member: "navigation.members",
};

export function useSearchCorpus(scope: "workspace"): WorkspaceSearchHit[];
export function useSearchCorpus(scope: "global"): SearchHit[];
export function useSearchCorpus(scope: SearchScope): SearchHit[] {
  const { t, formatDate } = useI18n();
  const { businesses } = useCouncilBusinessStore();
  const { resources } = useResourcesStore();
  const { meetings } = useCouncilMeetingsStore();
  const { councilDecisions } = useCouncilDecisionsStore();
  const members = useCouncilMembersStore((state) => state.members);

  return useMemo<SearchHit[]>(() => {
    const documentary: WorkspaceSearchHit[] = [
      ...businesses.map((business) => ({
        kind: "councilBusiness" as const,
        id: business.id,
        label: business.title,
        extra: [business.report],
        folderPath: business.folderPath,
        entity: { entityKind: "councilBusiness" as const, business },
      })),
      ...resources.map((resource) => ({
        kind: "resource" as const,
        id: resource.id,
        label: resource.title,
        extra: [...resource.tags, resource.kind === "document" ? resource.fileName : null],
        folderPath: resource.folderPath,
        tags: resource.tags,
        media: resourceTone(resource) === "image" ? ("image" as const) : undefined,
        entity: { entityKind: "resource" as const, resource },
      })),
    ];
    if (scope === "workspace") return documentary;
    return [
      ...documentary,
      ...meetings.map((meeting) => ({
        kind: "meeting" as const,
        id: meeting.id,
        label: formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate),
        extra: [meeting.location, meeting.number],
        state: meeting.status,
        entity: { entityKind: "meeting" as const, meeting },
      })),
      ...councilDecisions.map((decision) => ({
        kind: "decision" as const,
        id: decision.id,
        label: decision.title,
        extra: [decision.number, decision.draftText],
        state: decision.status,
        entity: { entityKind: "decision" as const, decision },
      })),
      ...members.map((member) => ({
        kind: "member" as const,
        id: member.id,
        label: `${member.firstName} ${member.lastName}`,
        extra: [member.email, member.role],
        entity: { entityKind: "member" as const, member },
      })),
    ];
  }, [scope, businesses, resources, meetings, councilDecisions, members, t, formatDate]);
}

/** Facet options and counts derived once from the same searchable corpus. */
export function useSearchFacetOptions<TKind extends SearchEntityType>(
  hits: readonly Searchable<TKind>[],
): FacetOptionSets<TKind> {
  const { t } = useI18n();
  return useMemo(() => {
    const options = facetOptionsFrom(hits, (kind) => t(searchTypeLabelKeys[kind]), undefined, {
      state: (state: SearchableState) => t(domainStatusKeys[state]),
      media: (media: SearchableMedia) => (media === "image" ? t("workspace.type.image") : media),
    });
    return { ...options, types: options.types.filter((option) => option.count !== 0) };
  }, [hits, t]);
}
