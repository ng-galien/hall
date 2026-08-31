import type { CouncilBusiness, CouncilDecisionListEntry, CouncilMeeting, CouncilMember, Resource } from "@hall/domain";
import type { ReferenceKind } from "@hall/templating";
import { useMemo } from "react";
import type { SearchFolderOption, SearchTypeOption } from "../../components/search/SearchBox";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import type { Searchable } from "../../lib/search";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { useResourcesStore } from "../../stores/resourcesStore";
import { formatMeetingLabel } from "../council-meetings/meetingPresentation";

/* The searchable corpus per search scope: the workspace searches the documentary space
   (matters and resources), while the global palette and the editor search everything,
   members included. Every entity travels with its searchable fields and its source object. */

export type SearchScope = "workspace" | "global";

export type SearchEntityType = ReferenceKind;

export interface SearchHit extends Searchable {
  entity:
    | { entityKind: "councilBusiness"; business: CouncilBusiness }
    | { entityKind: "resource"; resource: Resource }
    | { entityKind: "meeting"; meeting: CouncilMeeting }
    | { entityKind: "decision"; decision: CouncilDecisionListEntry }
    | { entityKind: "member"; member: CouncilMember };
}

export const searchTypeLabelKeys: Record<SearchEntityType, TranslationKey> = {
  councilBusiness: "workspace.councilBusinessHeading",
  resource: "workspace.resourcesHeading",
  meeting: "navigation.meetings",
  decision: "navigation.decisions",
  member: "navigation.members",
};

export function useSearchCorpus(scope: SearchScope): SearchHit[] {
  const { t, formatDate } = useI18n();
  const { businesses } = useCouncilBusinessStore();
  const { resources } = useResourcesStore();
  const { meetings } = useCouncilMeetingsStore();
  const { councilDecisions } = useCouncilDecisionsStore();
  const members = useCouncilMembersStore((state) => state.members);

  return useMemo<SearchHit[]>(() => {
    const documentary: SearchHit[] = [
      ...businesses.map((business) => ({
        kind: "councilBusiness" as const,
        id: business.slug,
        label: business.title,
        extra: [business.report],
        folderPath: business.folderPath,
        entity: { entityKind: "councilBusiness" as const, business },
      })),
      ...resources.map((resource) => ({
        kind: "resource" as const,
        id: resource.slug,
        label: resource.title,
        extra: [...resource.tags, resource.kind === "document" ? resource.fileName : null],
        folderPath: resource.folderPath,
        tags: resource.tags,
        entity: { entityKind: "resource" as const, resource },
      })),
    ];
    if (scope === "workspace") return documentary;
    return [
      ...documentary,
      ...meetings.map((meeting) => ({
        kind: "meeting" as const,
        id: meeting.slug,
        label: formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate),
        extra: [meeting.location, meeting.number],
        state: meeting.status,
        entity: { entityKind: "meeting" as const, meeting },
      })),
      ...councilDecisions.map((decision) => ({
        kind: "decision" as const,
        id: decision.slug,
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

/** Type facet options with live counts over `hits` (the unfiltered corpus by default). */
export function useSearchTypeOptions(hits: readonly Searchable[]): SearchTypeOption[] {
  const { t } = useI18n();
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const hit of hits) counts.set(hit.kind, (counts.get(hit.kind) ?? 0) + 1);
    return (Object.keys(searchTypeLabelKeys) as SearchEntityType[])
      .map((value) => ({
        value,
        label: t(searchTypeLabelKeys[value]),
        count: counts.get(value) ?? 0,
      }))
      .filter((option) => option.count > 0);
  }, [hits, t]);
}

/** Tag facet options with counts over `hits`. */
export function useSearchTagOptions(hits: readonly Searchable[]): SearchFolderOption[] {
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const hit of hits) {
      for (const tag of hit.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "fr"))
      .map(([value, count]) => ({ value, count }));
  }, [hits]);
}

/** Folder facet options: every folder path present plus its ancestors, with cumulated counts. */
export function useSearchFolderOptions(hits: readonly Searchable[]): SearchFolderOption[] {
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const hit of hits) {
      if (!hit.folderPath) continue;
      const segments = hit.folderPath.split("/");
      for (let index = 1; index <= segments.length; index += 1) {
        const prefix = segments.slice(0, index).join("/");
        counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "fr"))
      .map(([value, count]) => ({ value, count }));
  }, [hits]);
}
