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
    },
    attendance: [
      { id: "attendance", member: { id: "chair", name: "Marie Martin" }, status: "present", proxyHolderId: null },
    ],
    agenda: [
      {
        id: "agenda",
        position: 1,
        title: "",
        kind: "minutesApproval",
        report: "Rapport figé **important**.",
        proposal: null,
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
        votes: [{ choice: "approve", count: 1, member: { id: "chair", name: "Marie Martin" } }],
      },
    ],
  },
};

describe("minutes generated document", () => {
  it("prints immutable identities, reports and named public votes separately from sanitized narrative", () => {
    const html = Object.values(renderMinutesSections(fixture)).join("");
    expect(html).toContain("Présidence : Marie Martin");
    expect(html).toContain("Secrétariat : Jean Dupont");
    expect(html).toContain("Approbation du procès-verbal de la séance précédente");
    expect(html).toContain("Rapport figé <strong>important</strong>");
    expect(html).toContain("Marie Martin : Pour");
    expect(html).toContain("Salle &lt;A&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Une correction de rédaction.");
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

  it("prints each point once with its discussion before its result", () => {
    const { facts, proceedings } = renderMinutesSections(fixture);
    expect(facts.match(/Ouverture :/g)).toHaveLength(1);
    expect(proceedings.match(/Approbation du procès-verbal de la séance précédente/g)).toHaveLength(1);
    expect(proceedings.match(/Une correction de rédaction/g)).toHaveLength(1);
    expect(proceedings.indexOf("Rapport figé")).toBeLessThan(proceedings.indexOf("Une correction de rédaction"));
    expect(proceedings.indexOf("Une correction de rédaction")).toBeLessThan(proceedings.indexOf("Scrutin public"));
    expect(proceedings).not.toContain("<p>Examiné</p>");
    expect(proceedings).toContain("Adopté");
  });

  it("resolves the proxy holder by attendance identity rather than council member identity", () => {
    const minutes: MinutesDetail = {
      ...fixture,
      facts: {
        ...fixture.facts,
        attendance: [
          ...fixture.facts.attendance,
          { id: "represented-attendance", member: { id: "represented-member", name: "Jean Dupont" }, status: "represented", proxyHolderId: "attendance" },
        ],
      },
    };
    expect(renderMinutesSections(minutes).facts).toContain("Jean Dupont - Représenté par Marie Martin");
  });
});
