import { matchDiscriminated } from "@hall/domain";
import { preferredResourcePresentation } from "@hall/templating";
import { createContext, useContext, useMemo } from "react";
import type { Mentionable } from "../components/editor/references";
import {
  type DocumentaryLeafSummary,
  documentaryResourceDate,
  documentaryResourceTone,
} from "../features/documents/DocumentaryResourceGlyph";
import { toneIcons, toneLabelKeys } from "../features/documents/ResourceGlyph";
import { type SearchHit, useSearchCorpus } from "../features/search/searchCorpus";
import { domainStatusKeys } from "../features/status/DomainStatusBadge";
import { useI18n } from "../i18n/I18nProvider";

export const ReferenceBusinessContext = createContext<string | undefined>(undefined);

export function resourceMentionable(resource: DocumentaryLeafSummary, t: ReturnType<typeof useI18n>["t"]): Mentionable {
  const tone = documentaryResourceTone(resource);
  return {
    kind: "resource",
    resourceKind: resource.kind,
    id: resource.id,
    label: resource.name,
    folderPath: resource.path,
    tags: resource.tags,
    icon: toneIcons[tone],
    tone,
    updatedAt: documentaryResourceDate(resource).value,
    metaLabel: t(toneLabelKeys[tone]),
    media: tone === "image" ? "image" : undefined,
    resourcePresentation:
      preferredResourcePresentation(
        resource.kind === "document" ? { kind: resource.kind, mediaType: resource.binary.mediaType } : resource,
      ) ?? undefined,
  };
}

export function hitMentionable(hit: SearchHit, t: ReturnType<typeof useI18n>["t"]): Mentionable {
  return matchDiscriminated(hit.entity, "entityKind", {
    resource: ({ resource }) => resourceMentionable(resource, t),
    councilBusiness: ({ business }) => ({ ...hit, updatedAt: business.updatedAt }),
    meeting: ({ meeting }) => ({ ...hit, stateLabel: t(domainStatusKeys[meeting.phase]) }),
    decision: ({ decision }) => ({
      ...hit,
      stateLabel: t(decision.state === "draft" ? "decisionDocument.draft" : "decisionDocument.frozen"),
    }),
    contact: ({ contact }) => ({
      ...hit,
      metaLabel: contact.organizationName ?? contact.jobTitle ?? t("editor.kind.contact"),
    }),
    member: ({ member }) => ({ ...hit, metaLabel: t(`role.${member.role}`) }),
  });
}

/** The editor is a projection of the canonical corpus, never another catalogue. */
// @implements-requirement HALL-FR-SRC-030
export function useReferenceMentionables(businessId?: string): Mentionable[] {
  const inherited = useContext(ReferenceBusinessContext);
  const currentBusinessId = businessId ?? inherited;
  const corpus = useSearchCorpus("global");
  const { t } = useI18n();
  return useMemo(() => {
    const business = corpus.find((hit) => hit.kind === "councilBusiness" && hit.id === currentBusinessId);
    const preferred = new Set(
      business?.entity.entityKind === "councilBusiness"
        ? business.entity.business.resources.map((resource) => resource.id)
        : [],
    );
    return corpus.map((hit) => ({
      ...hitMentionable(hit, t),
      preferred: hit.kind === "resource" && preferred.has(hit.id),
    }));
  }, [corpus, currentBusinessId, t]);
}
