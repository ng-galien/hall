import { type ReferenceEntityKind, referenceEntityKinds } from "@hall/domain";
import type { TranslationKey } from "../../i18n/en";
import { CalendarIcon, FileIcon, GavelIcon, MemberIcon, TextDocumentIcon } from "../icons";

export interface ReferenceKindPresentation {
  labelKey: TranslationKey;
  groupLabelKey: TranslationKey;
  icon: typeof MemberIcon;
}

/** One client presentation catalog for every entity kind addressable by an internal reference. */
export const referenceKindPresentations: Record<ReferenceEntityKind, ReferenceKindPresentation> = {
  member: { labelKey: "editor.kind.member", groupLabelKey: "editor.group.member", icon: MemberIcon },
  resource: { labelKey: "editor.kind.resource", groupLabelKey: "editor.group.resource", icon: FileIcon },
  councilBusiness: {
    labelKey: "editor.kind.councilBusiness",
    groupLabelKey: "editor.group.councilBusiness",
    icon: TextDocumentIcon,
  },
  decision: { labelKey: "editor.kind.decision", groupLabelKey: "editor.group.decision", icon: GavelIcon },
  meeting: { labelKey: "editor.kind.meeting", groupLabelKey: "editor.group.meeting", icon: CalendarIcon },
};

const referenceEntityKindSet = new Set<string>(referenceEntityKinds);

/** Runtime guard for persisted TipTap/HTML attributes crossing into the typed client. */
export function isReferenceEntityKind(value: unknown): value is ReferenceEntityKind {
  return typeof value === "string" && referenceEntityKindSet.has(value);
}
