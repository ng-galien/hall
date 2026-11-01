import type { MinutesDetail } from "@hall/api-contract";
import { describe, expect, it } from "vitest";
import { renderMinutesSections } from "./minutesDocument.js";

const fixture: MinutesDetail = {
  id: "minutes",
  councilMeetingId: "meeting",
  meetingNumber: 1,
  scheduledAt: "2026-09-05T18:00:00Z",
  createdAt: "2026-09-05T20:00:00Z",
  updatedAt: "2026-09-05T20:00:00Z",
  version: 1,
  generatedAt: null,
  documentId: null,
  settledAt: null,
  sections: [{ agendaItemId: "agenda", content: "Une correction de rédaction. <script>alert('unsafe')</script>" }],
  facts: {
    meeting: {
      id: "meeting",
      number: 1,
      scheduledAt: "2026-09-05T18:00:00Z",
      startedAt: "2026-09-05T18:05:00Z",
      closedAt: "2026-09-05T20:00:00Z",
      location: "Salle <A>",
      quorum: 1,
      chair: { id: "chair", name: "Marie Martin" },
      secretary: { id: "secretary", name: "Jean Dupont" },
      reconvenedFrom: null,
    },
    recusals: [],
    conduct: {
      membershipRecords: [],
      attendanceEvents: [],
      quorumObservations: [],
      reconvocations: [],
      officerChanges: [],
      auxiliaryAttendances: [],
      proxyExceptions: [],
      closedSessions: [],
    },
    attendance: [
      { id: "attendance", member: { id: "chair", name: "Marie Martin" }, status: "present", proxyHolderId: null },
    ],
    agenda: [
      {
        id: "agenda",
        position: 1,
        agendaNumber: 1,
        introducedAt: null,
        title: "",
        kind: "minutesApproval",
        report: "Rapport figé **important**.",
        proposal: null,
        discussionSummary: "Notes prises pendant la séance.",
        startedAt: "2026-09-05T18:10:00Z",
        completedAt: "2026-09-05T18:20:00Z",
        adjournedAt: null,
      },
    ],
    ballots: [
      {
        id: "ballot",
        agendaItemId: "agenda",
        mode: "public",
        result: "approve",
        completedAt: "2026-09-05T18:20:00Z",
        nonParticipations: [],
        votes: [{ choice: "approve", count: 1, member: { id: "chair", name: "Marie Martin" } }],
      },
    ],
  },
};

describe("minutes generated document", () => {
  it("renders the canonical agenda number independently of technical gaps", () => {
    const minutes: MinutesDetail = {
      ...fixture,
      facts: { ...fixture.facts, agenda: [{ ...fixture.facts.agenda[0]!, position: 6, agendaNumber: 5 }] },
    };
    const html = renderMinutesSections(minutes).proceedings;
    expect(html).toContain("<h3>5. ");
    expect(html).not.toContain("<h3>6. ");
  });

  // @verifies-requirement HALL-FR-MIN-250
  it("prints immutable identities and votes with sanitized council narrative, without preparatory reports", () => {
    const html = Object.values(renderMinutesSections(fixture)).join("");
    expect(html).toContain("Présidence : Marie Martin");
    expect(html).toContain("Secrétariat : Jean Dupont");
    expect(html).toContain("Arrêt du procès-verbal de la séance précédente");
    expect(html).not.toContain("Rapport figé");
    expect(html).not.toContain("Rapport présenté");
    expect(html).not.toContain("Marie Martin : Pour");
    expect(html).toContain("Pour : 1");
    expect(html).toContain("Salle &lt;A&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Une correction de rédaction.");
  });

  // @verifies-requirement HALL-FR-MIN-250
  it("separates the captured subject text from the council account without repeating the business report", () => {
    const minutes = structuredClone(fixture);
    minutes.facts.agenda[0] = {
      ...minutes.facts.agenda[0]!,
      kind: "councilDecisionProposal",
      title: "Programme forestier",
      report: "## Contexte préparatoire\n\nPièce examinée : devis de préparation.",
      proposal: "Projet proposé avant la séance.",
    };
    minutes.sections[0]!.content = "Le conseil a examiné le devis.\n\nIl retient la proposition discutée en séance.";
    const original = structuredClone(minutes);
    const html = renderMinutesSections(minutes).proceedings;
    expect(html).toContain("<h3>1. Programme forestier</h3>");
    expect(html).toContain("Le conseil a examiné le devis.");
    expect(html).toContain("Il retient la proposition discutée en séance.");
    expect(html).toContain("Pour : 1");
    expect(html).not.toContain("Contexte préparatoire");
    expect(html).not.toContain("Pièce examinée : devis de préparation");
    expect(html).toContain("Projet proposé avant la séance");
    expect(html.indexOf("Projet proposé avant la séance")).toBeLessThan(html.indexOf("Le conseil a examiné le devis."));
    expect(html).not.toContain("Projet de délibération examiné");
    expect(minutes).toEqual(original);
  });

  it("renders the resolved open-question subject separately without falling back to its business report", () => {
    const minutes = structuredClone(fixture);
    const item = minutes.facts.agenda[0]!;
    item.kind = "openQuestion";
    item.title = "Pont communal";
    item.report = "Rapport général de l’affaire à ne pas reprendre.";
    minutes.sections[0]!.content = "Le conseil demande un devis.";
    const subjectTexts = new Map([
      [item.id, "Texte propre de la question.\n\nDeuxième paragraphe. <script>unsafe()</script>"],
    ]);
    const before = structuredClone(minutes);
    const html = renderMinutesSections(minutes, subjectTexts).proceedings;
    expect(html).toContain("Texte propre de la question.");
    expect(html).toContain("Deuxième paragraphe.");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("Rapport général");
    expect(html.indexOf("Texte propre de la question.")).toBeLessThan(html.indexOf("Le conseil demande un devis."));
    expect(minutes).toEqual(before);
    expect(renderMinutesSections(minutes, new Map([[item.id, ""]])).proceedings).not.toContain("Sujet présenté");
    expect(renderMinutesSections(minutes).proceedings).not.toContain("Rapport général");
  });

  it("prints non-participation totals separately from abstention without individual names", () => {
    const minutes = structuredClone(fixture);
    minutes.facts.ballots[0]!.nonParticipations = [
      { count: 1, reason: "departed", member: { id: "departure", name: "Personne <partie>" } },
      { count: 1, reason: "declined", member: { id: "refusal", name: "Personne refusant" } },
    ];
    const html = renderMinutesSections(minutes).proceedings;
    expect(html).toContain("Abstentions : 0");
    expect(html).toContain("Non-participations : 2");
    expect(html).not.toContain("Personne");
    expect(html).not.toContain("ne prend pas part au vote");
  });

  it("prints anonymous secret blank, invalid and non-participation totals independently", () => {
    const minutes = structuredClone(fixture);
    minutes.facts.ballots[0] = {
      ...minutes.facts.ballots[0]!,
      mode: "secret",
      votes: [
        { choice: "approve", count: 2, member: null },
        { choice: "blank", count: 1, member: null },
        { choice: "invalid", count: 3, member: null },
      ],
      nonParticipations: [{ count: 4, reason: null, member: null }],
    };
    const html = renderMinutesSections(minutes).proceedings;
    expect(html).toContain("Blancs : 1");
    expect(html).toContain("Nuls : 3");
    expect(html).toContain("Non-participations : 4");
    expect(html).not.toContain("ne prend pas part au vote");
    expect(html).not.toContain("Marie Martin");
  });

  it("prints both recusal qualifications without turning either into a secret vote", () => {
    const minutes: MinutesDetail = {
      ...fixture,
      facts: {
        ...fixture.facts,
        recusals: ["personalInterest", "designatedRepresentativeConflict"].map((basis, index) => ({
          id: `recusal-${index}`,
          agendaItemId: "agenda",
          councilMemberId: `member-${index}`,
          legalBasis: basis as "personalInterest" | "designatedRepresentativeConflict",
          declaredAt: "2026-09-05T18:00:00Z",
          recordedAt: "2026-09-05T18:00:00Z",
          recordedBy: "clerk",
          memberName: `Personne <${index}>`,
        })),
        ballots: fixture.facts.ballots.map((ballot) => ({
          ...ballot,
          mode: "secret",
          votes: [{ choice: "approve", count: 1, member: null }],
        })),
      },
    };
    const html = renderMinutesSections(minutes).proceedings;
    expect(html).toContain("Personne &lt;0&gt; : Intérêt personnel");
    expect(html).toContain("Personne &lt;1&gt; : Représentant désigné, régime L1111-6 II");
    expect(html).toContain("Pour : 1");
    expect(html).not.toContain("Personne &lt;0&gt; : Pour");
  });

  it("never prints named choices for secret ballots", () => {
    const secret: MinutesDetail = {
      ...fixture,
      facts: {
        ...fixture.facts,
        ballots: fixture.facts.ballots.map((ballot) => ({
          ...ballot,
          mode: "secret",
          votes: [{ choice: "approve", count: 5, member: null }],
        })),
      },
    };
    const html = Object.values(renderMinutesSections(secret)).join("");
    expect(html).toContain("Scrutin secret");
    expect(html).toContain("Pour : 5");
    expect(html).not.toContain("Marie Martin : Pour");
  });

  // @verifies-requirement HALL-FR-MIN-260
  // @verifies-requirement HALL-FR-ATT-140
  it("mentions officer handovers and the persons attending", () => {
    const minutes = structuredClone(fixture);
    const change = {
      councilMeetingId: "meeting",
      office: "chair" as const,
      recordedAt: "2026-09-05T18:30:00Z",
      recordedBy: "clerk",
    };
    minutes.facts.conduct.officerChanges = [
      {
        ...change,
        id: "handover",
        basis: "deputyInNominationOrder",
        councilMemberId: "deputy",
        memberName: "Paul <Adjoint>",
        observedAt: "2026-09-05T18:30:00Z",
      },
      {
        ...change,
        id: "secretary",
        office: "secretary",
        basis: "councilNomination",
        councilMemberId: "councillor",
        memberName: "Lise Conseillère",
        observedAt: "2026-09-05T18:31:00Z",
      },
    ];
    minutes.facts.conduct.auxiliaryAttendances = [
      {
        id: "aux",
        councilMeetingId: "meeting",
        contactId: "contact",
        name: "Claire <Martin>",
        quality: "secrétaire de mairie",
        declaredAt: "2026-09-05T18:00:00Z",
        recordedAt: "2026-09-05T18:00:00Z",
        recordedBy: "clerk",
      },
      {
        id: "guest",
        councilMeetingId: "meeting",
        contactId: "guest-contact",
        name: "Jean Libre",
        quality: null,
        declaredAt: "2026-09-05T18:05:00Z",
        recordedAt: "2026-09-05T18:05:00Z",
        recordedBy: "clerk",
      },
    ];
    const { facts } = renderMinutesSections(minutes);
    expect(facts).toContain(
      "Assistaient également :</p><ul><li>Claire &lt;Martin&gt; - secrétaire de mairie</li><li>Jean Libre</li></ul>",
    );
    expect(facts).toContain("présidence confiée à Paul &lt;Adjoint&gt; (adjoint dans l’ordre des nominations)");
    expect(facts).toContain("secrétariat confié à Lise Conseillère (nomination par le conseil)");
  });

  // @verifies-requirement HALL-FR-MTG-350
  it("mentions a closed session and marks the items held in closed session", () => {
    const minutes = structuredClone(fixture);
    minutes.facts.conduct.closedSessions = [
      {
        id: "closed",
        councilMeetingId: "meeting",
        requesters: [{ councilMemberId: "chair", name: "Marie Martin" }],
        approvals: 5,
        presentOrRepresented: 9,
        wholeMeeting: false,
        agendaItemIds: ["agenda"],
        observedAt: "2026-09-05T18:20:00Z",
        recordedAt: "2026-09-05T18:20:00Z",
        recordedBy: "clerk",
      },
    ];
    const { facts, proceedings } = renderMinutesSections(minutes);
    expect(facts).toContain("Huis clos :</p><ul><li>");
    expect(facts).toContain(
      "huis clos décidé sans débat sur demande du maire, Marie Martin, par 5 voix sur 9 membres présents ou représentés, pour les points 1</li>",
    );
    expect(proceedings).toContain("<p>Point examiné à huis clos.</p>");
  });

  it("prints each point once with its discussion before its result", () => {
    const { facts, proceedings } = renderMinutesSections(fixture);
    expect(facts.match(/Ouverture :/g)).toHaveLength(1);
    expect(proceedings.match(/Arrêt du procès-verbal de la séance précédente/g)).toHaveLength(1);
    expect(proceedings.match(/Une correction de rédaction/g)).toHaveLength(1);
    expect(proceedings).not.toContain("Rapport figé");
    expect(proceedings.indexOf("Une correction de rédaction")).toBeLessThan(proceedings.indexOf("Scrutin public"));
    expect(proceedings).not.toContain("<p>Examiné</p>");
    expect(proceedings).toContain("Arrêté");
    expect(proceedings).not.toContain("Adopté");
  });

  it("omits ordinary examined status but retains adjournment and non-examination", () => {
    const minutes = structuredClone(fixture);
    const item = minutes.facts.agenda[0]!;
    item.kind = "openQuestion";
    item.title = "Questions diverses";
    minutes.facts.ballots = [];
    expect(renderMinutesSections(minutes).proceedings).not.toContain("Examiné");
    expect(renderMinutesSections(minutes).proceedings).toContain("Une correction de rédaction");
    item.completedAt = null;
    expect(renderMinutesSections(minutes).proceedings).toContain("Non examiné");
    item.adjournedAt = "2026-09-05T18:20:00Z";
    expect(renderMinutesSections(minutes).proceedings).toContain("Ajourné");
    item.kind = "minutesApproval";
    item.adjournedAt = null;
    item.completedAt = "2026-09-05T18:20:00Z";
    expect(renderMinutesSections(minutes).proceedings).toContain("<p>Non arrêté</p>");
  });

  it("distinguishes a PV not settled from a rejected deliberation", () => {
    const rejected = {
      ...fixture,
      facts: {
        ...fixture.facts,
        ballots: [{ ...fixture.facts.ballots[0]!, result: "reject" as const }],
      },
    };
    const pv = renderMinutesSections(rejected).proceedings;
    expect(pv).toContain("Non arrêté");
    expect(pv).not.toContain("Rejeté");

    const deliberation: MinutesDetail = {
      ...rejected,
      facts: {
        ...rejected.facts,
        agenda: [{ ...rejected.facts.agenda[0]!, kind: "councilDecisionProposal", title: "Projet" }],
      },
    };
    expect(renderMinutesSections(deliberation).proceedings).toContain("Rejeté");
  });

  it("resolves the proxy holder by attendance identity rather than council member identity", () => {
    const minutes: MinutesDetail = {
      ...fixture,
      facts: {
        ...fixture.facts,
        attendance: [
          ...fixture.facts.attendance,
          {
            id: "represented-attendance",
            member: { id: "represented-member", name: "Jean Dupont" },
            status: "represented",
            proxyHolderId: "attendance",
          },
        ],
      },
    };
    expect(renderMinutesSections(minutes).facts).toContain("Jean Dupont - Représenté par Marie Martin");
  });
  it("prints quorum verdicts, aggregate public choices and every handover basis", () => {
    const observation = (
      id: string,
      agendaItemId: string | null,
      verdict: "met" | "notMet" | "exempt",
    ): MinutesDetail["facts"]["conduct"]["quorumObservations"][number] => ({
      id,
      councilMeetingId: "meeting",
      observedAt: "2026-09-05T18:10:00Z",
      recordedAt: "2026-09-05T18:10:00Z",
      recordedBy: "clerk",
      agendaItemId,
      facts: {
        membershipRecordId: "membership",
        membersInOffice: [{ councilMemberId: "chair", name: "Marie Martin" }],
        membershipObservedAt: "2026-09-05T18:00:00Z",
        membershipSourceReference: "Tableau du conseil",
        memberCount: 15,
        excludedMemberIds: [],
        denominatorExcludedMemberIds: [],
        denominator: 15,
        requiredPresent: 8,
        presentMemberIds: [],
        presentCount: 7,
        regime: verdict === "exempt" ? "secondConvocation" : "ordinary",
        verdict,
        reconvocationId: null,
        attendance: [],
        remainingAgendaItemIds: [],
      },
    });
    const minutes = structuredClone(fixture);
    const member = (name: string) => ({ id: name, name });
    minutes.facts.ballots[0]!.votes = [
      { choice: "approve", count: 1, member: member("Votant Pour") },
      { choice: "reject", count: 1, member: member("Votant Contre") },
      { choice: "abstain", count: 1, member: member("Votant Abstention") },
      { choice: "blank", count: 1, member: member("Votant Blanc") },
      { choice: "invalid", count: 1, member: member("Votant Nul") },
    ];
    minutes.facts.conduct.quorumObservations = [
      observation("opening", null, "notMet"),
      observation("item-met", "agenda", "met"),
      observation("item-not-met", "agenda", "notMet"),
      observation("item-exempt", "agenda", "exempt"),
    ];
    const handover = {
      councilMeetingId: "meeting",
      office: "chair" as const,
      councilMemberId: "deputy",
      observedAt: "2026-09-05T18:30:00Z",
      recordedAt: "2026-09-05T18:30:00Z",
      recordedBy: "clerk",
    };
    minutes.facts.conduct.officerChanges = [
      { ...handover, id: "mayor", basis: "mayor", memberName: "Le Maire" },
      { ...handover, id: "designated", basis: "councilDesignation", memberName: "Élu désigné" },
    ];
    minutes.facts.conduct.closedSessions = [
      {
        id: "closed",
        councilMeetingId: "meeting",
        requesters: [
          { councilMemberId: "first", name: "Première <Élue>" },
          { councilMemberId: "second", name: "Second Élu" },
          { councilMemberId: "third", name: "Troisième Élu" },
        ],
        approvals: 6,
        presentOrRepresented: 9,
        wholeMeeting: true,
        agendaItemIds: [],
        observedAt: "2026-09-05T18:40:00Z",
        recordedAt: "2026-09-05T18:40:00Z",
        recordedBy: "clerk",
      },
    ];
    const { facts, proceedings } = renderMinutesSections(minutes);
    expect(facts).toContain("Quorum à l’ouverture : non atteint, 7 présents sur 8 requis.");
    expect(facts).toContain("présidence confiée à Le Maire (reprise par le maire)");
    expect(facts).toContain("présidence confiée à Élu désigné (désignation par le conseil)");
    expect(facts).toContain(
      "sur demande de Première &lt;Élue&gt;, Second Élu, Troisième Élu, par 6 voix sur 9 membres présents ou représentés, pour la suite de la séance",
    );
    expect(proceedings).not.toContain("seuil 8 : atteint.");
    expect(proceedings).toContain("seuil 8 : non atteint.");
    expect(proceedings).toContain("seuil 8 : seconde convocation, dispense de quorum.");
    for (const line of ["Pour : 1", "Contre : 1", "Abstentions : 1", "Blancs : 1", "Nuls : 1"])
      expect(proceedings).toContain(line);
    expect(proceedings).not.toContain("Votant");

    minutes.facts.conduct.quorumObservations = [observation("opening", null, "exempt")];
    expect(renderMinutesSections(minutes).facts).toContain(
      "Quorum à l’ouverture : seconde convocation, sans condition de quorum, 7 présents sur 8 requis.",
    );
  });
});
