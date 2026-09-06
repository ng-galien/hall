import type { MinutesDetail } from "@hall/api-contract";
import { matchLiteral } from "@hall/domain";
import { type MinutesSection, parse, renderHtml } from "@hall/templating";
import sanitizeHtml from "sanitize-html";

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const date = (value: string) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(
    new Date(value),
  );

function markdown(value: string): string {
  return sanitizeHtml(renderHtml(parse(value)), {
    allowedTags: sanitizeHtml.defaults.allowedTags,
    allowedAttributes: { a: ["href", "title"] },
  });
}

/** The printable facts come exclusively from the immutable closure snapshot. */
export function renderMinutesSections(minutes: MinutesDetail): Record<MinutesSection, string> {
  const { meeting, attendance, agenda, ballots } = minutes.facts;
  const rows = attendance.map((entry) => {
    const status = matchLiteral(entry.status, {
      present: () => "Présent",
      represented: () => "Représenté",
      excused: () => "Excusé",
      absent: () => "Absent",
    });
    const proxy = attendance.find((candidate) => candidate.id === entry.proxyHolderId);
    return `<li>${escapeHtml(entry.member.name)} - ${status}${proxy ? ` par ${escapeHtml(proxy.member.name)}` : ""}</li>`;
  });
  const subjects = agenda.map((item) => {
    const title = matchLiteral(item.kind, {
      minutesApproval: () => "Approbation du procès-verbal de la séance précédente",
      councilDecisionProposal: () => item.title,
      openQuestion: () => item.title,
    });
    const ballot = ballots.find((candidate) => candidate.agendaItemId === item.id);
    const votes = ballot?.votes ?? [];
    const total = (choice: "approve" | "reject" | "abstain") =>
      votes.filter((vote) => vote.choice === choice).reduce((sum, vote) => sum + vote.count, 0);
    const outcome = item.adjournedAt ? "Ajourné" : item.completedAt ? "Examiné" : "Non examiné";
    const result = !ballot?.completedAt
      ? "Non arrêté"
      : ballot.result === null
        ? "Sans décision"
        : matchLiteral(ballot.result, { approve: () => "Adopté", reject: () => "Rejeté" });
    const individual = ballot
      ? matchLiteral(ballot.mode, {
          secret: () => "",
          public: () =>
            `<ul>${votes.map((vote) => `<li>${escapeHtml(vote.member?.name ?? "Votant non renseigné")} : ${matchLiteral(vote.choice, { approve: () => "Pour", reject: () => "Contre", abstain: () => "Abstention" })}</li>`).join("")}</ul>`,
        })
      : "";
    const mode = ballot ? matchLiteral(ballot.mode, { public: () => "public", secret: () => "secret" }) : "";
    const section = minutes.sections.find((candidate) => candidate.agendaItemId === item.id);
    const discussion = section?.content.trim() ? `<h4>Discussion</h4>${markdown(section.content)}` : "";
    const status = ballot?.completedAt && !item.adjournedAt ? "" : `<p>${outcome}</p>`;
    return `<section><h3>${Math.abs(item.position)}. ${escapeHtml(title)}</h3>${status}${item.report ? `<h4>Rapport présenté</h4>${markdown(item.report)}` : ""}${item.proposal ? `<h4>Projet de délibération examiné</h4>${markdown(item.proposal)}` : ""}${discussion}${ballot ? `<h4>Scrutin ${mode}</h4><p>${result} · Pour : ${total("approve")} · Contre : ${total("reject")} · Abstentions : ${total("abstain")}</p>${individual}` : ""}</section>`;
  });
  return {
    facts: `<p>Séance n° ${meeting.number}<br>Ouverture : ${escapeHtml(date(meeting.startedAt))}<br>Clôture : ${escapeHtml(date(meeting.closedAt))}<br>Lieu : ${escapeHtml(meeting.location ?? "Non renseigné")}</p><p>Présidence : ${escapeHtml(meeting.chair?.name ?? "Non renseignée")}<br>Secrétariat : ${escapeHtml(meeting.secretary?.name ?? "Non renseigné")}<br>Quorum requis : ${meeting.quorum} · Présents : ${attendance.filter((entry) => entry.status === "present").length}</p><ul>${rows.join("")}</ul>`,
    proceedings: subjects.join(""),
  };
}
