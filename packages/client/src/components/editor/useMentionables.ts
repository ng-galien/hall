import { useMemo } from "react";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { useResourcesStore } from "../../stores/resourcesStore";
import { useTopicsStore } from "../../stores/topicsStore";
import { resourceTone } from "../ResourceGlyph";
import type { Mentionable } from "./references";

/**
 * Les entités référençables de l'application, prêtes pour la recherche `@` de l'éditeur.
 *
 * Une seule source pour tous les établis : les stores déjà chargés. Les entités adressables
 * par slug le sont par slug dans les directives ; les membres n'en ont pas et gardent leur id.
 */
export function useMentionables(): Mentionable[] {
  const { members } = useCouncilMembersStore();
  const { resources } = useResourcesStore();
  const { topics } = useTopicsStore();
  const { meetings } = useCouncilMeetingsStore();
  const { councilDecisions } = useCouncilDecisionsStore();

  return useMemo(
    () => [
      ...members.map((member) => ({
        kind: "member" as const,
        id: member.id,
        label: `${member.firstName} ${member.lastName}`,
      })),
      ...resources.map((resource) => ({
        kind: "resource" as const,
        id: resource.slug,
        label: resource.title,
        folderPath: resource.folderPath,
        tone: resourceTone(resource),
        extra: resource.kind === "document" ? [resource.fileName] : [],
      })),
      ...topics.map((topic) => ({
        kind: "topic" as const,
        id: topic.slug,
        label: topic.title,
        folderPath: topic.folderPath,
        state: topic.state,
      })),
      ...meetings.map((meeting) => ({
        kind: "meeting" as const,
        id: meeting.slug,
        label: meeting.title,
        extra: [meeting.number],
      })),
      ...councilDecisions.map((decision) => ({
        kind: "decision" as const,
        id: decision.slug,
        label: decision.title,
        extra: [decision.number],
      })),
    ],
    [members, resources, topics, meetings, councilDecisions],
  );
}
