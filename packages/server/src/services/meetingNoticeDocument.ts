import type { MeetingNoticeFacts } from "@hall/domain";
import { matchLiteral } from "@hall/domain";
import type { PdfRenderInput } from "./documentRenderer.js";

const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// @functional-requirement HALL-FR-NOT-080 MEETING_NOTICE_IDENTIFIES_CONVENING_AUTHORITY_AND_AGENDA_QUESTIONS:
// The document names the mayor and questions; it does not prove an actual decision to convene.
/** Printed wording is presentation; the frozen questions remain occurrence data. */
export function renderMeetingNotice(facts: MeetingNoticeFacts): PdfRenderInput {
  const { meeting, hall } = facts;
  const scheduledAt = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full", timeStyle: "short", timeZone: hall.timeZone,
  }).format(new Date(meeting.scheduledAt));
  const agenda = meeting.agenda.map((item) => {
    const title = matchLiteral(item.kind, {
      minutesApproval: () => "Approbation du procès-verbal de la séance précédente",
      councilDecisionProposal: () => item.title,
      openQuestion: () => item.title,
    });
    return `<li value="${item.position}">${escapeHtml(title)}</li>`;
  }).join("");
  return {
    html: `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Convocation</title>
<style>body{font:12pt/1.6 Arial,sans-serif;color:#17242b}h1{font-size:23pt;margin:2em 0 1em}h2{font-size:16pt;margin-top:2em}li{margin:.7em 0}footer{margin-top:3em}</style></head><body>
<p>${escapeHtml(hall.name)}</p><h1>Convocation au conseil municipal</h1>
<p>Le maire convoque les membres du conseil municipal à la séance n° ${meeting.number}, qui se tiendra le <strong>${escapeHtml(scheduledAt)}</strong>, à <strong>${escapeHtml(meeting.location)}</strong>.</p>
<h2>Ordre du jour</h2><ol>${agenda}</ol><footer>Le maire</footer></body></html>`,
    headerHtml: "", footerHtml: "",
  };
}
