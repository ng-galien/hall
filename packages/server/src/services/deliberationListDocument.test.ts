import type { MinutesFacts } from "@hall/api-contract";
import { describe, expect, it } from "vitest";
import { examinedDeliberations, renderDeliberationList } from "./deliberationListDocument.js";

const item = (id: string, position: number, kind: MinutesFacts["agenda"][number]["kind"], title: string) => ({
  id,
  position,
  agendaNumber: position,
  introducedAt: null,
  title,
  kind,
  report: "",
  proposal: null,
  discussionSummary: "",
  startedAt: "2026-09-05T18:10:00Z",
  completedAt: "2026-09-05T18:20:00Z",
  adjournedAt: null,
});

const ballot = (agendaItemId: string, result: "approve" | "reject") => ({
  id: `ballot-${agendaItemId}`,
  agendaItemId,
  mode: "public" as const,
  result,
  completedAt: "2026-09-05T18:20:00Z",
  nonParticipations: [],
  votes: [],
});

const facts: MinutesFacts = {
  meeting: {
    id: "meeting",
    number: 4,
    scheduledAt: "2026-09-05T18:00:00Z",
    startedAt: "2026-09-05T18:05:00Z",
    closedAt: "2026-09-05T20:00:00Z",
    location: null,
    quorum: 8,
    chair: null,
    secretary: null,
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
  attendance: [],
  agenda: [
    item("question", 4, "openQuestion", "Question <orale>"),
    item("minutes", 1, "minutesApproval", ""),
    item("rejected", 3, "councilDecisionProposal", "Projet rejeté"),
    item("adopted", 2, "councilDecisionProposal", "Projet adopté"),
    { ...item("adjourned", 5, "councilDecisionProposal", "Projet ajourné"), adjournedAt: "2026-09-05T19:00:00Z" },
  ],
  ballots: [ballot("minutes", "approve"), ballot("adopted", "approve"), ballot("rejected", "reject")],
};

describe("list of examined deliberations", () => {
  // @verifies-requirement HALL-FR-MIN-270
  it("lists each examined item in agenda order with its outcome and leaves adjourned items out", () => {
    expect(examinedDeliberations(facts)).toEqual([
      { agendaNumber: 1, title: "Arrêt du procès-verbal de la séance précédente", outcome: "adopted" },
      { agendaNumber: 2, title: "Projet adopté", outcome: "adopted" },
      { agendaNumber: 3, title: "Projet rejeté", outcome: "rejected" },
      { agendaNumber: 4, title: "Question <orale>", outcome: "withoutVote" },
    ]);
    const html = renderDeliberationList(facts, { name: "Alésia", timeZone: "Europe/Paris" });
    expect(html).toContain("Séance du conseil municipal n° 4 du samedi 5 septembre 2026");
    expect(html).toContain("<td>2</td><td>Projet adopté</td><td>Adoptée</td>");
    expect(html).toContain("<td>3</td><td>Projet rejeté</td><td>Rejetée</td>");
    expect(html).toContain("<td>4</td><td>Question &lt;orale&gt;</td><td>Sans vote</td>");
    expect(html).not.toContain("Projet ajourné");
  });
});
