import type { Contact, CouncilDecisionSummary } from "@hall/api-contract";
import type { CouncilMember, ReferenceEntityKind } from "@hall/domain";
import { useMemo } from "react";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import type { Searchable } from "../../lib/search";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import type { CouncilMeetingView } from "../../models/councilMeeting";
import { useContactsStore } from "../../stores/contactsStore";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { formatMeetingLabel } from "../council-meetings/meetingPresentation";
import { type DocumentaryLeafSummary, documentaryResourceTone } from "../documents/DocumentaryResourceGlyph";

/* The searchable corpus per search scope: the workspace searches the documentary space
   (matters and resources), while the global palette and the editor search everything,
   members included. Every entity travels with its searchable fields and its source object. */

export type SearchScope = "workspace" | "global";

export type SearchEntityType = ReferenceEntityKind;

type SearchHitFor<TKind extends SearchEntityType, TEntity> = Searchable<TKind> & { entity: TEntity };

/** A searchable row keeps its discriminant and source entity correlated by construction. */
export type SearchHit =
  | SearchHitFor<"councilBusiness", { entityKind: "councilBusiness"; business: CouncilBusinessView }>
  | SearchHitFor<"resource", { entityKind: "resource"; resource: DocumentaryLeafSummary }>
  | SearchHitFor<"meeting", { entityKind: "meeting"; meeting: CouncilMeetingView }>
  | SearchHitFor<"decision", { entityKind: "decision"; decision: CouncilDecisionSummary }>
  | SearchHitFor<"member", { entityKind: "member"; member: CouncilMember }>
  | SearchHitFor<"contact", { entityKind: "contact"; contact: Contact }>;

export type WorkspaceSearchHit = Extract<SearchHit, { kind: "councilBusiness" | "resource" }>;

export const searchTypeLabelKeys: Record<SearchEntityType, TranslationKey> = {
  councilBusiness: "workspace.councilBusinessHeading",
  resource: "workspace.resourcesHeading",
  meeting: "navigation.meetings",
  decision: "navigation.decisions",
  member: "navigation.members",
  contact: "navigation.contacts",
};

export function useSearchCorpus(scope: "workspace"): WorkspaceSearchHit[];
export function useSearchCorpus(scope: "global"): SearchHit[];
export function useSearchCorpus(scope: SearchScope): SearchHit[] {
  const { t, formatDate } = useI18n();
  const { businesses } = useCouncilBusinessStore();
  const resourceSummaries = useWorkspaceResourcesStore((state) => state.summaries);
  const resources = useMemo(
    () =>
      [
        ...new Map(
          [...businesses.flatMap((business) => business.resources), ...Object.values(resourceSummaries)].map(
            (resource) => [resource.id, resource],
          ),
        ).values(),
      ].filter((resource): resource is DocumentaryLeafSummary => resource.kind !== "folder"),
    [resourceSummaries, businesses],
  );
  const { meetings } = useCouncilMeetingsStore();
  const { councilDecisions } = useCouncilDecisionsStore();
  const members = useCouncilMembersStore((state) => state.members);
  const contacts = useContactsStore((state) => state.contacts);

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
        resourceKind: resource.kind,
        id: resource.id,
        label: resource.name,
        extra: [...resource.tags, resource.kind === "document" ? resource.binary.mediaType : null],
        folderPath: resource.path,
        tags: resource.tags,
        media: documentaryResourceTone(resource) === "image" ? ("image" as const) : undefined,
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
        extra: [meeting.location, String(meeting.number)],
        state: meeting.phase,
        entity: { entityKind: "meeting" as const, meeting },
      })),
      ...councilDecisions.map((decision) => ({
        kind: "decision" as const,
        id: decision.id,
        label: decision.title,
        extra: [decision.number],
        state: decision.state,
        entity: { entityKind: "decision" as const, decision },
      })),
      ...members.map((member) => ({
        kind: "member" as const,
        id: member.id,
        label: `${member.contact.firstName} ${member.contact.lastName}`,
        extra: [member.contact.email, member.role],
        entity: { entityKind: "member" as const, member },
      })),
      ...contacts.map((contact) => ({
        kind: "contact" as const,
        id: contact.id,
        label: `${contact.firstName} ${contact.lastName}`,
        extra: [contact.organizationName, contact.jobTitle, contact.email, contact.phone],
        entity: { entityKind: "contact" as const, contact },
      })),
    ];
  }, [scope, businesses, resources, meetings, councilDecisions, members, contacts, t, formatDate]);
}
