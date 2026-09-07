import type { AgendaSubject, PreparedCouncilSubject, SchedulePreparedCouncilSubject } from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import { GavelIcon, InfoIcon, QuoteIcon, TextDocumentIcon } from "../../components/icons";
import type { TranslationKey } from "../../i18n/en";

export const agendaSubjectPresentation = {
  minutesApproval: { icon: TextDocumentIcon, label: "agendaSubject.minutesApproval", voted: true },
  councilDecisionProposal: { icon: GavelIcon, label: "agendaSubject.councilDecisionProposal", voted: true },
  businessConsultation: { icon: InfoIcon, label: "agendaSubject.businessConsultation", voted: false },
  openQuestion: { icon: QuoteIcon, label: "agendaSubject.openQuestion", voted: false },
} satisfies Record<AgendaSubject["kind"], { icon: typeof GavelIcon; label: TranslationKey; voted: boolean }>;

export function AgendaSubjectGlyph({ kind }: { kind: AgendaSubject["kind"] }) {
  const Icon = agendaSubjectPresentation[kind].icon;
  return <span className="composer-subject-glyph" aria-hidden="true"><Icon /></span>;
}

export function agendaSubjectTextResource(subject: AgendaSubject): string | null {
  return matchDiscriminated(subject, "kind", {
    minutesApproval: () => null,
    councilDecisionProposal: (project) => project.textResourceId,
    openQuestion: (question) => question.textResourceId,
    businessConsultation: () => null,
  });
}

/** Preserve the candidate's real identity and source; a consultation has no separate subject or text. */
export function preparedSubjectPresentation(subject: PreparedCouncilSubject, position: number): {
  key: string; previewResourceId: string; command: SchedulePreparedCouncilSubject;
} {
  return matchDiscriminated(subject, "kind", {
    councilDecisionProposal: (project) => ({ key: project.id, previewResourceId: project.textResourceId, command: { kind: project.kind, subjectId: project.id, position } }),
    openQuestion: (question) => ({ key: question.id, previewResourceId: question.textResourceId, command: { kind: question.kind, subjectId: question.id, position } }),
    businessConsultation: (consultation) => ({ key: `consultation-${consultation.councilBusinessId}`, previewResourceId: consultation.reportResourceId, command: { kind: consultation.kind, councilBusinessId: consultation.councilBusinessId, position } }),
  });
}
