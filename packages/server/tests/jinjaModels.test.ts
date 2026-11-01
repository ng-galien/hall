import { generatedDocumentTemplates, jinjaBody, jinjaDocumentBodies } from "@hall/domain";
import { parse, renderHtml } from "@hall/templating";
import { renderJinja, validateJinja } from "@hall/templating/jinja";
import { describe, expect, it, vi } from "vitest";
import { createContentTemplateService } from "../src/services/contentTemplateService.js";

const member = { id: "one", name: "Élue <Une>" };
const meeting = {
  number: 7,
  startedAt: "2026-10-09T18:00:00Z",
  scheduledAt: "2026-10-09T18:00:00Z",
  closedAt: "2026-10-09T20:00:00Z",
  location: "Mairie",
  chair: member,
  secretary: member,
  chairRole: "mayor",
  reconvenedFrom: null,
};
const totals = { approve: 8, reject: 1, abstain: 2, blank: 0, invalid: 0, nonParticipation: 0 };
const quorum = { memberCount: 11, presentCount: 11, denominator: 11, requiredPresent: 6, verdict: "met" };
const point = {
  id: "point",
  number: 1,
  agendaNumber: 1,
  title: "Sujet précis",
  kind: "councilDecisionProposal",
  introducedAt: null,
  adjournedAt: null,
  completedAt: meeting.closedAt,
  subjectText: "Texte du sujet",
  narrative: "Rédaction du conseil",
  closedSession: false,
  quorumObservations: [],
  recusals: [],
  ballot: { mode: "public", result: "approve", completedAt: meeting.closedAt, totals },
};
const context = {
  hall: { name: "Commune", timeZone: "Europe/Paris" },
  meeting,
  notice: { hall: { name: "Commune" }, issuedOn: null, meeting: { ...meeting, agenda: [point] } },
  minutes: {
    meeting,
    attendance: [{ member, status: "present", proxyHolder: null }],
    conduct: {
      quorumObservations: [],
      reconvocations: [],
      auxiliaryAttendances: [],
      officerChanges: [],
      closedSessions: [],
    },
    points: [point],
  },
  decision: {
    number: "2026-01",
    documentDate: null,
    title: "Titre décision",
    content: "Décision rédigée",
    totals,
    facts: {
      hall: { name: "Commune" },
      meeting,
      opening: null,
      attendance: [{ member, status: "present", proxyHolder: null }],
      quorum,
      noticeDate: null,
      recusals: [],
      ballot: { mode: "public", result: "approve" },
    },
  },
  deliberations: [{ agendaNumber: 1, title: point.title, outcome: "adopted" }],
  dossier: {
    meeting: { ...meeting, agenda: [point] },
    point: { ...point, report: "Rapport dossier", pieces: [{ name: "Pièce A", attached: true }] },
  },
  event: {
    name: "Réunion",
    method: "cancel",
    schedule: { kind: "timed", start: meeting.startedAt, end: meeting.closedAt },
    location: "Mairie",
    content: "Invitation rédigée",
    participants: [],
  },
  generated: { bodyMarkdown: "Document rédigé", subject: "Invitation" },
};

// @verifies-requirement HALL-FR-DOC-580
// @verifies-requirement HALL-FR-CFG-020
describe("editable Markdown/Jinja default models", () => {
  it.each(Object.keys(jinjaDocumentBodies))("renders the actual default %s with structured data", (type) => {
    const source = jinjaBody(type);
    expect(() => validateJinja(source)).not.toThrow();
    const output = renderJinja(source, context);
    expect(output.trim()).not.toBe("");
    expect(output).not.toContain("[object Object]");
    expect(source).not.toMatch(/::(?:minutes|council-decision|meeting-notice|generated-content)/);
    expect(source).not.toMatch(/<\/?(?:h[1-6]|p|div|section|table|ul|li)\b/);
    expect(output).not.toMatch(/<\/?(?:h[1-6]|p|div|section|table|ul|li)\b/);
    if (type === "deliberation-list") {
      const html = renderHtml(parse(output));
      expect(html.match(/<tr>/g)).toHaveLength(2);
      expect(html).toContain("<td>Sujet précis</td>");
    }
    if (type === "minutes") {
      expect(output).toContain("Texte du sujet");
      expect(output).toContain("Rédaction du conseil");
      expect(output).toContain("Pour : 8");
      expect(output).not.toContain("Rapport dossier");
      expect(output.match(/Élue/g)).toHaveLength(3);
      expect(output).toContain("### 1. Sujet précis");
    }
  });
  it("saves exact Jinja whitespace and rejects broken syntax before persistence", async () => {
    const create = vi.fn(async (input) => input);
    const service = createContentTemplateService({
      contentTemplateRepository: { create },
      unitOfWork: { execute: async (operation: () => unknown) => operation() },
    } as never);
    const input = {
      ...generatedDocumentTemplates[0]!,
      bodyMarkdown: "{# hall:jinja #}\n{% for p in minutes.points %}\n  {{ p.title }}\n{% endfor %}\n",
      subject: null,
    };
    await service.create(input);
    expect(create).toHaveBeenLastCalledWith(input);
    await expect(service.create({ ...input, bodyMarkdown: "{% for broken %}" })).rejects.toMatchObject({
      code: "template_invalid",
    });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
