import type { CouncilDecisionDetail, CouncilDecisionFacts } from "@hall/contracts";
import { matchDiscriminated, matchLiteral } from "@hall/domain";
import { parse, renderHtml } from "@hall/templating";
import sanitizeHtml from "sanitize-html";

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// Local documentary wording, not a legal date-format requirement.
function frenchYear(value: number): string {
  const small = [
    "zéro",
    "un",
    "deux",
    "trois",
    "quatre",
    "cinq",
    "six",
    "sept",
    "huit",
    "neuf",
    "dix",
    "onze",
    "douze",
    "treize",
    "quatorze",
    "quinze",
    "seize",
  ];
  if (value < 17) return small[value]!;
  if (value < 20) return `dix-${small[value - 10]}`;
  if (value < 70) {
    const tens = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"][Math.floor(value / 10)]!;
    const unit = value % 10;
    return tens + (unit === 0 ? "" : unit === 1 ? " et un" : `-${small[unit]}`);
  }
  if (value < 80) return "soixante" + (value === 71 ? " et onze" : `-${frenchYear(value - 60)}`);
  if (value < 100) return "quatre-vingt" + (value === 80 ? "s" : `-${frenchYear(value - 80)}`);
  if (value < 1000) {
    const hundreds = Math.floor(value / 100),
      remainder = value % 100;
    return (
      (hundreds === 1 ? "cent" : `${small[hundreds]} cent${remainder === 0 ? "s" : ""}`) +
      (remainder ? ` ${frenchYear(remainder)}` : "")
    );
  }
  const thousands = Math.floor(value / 1000),
    remainder = value % 1000;
  return (
    (thousands === 1 ? "mille" : `${frenchYear(thousands)} mille`) + (remainder ? ` ${frenchYear(remainder)}` : "")
  );
}

function ballotTotals(facts: CouncilDecisionFacts) {
  return matchDiscriminated(facts.ballot, "mode", {
    public: (ballot) => ({
      approve: ballot.votes.filter((vote) => vote.choice === "approve").length,
      reject: ballot.votes.filter((vote) => vote.choice === "reject").length,
      abstain: ballot.votes.filter((vote) => vote.choice === "abstain").length,
      blank: 0,
      invalid: 0,
      nonParticipation: ballot.nonParticipations.length,
    }),
    secret: (ballot) => ballot.totals,
  });
}

/** Presentation only: no number allocation, legal certification or inferred signature. */
// @requirement-reference HALL-FR-DEC-080 DOCUMENTARY_ENVELOPE_USES_HISTORICAL_EVIDENCE:
export function renderCouncilDecisionFacts(facts: CouncilDecisionFacts, documentDate: string | null = null): string {
  const shortDate = (value: string | null) => value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "Non renseignée";
  const totals = ballotTotals(facts);
  const opening = facts.opening;
  const attendance = opening?.attendance ?? facts.attendance;
  const names = (status: CouncilDecisionFacts["attendance"][number]["status"]) =>
    attendance
      .filter((entry) => entry.status === status)
      .map(
        (entry) =>
          `${escapeHtml(entry.member.name)}${entry.proxyHolder ? ` (pouvoir à ${escapeHtml(entry.proxyHolder.name)})` : ""}`,
      )
      .join(", ") || "Néant";
  const timeZone = facts.hall?.timeZone ?? "UTC";
  const date = new Date(facts.meeting.startedAt);
  const formatted = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("fr-FR", { ...options, timeZone }).format(date);
  const dateText = formatted({ dateStyle: "long" });
  const time =
    formatted({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).replace(":", " heures ") +
    (facts.hall ? "" : " UTC");
  const year = Number(formatted({ year: "numeric" }));
  const hall = facts.hall ? `de ${escapeHtml(facts.hall.name)}` : "de la commune (nom non renseigné)";
  const role = facts.meeting.chairRole
    ? matchLiteral(facts.meeting.chairRole, {
        mayor: () => "maire",
        deputyMayor: () => "adjoint au maire",
        councillor: () => "membre du conseil municipal",
      })
    : null;
  const chair = facts.meeting.chair
    ? `${escapeHtml(facts.meeting.chair.name)}${role ? `, ${role}` : ""}`
    : "une présidence non renseignée";
  const location = facts.meeting.location
    ? `dans le lieu suivant : ${escapeHtml(facts.meeting.location)}`
    : "en un lieu non renseigné";
  const quorum = opening
    ? matchLiteral(opening.quorum.verdict, {
        met: () => " Le quorum a été constaté à l’ouverture.",
        notMet: () => " Le quorum n’était pas atteint à l’ouverture.",
        exempt: () => " L’ouverture relève du régime de seconde convocation.",
      })
    : "";
  const voters = totals.approve + totals.reject + totals.abstain + totals.blank + totals.invalid;
  const present = attendance.filter((entry) => entry.status === "present").length;
  const counts = opening?.quorum ?? facts.quorum;
  const recusals = facts.recusals.length
    ? `<p><strong>Déports pour cette délibération :</strong> ${facts.recusals.map((entry) => escapeHtml(entry.member.name)).join(", ")}</p>`
    : "";
  return `<section class="decision-facts">
    <h1>Commune ${facts.hall ? `de ${escapeHtml(facts.hall.name)}` : "non renseignée"}</h1>
    <h1>Extrait du registre des délibérations du conseil municipal</h1>
    <h2>Séance du ${escapeHtml(dateText)}</h2>
    <div class="decision-facts-columns">
      <div class="decision-counts"><dl><dt>Membres en exercice</dt><dd>${counts.memberCount}</dd><dt>Présents${opening ? " à l’ouverture" : " au scrutin"}</dt><dd>${present}</dd><dt>Votants au scrutin</dt><dd>${voters}</dd></dl><dl class="decision-dates"><dt>Date de convocation</dt><dd>${shortDate(facts.noticeDate)}</dd><dt>Date d’affichage</dt><dd>${shortDate(documentDate)}</dd></dl></div>
      <div class="decision-opening"><p>L’an ${escapeHtml(frenchYear(year))}, le ${escapeHtml(formatted({ day: "numeric", month: "long" }))}, à ${escapeHtml(time)}, le conseil municipal ${hall} s’est réuni ${location}, sous la présidence de ${chair}.${quorum}</p>
      <p class="decision-attendance"><strong>${opening ? "Présents" : "Présents au scrutin"} :</strong> ${names("present")}<br><strong>Absents avec pouvoir :</strong> ${names("represented")}<br><strong>Absents excusés :</strong> ${names("excused")}<br><strong>Absents :</strong> ${names("absent")}<br><strong>Secrétaire de séance :</strong> ${facts.meeting.secretary ? escapeHtml(facts.meeting.secretary.name) : "Non renseigné"}</p>${recusals}</div>
    </div>
  </section>`;
}

export function renderCouncilDecisionResult(facts: CouncilDecisionFacts): string {
  const totals = ballotTotals(facts);
  const result = matchLiteral(facts.ballot.result, { approve: () => "Adoptée", reject: () => "Rejetée" });
  const mode = matchLiteral(facts.ballot.mode, { public: () => "public", secret: () => "secret" });
  const secretChoices = matchLiteral(facts.ballot.mode, {
    public: () => "",
    secret: () => ` · Blancs : ${totals.blank} · Nuls : ${totals.invalid}`,
  });
  return `<section class="decision-conclusion"><p class="decision-result"><strong>${result}</strong> · Scrutin ${mode} · Pour : ${totals.approve} · Contre : ${totals.reject} · Abstentions : ${totals.abstain}${secretChoices} · Non-participations : ${totals.nonParticipation}</p>
    <div class="decision-signatures"><div><p><strong>Le secrétaire de séance</strong><br>${facts.meeting.secretary ? escapeHtml(facts.meeting.secretary.name) : ""}</p></div><div><p><strong>Le maire</strong>${facts.meeting.chairRole === "mayor" && facts.meeting.chair ? `<br>${escapeHtml(facts.meeting.chair.name)}` : ""}</p></div></div></section>`;
}

export function renderCouncilDecisionContent(decision: CouncilDecisionDetail): string {
  const content = sanitizeHtml(renderHtml(parse(decision.content)), {
    allowedTags: sanitizeHtml.defaults.allowedTags,
    allowedAttributes: { a: ["href", "title"] },
  });
  const number = decision.number ? `<p class="decision-number">Délibération n° ${escapeHtml(decision.number)}</p>` : "";
  return `<section class="decision-content">${number}<h2>Objet : ${escapeHtml(decision.title)}</h2>${content}</section>`;
}
