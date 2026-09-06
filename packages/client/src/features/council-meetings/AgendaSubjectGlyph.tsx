import type { AgendaSubject } from "@hall/api-contract";
import { GavelIcon, QuoteIcon, TextDocumentIcon } from "../../components/icons";
import type { TranslationKey } from "../../i18n/en";

export const agendaSubjectPresentation = {
  minutesApproval: { icon: TextDocumentIcon, label: "agendaSubject.minutesApproval", voted: true },
  councilDecisionProposal: { icon: GavelIcon, label: "agendaSubject.councilDecisionProposal", voted: true },
  openQuestion: { icon: QuoteIcon, label: "agendaSubject.openQuestion", voted: false },
} satisfies Record<AgendaSubject["kind"], { icon: typeof GavelIcon; label: TranslationKey; voted: boolean }>;

export function AgendaSubjectGlyph({ kind }: { kind: AgendaSubject["kind"] }) {
  const Icon = agendaSubjectPresentation[kind].icon;
  return <span className="composer-subject-glyph" aria-hidden="true"><Icon /></span>;
}
