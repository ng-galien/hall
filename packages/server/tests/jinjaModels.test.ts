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
  mayor: { name: "Maire <Un>" },
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
    signatories: {
      chair: { name: "Présidente <Une>", role: "deputyMayor" },
      secretary: { name: "Secrétaire <Un>", role: "councillor" },
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
      expect(html.match(/<tr>/g)).toHaveLength(5);
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
  // @verifies-requirement HALL-FR-MIN-280
  it("closes the default minutes with the chair and secretary names, mandate roles and signature lines", () => {
    const output = renderJinja(jinjaBody("minutes"), context);
    const signatures = output.slice(output.indexOf("## Signatures"));
    expect(signatures).toContain("Séance du conseil municipal n° 7 du vendredi 9 octobre 2026, Mairie.");
    expect(signatures).toContain("| Présidence de séance | Secrétariat de séance |");
    expect(signatures).toContain(
      "| Présidente \\<Une\\>, adjoint au maire | Secrétaire \\<Un\\>, membre du conseil municipal |",
    );
    expect(signatures).toContain("| Signature : | Signature : |");
    const html = renderHtml(parse(output));
    expect(html.indexOf("Présidence de séance")).toBeGreaterThan(html.indexOf("Rédaction du conseil"));
  });

  // @verifies-requirement HALL-FR-MIN-280
  it("keeps the minutes signature offices without inventing a missing officer or mandate role", () => {
    const unnamed = {
      ...context,
      minutes: {
        ...context.minutes,
        meeting: { ...meeting, location: null },
        signatories: { chair: { name: "Présidente", role: null }, secretary: null },
      },
    };
    const output = renderJinja(jinjaBody("minutes"), unnamed);
    expect(output).toContain(", lieu non renseigné.");
    expect(output).toContain("| Présidence de séance | Secrétariat de séance |");
    expect(output).toContain("| Présidente |  |");
    expect(output).toContain("| Signature : | Signature : |");
  });

  // @verifies-requirement HALL-FR-NOT-080
  // @verifies-requirement HALL-FR-MIN-270
  it("signs the notice and the examined deliberations list by the mayor in office, or by the office alone", () => {
    for (const type of ["meeting-notice", "deliberation-list"]) {
      const output = renderJinja(jinjaBody(type), context);
      expect(output, type).toContain("| Le maire |\n| --- |\n| Maire \\<Un\\> |\n| Signature : |");
      const vacant = renderJinja(jinjaBody(type), { ...context, mayor: null });
      expect(vacant, type).toContain("| Le maire |\n| --- |\n|  |\n| Signature : |");
    }
    const message = renderJinja(jinjaBody("meeting-notice-message"), context);
    expect(message).toContain("Le maire  \nMaire \\<Un\\>");
    expect(message).not.toContain("Signature");
  });

  // @verifies-requirement HALL-FR-DEC-080
  it("signs the decision by the mayor and the meeting secretary without naming a chair who is not the mayor", () => {
    const output = renderJinja(jinjaBody("council-decision"), context);
    expect(output).toContain(
      "| Le maire | Secrétariat de séance |\n| --- | --- |\n| Élue \\<Une\\> | Élue \\<Une\\> |",
    );
    expect(output).toContain("| Signature : | Signature : |");
    const deputy = {
      ...context,
      decision: {
        ...context.decision,
        facts: { ...context.decision.facts, meeting: { ...meeting, chairRole: "deputyMayor" } },
      },
    };
    expect(renderJinja(jinjaBody("council-decision"), deputy)).toContain(
      "| Le maire | Secrétariat de séance |\n| --- | --- |\n|  | Élue \\<Une\\> |",
    );
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
