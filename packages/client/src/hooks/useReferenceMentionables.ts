import { useMemo } from "react";
import type { Mentionable } from "../components/editor/references";
import { formatMeetingLabel } from "../features/council-meetings/meetingPresentation";
import { resourceTone, toneIcons, toneLabelKeys } from "../features/documents/ResourceGlyph";
import { useI18n } from "../i18n/I18nProvider";
import { useCouncilBusinessStore } from "../stores/councilBusinessStore";
import { useCouncilDecisionsStore } from "../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";
import { useCouncilMembersStore } from "../stores/councilMembersStore";
import { useResourcesStore } from "../stores/resourcesStore";

/**
 * Les entités référençables de l'application, prêtes pour la recherche `@` de l'éditeur.
 *
 * Une seule source pour tous les établis : les stores déjà chargés. Les entités adressables
 * par slug le sont par slug dans les directives ; les membres n'en ont pas et gardent leur id.
 */
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
        return {
          kind: "resource" as const,
          id: resource.slug,
          label: resource.title,
          folderPath: resource.folderPath,
          icon: toneIcons[tone],
          metaLabel: t(toneLabelKeys[tone]),
          extra: resource.kind === "document" ? [resource.fileName] : [],
        };
      }),
      ...businesses.map((business) => ({
        kind: "councilBusiness" as const,
        id: business.slug,
        label: business.title,
        folderPath: business.folderPath,
      })),
      ...meetings.map((meeting) => ({
        kind: "meeting" as const,
        id: meeting.slug,
        label: formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate),
        extra: [meeting.number],
      })),
      ...councilDecisions.map((decision) => ({
        kind: "decision" as const,
        id: decision.slug,
        label: decision.title,
        extra: [decision.number],
      })),
    ],
    [members, resources, businesses, meetings, councilDecisions, t, formatDate],
  );
}
