import type { CouncilDecisionFacts } from "@hall/contracts";
import { describe, expect, it } from "vitest";
import {
  renderCouncilDecisionContent,
  renderCouncilDecisionFacts,
  renderCouncilDecisionResult,
} from "./councilDecisionDocument.js";

const member = { id: "member", name: "Marie <Martin>" };
const facts: CouncilDecisionFacts = {
  noticeDate: null,
  hall: { name: "Alésia", timeZone: "Europe/Paris" },
  opening: null,
  proposal: { id: "proposal", title: "Objet", submittedText: "Texte voté" },
  agendaItemId: "item",
  agendaNumber: 7,
  decisionNumber: 2,
  confirmedAt: "2026-06-26T19:00:00Z",
  meeting: {
    id: "meeting",
    number: 2,
    scheduledAt: null,
    startedAt: "2026-06-26T17:00:00Z",
    location: null,
    chair: member,
    chairRole: null,
    secretary: null,
  },
  attendance: [{ member, status: "present", proxyHolder: null }],
  quorum: { memberCount: 11, denominator: 11, requiredPresent: 6, presentCount: 9, regime: "ordinary", verdict: "met" },
  recusals: [],
  ballot: {
    id: "ballot",
    mode: "public",
    result: "approve",
    votes: [{ member, choice: "approve" }],
    nonParticipations: [],
  },
};

describe("council decision documentary facts", () => {
  it("presents confirmed facts with French dates and escaped names", () => {
    const html = renderCouncilDecisionFacts(facts);
    expect(html).toContain("26 juin 2026");
    expect(html).not.toContain("Ordre de la délibération dans la séance");
    expect(html).toContain("19 heures 00");
    expect(html).toContain("L’an deux mille vingt-six");
    expect(html).toContain("Extrait du registre des délibérations du conseil municipal");
    expect(html).not.toContain("légalement convoqué");
    expect(html).not.toContain("nombre prescrit par la loi");
    expect(html).toContain("Marie &lt;Martin&gt;");
    expect(html).not.toContain("Pour : 1");
    expect(renderCouncilDecisionResult(facts)).toContain("Pour : 1");
    expect(html).not.toContain("Texte voté");
    expect(html).not.toContain("signé");
    expect(html).toContain("Date de convocation");
    expect(html).toContain("Non renseignée");
  });
  it("keeps opening attendance separate from voting and never substitutes a mayor", () => {
    const html = renderCouncilDecisionFacts({
      ...facts,
      opening: {
        attendance: [{ member: { id: "opening", name: "Présente au début" }, status: "present", proxyHolder: null }],
        quorum: { ...facts.quorum, verdict: "notMet" },
      },
    });
    expect(html).toContain("Présente au début");
    expect(html).toContain("Le quorum n’était pas atteint à l’ouverture");
    expect(html).not.toContain("Le quorum a été constaté");
    const signatures = renderCouncilDecisionResult(facts);
    expect(signatures).toContain("Le maire");
    expect(signatures).not.toContain("Marie &lt;Martin&gt;");
    expect(signatures).not.toContain("Pour extrait conforme");
  });
  it("makes unavailable historical context explicit without a freeze blocker", () => {
    const html = renderCouncilDecisionFacts({
      ...facts,
      hall: null,
      meeting: { ...facts.meeting, startedAt: "1999-06-26T17:00:00Z" },
    });
    expect(html).toContain("mille neuf cent quatre-vingt-dix-neuf");
    expect(html).toContain("17 heures 00 UTC");
    expect(html).toContain("Commune non renseignée");
  });
  it("names the chair role, the second-convocation opening and the recused members", () => {
    const opening = { attendance: facts.attendance, quorum: { ...facts.quorum, verdict: "exempt" as const } };
    const recusal = {
      id: "recusal",
      member: { id: "recused", name: "Paul <Déporté>" },
      declaredAt: "2026-06-26T17:05:00Z",
      legalBasis: "personalInterest" as const,
    };
    const rendered = (chairRole: "mayor" | "deputyMayor" | "councillor") =>
      renderCouncilDecisionFacts({ ...facts, opening, recusals: [recusal], meeting: { ...facts.meeting, chairRole } });
    expect(rendered("mayor")).toContain("Marie &lt;Martin&gt;, maire");
    expect(rendered("deputyMayor")).toContain("Marie &lt;Martin&gt;, adjoint au maire");
    const html = rendered("councillor");
    expect(html).toContain("Marie &lt;Martin&gt;, membre du conseil municipal");
    expect(html).toContain("L’ouverture relève du régime de seconde convocation.");
    expect(html).toContain("<strong>Déports pour cette délibération :</strong> Paul &lt;Déporté&gt;");
  });
  it("uses only aggregate choices for the secret ballot", () => {
    const html = renderCouncilDecisionResult({
      ...facts,
      ballot: {
        id: "secret",
        mode: "secret",
        result: "reject",
        totals: { approve: 2, reject: 5, abstain: 1, blank: 1, invalid: 1, nonParticipation: 1 },
      },
    });
    expect(html).toContain("Rejetée");
    expect(html).toContain("Contre : 5");
    expect(html).toContain("Blancs : 1");
    expect(html).not.toContain("Marie &lt;Martin&gt; :");
  });
  it("renders the separate documentary writing without altering or repeating the submitted text", () => {
    const html = renderCouncilDecisionContent({
      id: "decision",
      councilMeetingId: "meeting",
      proposalId: "proposal",
      ballotId: "ballot",
      title: "Objet <test>",
      number: "2026-06-04",
      documentDate: "2026-09-07",
      state: "draft",
      version: 1,
      createdAt: facts.confirmedAt,
      updatedAt: facts.confirmedAt,
      frozenAt: null,
      documentId: null,
      content: "Rédaction **fidèle**. <script>alert(1)</script>",
      facts,
    });
    expect(html).toContain("Objet &lt;test&gt;");
    expect(html).toContain("<strong>fidèle</strong>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("Texte voté");
    expect(html).toContain("Délibération n° 2026-06-04");
    expect(html).not.toContain("Pour :");
  });
});
