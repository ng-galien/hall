import { defaultDocumentTemplates } from "@hall/domain";
import type { TranslationKey } from "../../i18n/en";
import type { TemplateInput } from "../../services/templatesApi";

const labels: Readonly<Record<string, TranslationKey>> = {
  "meeting-notice": "templates.type.meetingNotice",
  "meeting-notice-message": "templates.type.meetingNoticeMessage",
  minutes: "templates.type.minutes",
  "council-decision": "templates.type.councilDecision",
  "deliberation-list": "templates.type.deliberationList",
  "attendance-sheet": "templates.type.attendanceSheet",
  "proxy-form": "templates.type.proxyForm",
  "document-print": "templates.type.document-print",
  "meeting-dossier-cover": "templates.type.meeting-dossier-cover",
  "meeting-dossier-point": "templates.type.meeting-dossier-point",
  "event-invitation": "templates.type.event-invitation",
};

/** Creation uses the same Markdown/Jinja defaults as the seed and the configured instance. */
export const knownTemplateTypes = defaultDocumentTemplates.map(({ name: _name, ...starter }) => ({
  documentType: starter.documentType,
  kind: starter.kind,
  label: labels[starter.documentType]!,
  starter,
}));

export function templateTypeLabel(documentType: string, kind: TemplateInput["kind"]): TranslationKey | null {
  return knownTemplateTypes.find((entry) => entry.documentType === documentType && entry.kind === kind)?.label ?? null;
}
