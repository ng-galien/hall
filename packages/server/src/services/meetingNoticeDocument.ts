import type { MeetingNoticeFacts } from "@hall/contracts";
import { matchLiteral } from "@hall/domain";

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// @functional-requirement HALL-FR-NOT-080 MEETING_NOTICE_IDENTIFIES_CONVENING_AUTHORITY_AND_AGENDA_QUESTIONS:
// The document names the mayor and questions; it does not prove an actual decision to convene.
/** Printed wording is presentation; the frozen questions remain occurrence data. */
export function renderMeetingNotice(facts: MeetingNoticeFacts): string {
  const { meeting, hall } = facts;
  const scheduledAt = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: hall.timeZone,
  }).format(new Date(meeting.scheduledAt));
  const agenda = meeting.agenda
    .map((item) => {
      const title = matchLiteral(item.kind, {
        minutesApproval: () => "Arrêt du procès-verbal de la séance précédente",
        councilDecisionProposal: () => item.title,
        openQuestion: () => item.title,
      });
      return `<li value="${item.agendaNumber}">${escapeHtml(title)}</li>`;
    })
    .join("");
  return `<p>${escapeHtml(hall.name)}</p><h1>Convocation au conseil municipal</h1>
${facts.issuedOn ? `<p>Date de convocation : ${escapeHtml(new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone: "UTC" }).format(new Date(`${facts.issuedOn}T12:00:00Z`)))}</p>` : ""}
<p>Le maire convoque les membres du conseil municipal à la séance n° ${meeting.number}, qui se tiendra le <strong>${escapeHtml(scheduledAt)}</strong>, à <strong>${escapeHtml(meeting.location)}</strong>.</p>
<h2>Ordre du jour</h2><ol>${agenda}</ol><footer>Le maire</footer>`;
}
