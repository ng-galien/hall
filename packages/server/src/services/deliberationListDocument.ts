import type { MinutesFacts } from "@hall/api-contract";
import { matchLiteral } from "@hall/domain";

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

type DeliberationOutcome = "adopted" | "rejected" | "withoutVote";

/** The agenda items examined in the meeting, in agenda order, with the outcome of their ballot. */
export function examinedDeliberations(facts: MinutesFacts) {
  return facts.agenda
    .filter((item) => item.completedAt !== null && item.adjournedAt === null)
    .toSorted((left, right) => left.position - right.position)
    .map((item) => {
      const ballot = facts.ballots.filter((entry) => entry.agendaItemId === item.id && entry.result !== null).at(-1);
      const outcome: DeliberationOutcome = !ballot
        ? "withoutVote"
        : ballot.result === "approve"
          ? "adopted"
          : "rejected";
      return {
        agendaNumber: item.agendaNumber,
        title: matchLiteral(item.kind, {
          minutesApproval: () => "Arrêt du procès-verbal de la séance précédente",
          councilDecisionProposal: () => item.title,
          openQuestion: () => item.title,
        }),
        outcome,
      };
    });
}

// @implements-requirement HALL-FR-MIN-270
/** The list of deliberations examined in a closed meeting; displaying and publishing it remain town hall acts. */
export function renderDeliberationList(facts: MinutesFacts, hall: { name: string; timeZone: string }): string {
  const meetingDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: hall.timeZone }).format(
    new Date(facts.meeting.startedAt),
  );
  const rows = examinedDeliberations(facts)
    .map(
      (entry) =>
        `<tr><td>${escapeHtml(String(entry.agendaNumber))}</td><td>${escapeHtml(entry.title)}</td><td>${matchLiteral(
          entry.outcome,
          { adopted: () => "Adoptée", rejected: () => "Rejetée", withoutVote: () => "Sans vote" },
        )}</td></tr>`,
    )
    .join("");
  return `<section class="deliberation-list"><p>${escapeHtml(hall.name)}</p>
<h1>Liste des délibérations examinées</h1>
<p>Séance du conseil municipal n° ${facts.meeting.number} du ${escapeHtml(meetingDate)}</p>
<table><thead><tr><th>N°</th><th>Point examiné</th><th>Sort</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}
