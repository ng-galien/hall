import type { ResourceSummary } from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import type { ResourcePresentationKind } from "@hall/templating";
import { useMemo } from "react";
import type { Mentionable } from "../components/editor/references";
import { formatMeetingLabel } from "../features/council-meetings/meetingPresentation";
import { type DocumentaryLeafSummary, documentaryResourceTone } from "../features/documents/DocumentaryResourceGlyph";
import { toneIcons, toneLabelKeys } from "../features/documents/ResourceGlyph";
import { imagePresentationTitle } from "../features/documents/useResourceImageUpload";
import { domainStatusKeys } from "../features/status/DomainStatusBadge";
import { useI18n } from "../i18n/I18nProvider";
import { useContactsStore } from "../stores/contactsStore";
import { useCouncilBusinessStore } from "../stores/councilBusinessStore";
import { useCouncilDecisionsStore } from "../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";
import { useCouncilMembersStore } from "../stores/councilMembersStore";
import { useWorkspaceResourcesStore } from "../stores/workspaceResourcesStore";

function preferredDocumentaryPresentation(resource: DocumentaryLeafSummary): ResourcePresentationKind | undefined {
  return matchDiscriminated(resource, "kind", {
    text: () => undefined,
    remote: () => undefined,
    spreadsheet: () => "table" as const,
    geographic: () => "map" as const,
    event: () => undefined,
    legalReference: () => "legal-citation" as const,
    document: (entry) =>
      entry.binary.mediaType === "image/jpeg" || entry.binary.mediaType === "image/png"
        ? ("image" as const)
        : ("document" as const),
  });
}

function documentaryLeaves(summaries: Record<string, ResourceSummary>): DocumentaryLeafSummary[] {
  return Object.values(summaries).filter((resource): resource is DocumentaryLeafSummary => resource.kind !== "folder");
}

/** Mentionable entities for the editor `@` search; each carries the immutable entity id, never the slug. */
export function useReferenceMentionables(): Mentionable[] {
  const { t, formatDate } = useI18n();
  const { members } = useCouncilMembersStore();
  const { contacts } = useContactsStore();
  const resourceSummaries = useWorkspaceResourcesStore((state) => state.summaries);
  const resources = useMemo(() => documentaryLeaves(resourceSummaries), [resourceSummaries]);
  const { businesses } = useCouncilBusinessStore();
  const { meetings } = useCouncilMeetingsStore();
  const { councilDecisions } = useCouncilDecisionsStore();

  return useMemo(
    () => [
      ...members.map((member) => ({
        kind: "member" as const,
        id: member.id,
        label: `${member.contact.firstName} ${member.contact.lastName}`,
        metaLabel: t(`role.${member.role}`),
      })),
      ...contacts.map((contact) => ({
        kind: "contact" as const,
        id: contact.id,
        label: `${contact.firstName} ${contact.lastName}`,
        metaLabel: contact.organizationName ?? contact.jobTitle ?? t("editor.kind.contact"),
        extra: [contact.organizationName, contact.jobTitle, contact.email, contact.phone],
      })),
      ...resources.map((resource) => {
        const tone = documentaryResourceTone(resource);
        const isImage = resource.kind === "document" && tone === "image";
        const typeLabel = t(toneLabelKeys[tone]);
        return {
          kind: "resource" as const,
          id: resource.id,
          label: isImage
            ? imagePresentationTitle(resource.name, resource.name, t("editor.imageImported"))
            : resource.name,
          folderPath: resource.path,
          tags: resource.tags,
          media: isImage ? ("image" as const) : undefined,
          mediaLabel: isImage ? t("workspace.type.image") : undefined,
          resourcePresentation: preferredDocumentaryPresentation(resource),
          icon: toneIcons[tone],
          metaLabel: isImage ? `${typeLabel} · ${resource.binary.mediaType}` : typeLabel,
          extra: resource.kind === "document" ? [resource.name, resource.binary.mediaType, typeLabel] : [typeLabel],
        };
      }),
      ...businesses.map((business) => ({
        kind: "councilBusiness" as const,
        id: business.id,
        label: business.title,
        folderPath: business.folderPath,
      })),
      ...meetings.map((meeting) => ({
        kind: "meeting" as const,
        id: meeting.id,
        label: formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate),
        extra: [String(meeting.number)],
        state: meeting.phase,
        stateLabel: t(domainStatusKeys[meeting.phase]),
      })),
      ...councilDecisions.map((decision) => ({
        kind: "decision" as const,
        id: decision.id,
        label: decision.title,
        extra: [decision.number],
        state: decision.state,
        stateLabel: t(decision.state === "draft" ? "decisionDocument.draft" : "decisionDocument.frozen"),
      })),
    ],
    [members, contacts, resources, businesses, meetings, councilDecisions, t, formatDate],
  );
}
