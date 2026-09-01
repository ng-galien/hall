import { type CouncilMeeting, matchDiscriminated, type ReferenceEntityKind } from "@hall/domain";
import { referenceKindPresentations } from "../../components/editor/referenceKindPresentation";
import type { TranslationKey } from "../../i18n/en";
import { resourceTone, toneLabelKeys } from "../documents/ResourceGlyph";
import {
  type ReferenceNavigationCatalog,
  type ReferenceOpenTarget,
  resolveReferenceEntity,
} from "./referenceNavigation";

export interface ResolvedReferencePresentation {
  label: string;
  tooltipKey: TranslationKey;
  open: ReferenceOpenTarget;
}

/** Resolves label, tooltip and navigation together so presentation cannot drift from the addressed entity. */
export function resolveReferencePresentation(
  kind: ReferenceEntityKind,
  id: string,
  catalog: ReferenceNavigationCatalog,
  formatMeeting: (meeting: CouncilMeeting) => string,
): ResolvedReferencePresentation | null {
  const resolved = resolveReferenceEntity(kind, id, catalog);
  if (!resolved) return null;
  return matchDiscriminated(resolved, "kind", {
    member: ({ entity, open }) => ({
      label: `${entity.firstName} ${entity.lastName}`,
      tooltipKey: referenceKindPresentations.member.labelKey,
      open,
    }),
    resource: ({ entity, open }) => ({
      label: entity.title,
      tooltipKey: toneLabelKeys[resourceTone(entity)],
      open,
    }),
    councilBusiness: ({ entity, open }) => ({
      label: entity.title,
      tooltipKey: referenceKindPresentations.councilBusiness.labelKey,
      open,
    }),
    meeting: ({ entity, open }) => ({
      label: formatMeeting(entity),
      tooltipKey: referenceKindPresentations.meeting.labelKey,
      open,
    }),
    decision: ({ entity, open }) => ({
      label: entity.title,
      tooltipKey: referenceKindPresentations.decision.labelKey,
      open,
    }),
  });
}
