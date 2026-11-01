import type { MinutesDetail } from "@hall/api-contract";
import type { CouncilDecisionDetail, MeetingNoticeFacts } from "@hall/contracts";
import type { HallSettings } from "@hall/domain";
import { matchLiteral } from "@hall/domain";
import { councilDecisionVoteTotals } from "./councilDecisionDocument.js";
import { examinedDeliberations } from "./deliberationListDocument.js";

export interface ResolvedSubjectText {
  text: string;
  source: "currentResource";
}

/** Ephemeral presentation input, never written back into the municipal record. */
export interface GeneratedTemplateData {
  dossier?: Record<string, unknown>;
  event?: Record<string, unknown>;
}

export function minutesTemplateData(minutes: MinutesDetail, subjects: ReadonlyMap<string, ResolvedSubjectText>) {
  return {
    id: minutes.id,
    facts: minutes.facts,
    meeting: { ...minutes.facts.meeting, reconvenedFrom: minutes.facts.meeting.reconvenedFrom ?? null },
    attendance: minutes.facts.attendance.map((entry) => ({
      ...entry,
      proxyHolder: minutes.facts.attendance.find((candidate) => candidate.id === entry.proxyHolderId)?.member ?? null,
    })),
    conduct: minutes.facts.conduct,
    points: minutes.facts.agenda.map((item) => {
      const ballot = minutes.facts.ballots.find((candidate) => candidate.agendaItemId === item.id);
      const total = (choice: "approve" | "reject" | "abstain" | "blank" | "invalid") =>
        ballot?.votes.filter((vote) => vote.choice === choice).reduce((sum, vote) => sum + vote.count, 0) ?? 0;
      const current = subjects.get(item.id);
      const subject = matchLiteral(item.kind, {
        minutesApproval: () => ({ text: "", source: "notApplicable" }),
        councilDecisionProposal: () => ({
          text: item.proposal ?? "",
          source: item.proposal === null ? "missing" : "closureSnapshot",
        }),
        openQuestion: () => ({ text: current?.text ?? "", source: current?.source ?? "missing" }),
      });
      return {
        id: item.id,
        number: item.agendaNumber,
        title: item.kind === "minutesApproval" ? "Arrêt du procès-verbal de la séance précédente" : item.title,
        kind: item.kind,
        introducedAt: item.introducedAt,
        completedAt: item.completedAt,
        adjournedAt: item.adjournedAt,
        subjectText: subject.text,
        subjectSource: subject.source,
        narrative: minutes.sections.find((section) => section.agendaItemId === item.id)?.content ?? "",
        quorumObservations: minutes.facts.conduct.quorumObservations.filter((entry) => entry.agendaItemId === item.id),
        recusals: minutes.facts.recusals.filter((entry) => entry.agendaItemId === item.id),
        closedSession: minutes.facts.conduct.closedSessions.some((entry) => entry.agendaItemIds.includes(item.id)),
        ballot: ballot
          ? {
              mode: ballot.mode,
              result: ballot.result,
              completedAt: ballot.completedAt,
              totals: {
                approve: total("approve"),
                reject: total("reject"),
                abstain: total("abstain"),
                blank: total("blank"),
                invalid: total("invalid"),
                nonParticipation: ballot.nonParticipations.reduce((sum, entry) => sum + entry.count, 0),
              },
            }
          : null,
      };
    }),
  };
}

export function documentTemplateData(input: {
  hall: HallSettings;
  meeting: unknown;
  notice: MeetingNoticeFacts | null;
  minutes: MinutesDetail | null;
  subjects: ReadonlyMap<string, ResolvedSubjectText>;
  decision: CouncilDecisionDetail | null;
  generated: { bodyMarkdown: string; subject: string | null; data?: GeneratedTemplateData } | null;
}) {
  return {
    hall: input.hall,
    meeting: input.meeting,
    notice: input.notice,
    minutes: input.minutes ? minutesTemplateData(input.minutes, input.subjects) : null,
    decision: input.decision ? { ...input.decision, totals: councilDecisionVoteTotals(input.decision.facts) } : null,
    deliberations: input.minutes ? examinedDeliberations(input.minutes.facts) : [],
    generated: input.generated,
    dossier: input.generated?.data?.dossier ?? null,
    event: input.generated?.data?.event ?? null,
  };
}
