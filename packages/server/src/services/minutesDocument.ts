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

type OfficerChange = MinutesDetail["facts"]["conduct"]["officerChanges"][number];

// @implements-requirement HALL-FR-MIN-260
function officerChange(change: OfficerChange): string {
  const office = matchLiteral(change.office, {
    chair: () => "présidence confiée",
    secretary: () => "secrétariat confié",
  });
  const basis = matchLiteral(change.basis, {
    mayor: () => "reprise par le maire",
    deputyInNominationOrder: () => "adjoint dans l’ordre des nominations",
    councilDesignation: () => "désignation par le conseil",
    councilNomination: () => "nomination par le conseil",
  });
  return `${escapeHtml(date(change.observedAt))}, ${office} à ${escapeHtml(change.memberName)} (${basis})`;
}

/**
 * The printable facts come exclusively from the immutable closure snapshot.
 * @implements-requirement HALL-FR-MTG-350 (each item examined in closed session, and the closed sessions decided)
 * @implements-requirement HALL-FR-MTG-290 (the quorum observed at the opening)
 */
export function renderMinutesSections(minutes: MinutesDetail): Record<MinutesSection, string> {
  const { meeting, attendance, agenda, ballots, recusals, conduct } = minutes.facts;
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
      minutesApproval: () => "Arrêt du procès-verbal de la séance précédente",
      councilDecisionProposal: () => item.title,
      openQuestion: () => item.title,
    });
    const ballot = ballots.find((candidate) => candidate.agendaItemId === item.id);
    const votes = ballot?.votes ?? [];
    const total = (choice: "approve" | "reject" | "abstain" | "blank" | "invalid") =>
      votes.filter((vote) => vote.choice === choice).reduce((sum, vote) => sum + vote.count, 0);
    const outcome = item.adjournedAt ? "Ajourné" : item.completedAt ? "Examiné" : "Non examiné";
    const result =
      item.kind === "minutesApproval"
        ? ballot?.completedAt && ballot.result === "approve"
          ? "Arrêté"
          : "Non arrêté"
        : !ballot?.completedAt || ballot.result === null
          ? "Sans décision"
          : matchLiteral(ballot.result, { approve: () => "Adopté", reject: () => "Rejeté" });
    const individual = ballot
      ? matchLiteral(ballot.mode, {
          secret: () => "",
          public: () =>
            `<ul>${votes.map((vote) => `<li>${escapeHtml(vote.member?.name ?? "Votant non renseigné")} : ${matchLiteral(vote.choice, { approve: () => "Pour", reject: () => "Contre", abstain: () => "Abstention", blank: () => "Blanc", invalid: () => "Nul" })}</li>`).join("")}</ul>`,
        })
      : "";
    const nonParticipationCount = ballot?.nonParticipations.reduce((sum, entry) => sum + entry.count, 0) ?? 0;
    const nonParticipationNames =
      ballot?.mode === "public"
        ? `<ul>${ballot.nonParticipations
            .map(
              (entry) =>
                `<li>${escapeHtml(entry.member?.name ?? "Participant non renseigné")} : ne prend pas part au vote${entry.reason ? matchLiteral(entry.reason, { declined: () => " (refus de participer)", departed: () => " (départ)" }) : ""}</li>`,
            )
            .join("")}</ul>`
        : "";
    const quorum = conduct.quorumObservations
      .filter((observation) => observation.agendaItemId === item.id)
      .map(
        (observation) =>
          `<p>Quorum constaté le ${escapeHtml(date(observation.observedAt))} : ${observation.facts.presentCount} présents retenus sur ${observation.facts.denominator} membres pris en compte, seuil ${observation.facts.requiredPresent} : ${matchLiteral(observation.facts.verdict, { met: () => "atteint", notMet: () => "non atteint", exempt: () => "seconde convocation, dispense de quorum" })}.</p>`,
      )
      .join("");
    const mode = ballot ? matchLiteral(ballot.mode, { public: () => "public", secret: () => "secret" }) : "";
    const section = minutes.sections.find((candidate) => candidate.agendaItemId === item.id);
    const discussion = section?.content.trim() ? `<h4>Discussion</h4>${markdown(section.content)}` : "";
    const declarations = recusals
      .filter((recusal) => recusal.agendaItemId === item.id)
      .map((recusal) => {
        const basis = matchLiteral(recusal.legalBasis, {
          personalInterest: () => "Intérêt personnel",
          designatedRepresentativeConflict: () => "Représentant désigné, régime L1111-6 II",
        });
        return `<li>${escapeHtml(recusal.memberName)} : ${basis}, déport déclaré le ${escapeHtml(date(recusal.declaredAt))}</li>`;
      });
    const closedSession = conduct.closedSessions.some((session) => session.agendaItemIds.includes(item.id))
      ? "<p>Point examiné à huis clos.</p>"
      : "";
    const recusalEvidence = declarations.length ? `<h4>Déports déclarés</h4><ul>${declarations.join("")}</ul>` : "";
    const status =
      ballot?.completedAt && !item.adjournedAt
        ? ""
        : `<p>${outcome}${item.kind === "minutesApproval" ? " · Non arrêté" : ""}</p>`;
    return `<section><h3>${item.agendaNumber}. ${escapeHtml(title)}</h3>${item.introducedAt ? `<p>Question ajoutée en séance le ${escapeHtml(date(item.introducedAt))}.</p>` : ""}${closedSession}${status}${item.report ? `<h4>Rapport présenté</h4>${markdown(item.report)}` : ""}${item.proposal ? `<h4>Projet de délibération examiné</h4>${markdown(item.proposal)}` : ""}${discussion}${quorum}${recusalEvidence}${ballot ? `<h4>Scrutin ${mode}</h4><p>${result} · Pour : ${total("approve")} · Contre : ${total("reject")} · Abstentions : ${total("abstain")} · Blancs : ${total("blank")} · Nuls : ${total("invalid")} · Non-participations : ${nonParticipationCount}</p>${individual}${nonParticipationNames}` : ""}</section>`;
  });
  const closedSessions = conduct.closedSessions.map((session) => {
    const request =
      session.requesters.length === 1
        ? `sur demande du maire, ${escapeHtml(session.requesters[0]!.name)}`
        : `sur demande de ${session.requesters.map((requester) => escapeHtml(requester.name)).join(", ")}`;
    const scope = session.wholeMeeting
      ? "pour la suite de la séance"
      : `pour les points ${agenda
          .filter((entry) => session.agendaItemIds.includes(entry.id))
          .map((entry) => entry.agendaNumber)
          .join(", ")}`;
    return `<li>${escapeHtml(date(session.observedAt))}, huis clos décidé sans débat ${request}, par ${session.approvals} voix sur ${session.presentOrRepresented} membres présents ou représentés, ${scope}</li>`;
  });
  const handovers = conduct.officerChanges.map((change) => `<li>${officerChange(change)}</li>`);
  const openingQuorum = conduct.quorumObservations.find((observation) => observation.agendaItemId === null);
  const reconvocation = conduct.reconvocations.at(-1);
  const convocation = [
    openingQuorum
      ? `Quorum à l’ouverture : ${matchLiteral(openingQuorum.facts.verdict, { met: () => "atteint", notMet: () => "non atteint", exempt: () => "seconde convocation, sans condition de quorum" })}, ${openingQuorum.facts.presentCount} présents sur ${openingQuorum.facts.requiredPresent} requis.`
      : "",
    reconvocation
      ? `Seconde convocation envoyée le ${escapeHtml(date(reconvocation.sentAt))} pour une nouvelle séance le ${escapeHtml(date(reconvocation.scheduledAt))}.`
      : "",
    meeting.reconvenedFrom
      ? `Séance tenue sur seconde convocation après la séance n° ${meeting.reconvenedFrom.number} du ${escapeHtml(date(meeting.reconvenedFrom.scheduledAt))}, tenue sans quorum.`
      : "",
  ].filter(Boolean);
  const attending = conduct.auxiliaryAttendances.map(
    (entry) => `<li>${escapeHtml(entry.name)}${entry.quality ? ` - ${escapeHtml(entry.quality)}` : ""}</li>`,
  );

  return {
    facts: `<p>Séance n° ${meeting.number}<br>Ouverture : ${escapeHtml(date(meeting.startedAt))}<br>Clôture : ${escapeHtml(date(meeting.closedAt))}<br>Lieu : ${escapeHtml(meeting.location ?? "Non renseigné")}</p><p>Présidence : ${escapeHtml(meeting.chair?.name ?? "Non renseignée")}<br>Secrétariat : ${escapeHtml(meeting.secretary?.name ?? "Non renseigné")}<br>Quorum requis : ${meeting.quorum} · Présents : ${attendance.filter((entry) => entry.status === "present").length}</p>${convocation.length ? `<p>${convocation.join("<br>")}</p>` : ""}<ul>${rows.join("")}</ul>${attending.length ? `<p>Assistaient également :</p><ul>${attending.join("")}</ul>` : ""}${handovers.length ? `<p>Passations en séance :</p><ul>${handovers.join("")}</ul>` : ""}${closedSessions.length ? `<p>Huis clos :</p><ul>${closedSessions.join("")}</ul>` : ""}`,
    proceedings: subjects.join(""),
  };
}
