import { matchDiscriminated, type Resource } from "@hall/domain";
import type { ResourcePresentationKind } from "@hall/templating";
import { useMemo } from "react";
import type { Mentionable } from "../components/editor/references";
import { formatMeetingLabel } from "../features/council-meetings/meetingPresentation";
import { resourceTone, toneIcons, toneLabelKeys } from "../features/documents/ResourceGlyph";
import { imagePresentationTitle } from "../features/documents/useResourceImageUpload";
import { useI18n } from "../i18n/I18nProvider";
import { useCouncilBusinessStore } from "../stores/councilBusinessStore";
import { useCouncilDecisionsStore } from "../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";
import { useCouncilMembersStore } from "../stores/councilMembersStore";
import { useResourcesStore } from "../stores/resourcesStore";

function resourcePresentation(resource: Resource): ResourcePresentationKind | undefined {
  return matchDiscriminated(resource, "kind", {
    text: () => undefined,
    remote: () => undefined,
    spreadsheet: () => "table" as const,
    geographic: () => "map" as const,
    legalReference: () => "legal-citation" as const,
    document: (entry) => (resourceTone(entry) === "image" ? ("image" as const) : ("document" as const)),
  });
}

/** Mentionable entities for the editor `@` search; each carries the immutable entity id, never the slug. */
export function useReferenceMentionables(): Mentionable[] {
  const { t, formatDate } = useI18n();
  const { members } = useCouncilMembersStore();
  const { resources } = useResourcesStore();
  const { businesses } = useCouncilBusinessStore();
  const { meetings } = useCouncilMeetingsStore();
  const { councilDecisions } = useCouncilDecisionsStore();

  return useMemo(
    () => [
      ...members.map((member) => ({
        kind: "member" as const,
        id: member.id,
        label: `${member.firstName} ${member.lastName}`,
      })),
      ...resources.map((resource) => {
        const tone = resourceTone(resource);
        const isImage = resource.kind === "document" && tone === "image";
        return {
          kind: "resource" as const,
          id: resource.id,
          label: isImage
            ? imagePresentationTitle(resource.title, resource.fileName, t("editor.imageImported"))
            : resource.title,
          folderPath: resource.folderPath,
          tags: resource.tags,
          media: isImage ? ("image" as const) : undefined,
          resourcePresentation: resourcePresentation(resource),
          icon: toneIcons[tone],
          metaLabel: isImage ? `${t(toneLabelKeys[tone])} · ${resource.format.toUpperCase()}` : t(toneLabelKeys[tone]),
          extra: resource.kind === "document" ? [resource.fileName, resource.format] : [],
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
        extra: [meeting.number],
      })),
      ...councilDecisions.map((decision) => ({
        kind: "decision" as const,
        id: decision.id,
        label: decision.title,
        extra: [decision.number],
      })),
    ],
    [members, resources, businesses, meetings, councilDecisions, t, formatDate],
  );
}
