import type { AgendaSubject, PreparedCouncilSubject, SchedulePreparedCouncilSubject } from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import { GavelIcon, QuoteIcon, TextDocumentIcon } from "../../components/icons";
import type { TranslationKey } from "../../i18n/en";

export const agendaSubjectPresentation = {
  minutesApproval: { icon: TextDocumentIcon, label: "agendaSubject.minutesApproval", voted: true },
  councilDecisionProposal: { icon: GavelIcon, label: "agendaSubject.councilDecisionProposal", voted: true },
  openQuestion: { icon: QuoteIcon, label: "agendaSubject.openQuestion", voted: false },
} satisfies Record<AgendaSubject["kind"], { icon: typeof GavelIcon; label: TranslationKey; voted: boolean }>;

export function AgendaSubjectGlyph({ kind, tree = false }: { kind: AgendaSubject["kind"]; tree?: boolean }) {
  const Icon = agendaSubjectPresentation[kind].icon;
  return <span className={tree ? "workspace-glyph" : "composer-subject-glyph"} aria-hidden="true"><Icon /></span>;
}

export function agendaSubjectTextResource(subject: AgendaSubject): string | null {
  return matchDiscriminated(subject, "kind", {
    minutesApproval: () => null,
    councilDecisionProposal: (project) => project.textResourceId,
    openQuestion: (question) => question.textResourceId,
  });
}

/** Preserve each prepared subject's identity and text resource. */
export function preparedSubjectPresentation(subject: PreparedCouncilSubject, position: number): {
  key: string; previewResourceId: string; command: SchedulePreparedCouncilSubject;
} {
  return matchDiscriminated(subject, "kind", {
    councilDecisionProposal: (project) => ({ key: project.id, previewResourceId: project.textResourceId, command: { kind: project.kind, subjectId: project.id, position } }),
    openQuestion: (question) => ({ key: question.id, previewResourceId: question.textResourceId, command: { kind: question.kind, subjectId: question.id, position } }),
  });
}
