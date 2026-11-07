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
  attendanceSheet: {
    meeting: { number: 7, startsAt: meeting.startedAt, location: "Mairie" },
    members: [{ name: "Maire <Un>" }, { name: "Adjointe | Deux" }, { name: "Conseiller Trois" }],
  },
  proxy: {
    meeting: { number: 7, startsAt: meeting.startedAt, location: "Mairie" },
    grantor: { id: "m3", name: "Conseiller Trois", role: "councillor" },
    holder: { id: "m2", name: "Adjointe Deux", role: "deputyMayor" },
  },
};

/** Text of the administrative signature block, in reading order, from the rendered HTML. */
function signatureBlock(markdown: string): string {
  const html = renderHtml(parse(markdown));
  const start = html.indexOf('<div class="hall-signatures');
  expect(start, "signature block").toBeGreaterThanOrEqual(0);
  return html
    .slice(start)
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

/** The signature block is the only HTML written in the default sources. */
const withoutSignatureMarkup = (value: string) =>
  value.replaceAll(
    /<div class="hall-(?:signature|signatures|signatories)(?: hall-signatures-handwritten)?">|<\/div>|<span class="hall-fill hall-fill-(?:place|date)"><\/span>/g,
    "",
  );

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
    expect(withoutSignatureMarkup(source)).not.toMatch(/<\/?(?:h[1-6]|p|div|section|table|ul|li)\b/);
    expect(withoutSignatureMarkup(output)).not.toMatch(/<\/?(?:h[1-6]|p|div|section|table|ul|li)\b/);
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
  // @verifies-requirement HALL-FR-MIN-280
  it("closes the default minutes with the chair and secretary side by side, without a table", () => {
    const output = renderJinja(jinjaBody("minutes"), context);
    expect(signatureBlock(output)).toBe(
      "Fait à Commune, le 9 octobre 2026 Présidence de séance Présidente &#x3C;Une>, adjoint au maire Secrétariat de séance Secrétaire &#x3C;Un>, membre du conseil municipal",
    );
    const html = renderHtml(parse(output));
    expect(html.indexOf("hall-signatures")).toBeGreaterThan(html.indexOf("Rédaction du conseil"));
    expect(html.slice(html.indexOf("hall-signatures"))).not.toContain("<table");
    expect(html.match(/class="hall-signature"/g)).toHaveLength(2);
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
    expect(signatureBlock(renderJinja(jinjaBody("minutes"), unnamed))).toBe(
      "Fait à Commune, le 9 octobre 2026 Présidence de séance Présidente Secrétariat de séance",
    );
  });

  // @verifies-requirement HALL-FR-NOT-080
  // @verifies-requirement HALL-FR-MIN-270
  it("signs the notice and the examined deliberations list by the mayor in office, or by the office alone", () => {
    const issued = { ...context, notice: { ...context.notice, issuedOn: "2026-10-01" } };
    expect(signatureBlock(renderJinja(jinjaBody("meeting-notice"), issued))).toBe(
      "Fait à Commune, le 1 octobre 2026 Le maire Maire &#x3C;Un>",
    );
    expect(signatureBlock(renderJinja(jinjaBody("meeting-notice"), { ...context, mayor: null }))).toBe(
      "Fait à Commune, le …… Le maire",
    );
    expect(signatureBlock(renderJinja(jinjaBody("deliberation-list"), context))).toBe(
      "Fait à Commune, le 9 octobre 2026 Le maire Maire &#x3C;Un>",
    );
    const message = renderJinja(jinjaBody("meeting-notice-message"), context);
    expect(message).toContain("Le maire  \nMaire \\<Un\\>");
    expect(message).not.toContain("hall-signature");
  });

  // @verifies-requirement HALL-FR-DEC-080
  it("signs the decision by the mayor and the meeting secretary without naming a chair who is not the mayor", () => {
    expect(signatureBlock(renderJinja(jinjaBody("council-decision"), context))).toBe(
      "Fait à Commune, le 9 octobre 2026 Le maire Élue &#x3C;Une> Secrétariat de séance Élue &#x3C;Une>",
    );
    const deputy = {
      ...context,
      decision: {
        ...context.decision,
        facts: { ...context.decision.facts, meeting: { ...meeting, chairRole: "deputyMayor" } },
      },
    };
    expect(signatureBlock(renderJinja(jinjaBody("council-decision"), deputy))).toBe(
      "Fait à Commune, le 9 octobre 2026 Le maire Secrétariat de séance Élue &#x3C;Une>",
    );
  });

  // @verifies-requirement HALL-FR-ATT-170
  it("lists every member on the attendance sheet with a blank signature column only", () => {
    const html = renderHtml(parse(renderJinja(jinjaBody("attendance-sheet"), context)));
    expect(html).toContain("<h1>Feuille d’émargement</h1>");
    expect(html).toContain("Séance du conseil municipal n° 7 du vendredi 9 octobre 2026 à 20:00");
    expect(html).toContain("<th>Nom et prénom</th><th>Signature</th>");
    expect(html.match(/<th>/g)).toHaveLength(2);
    expect(html).toContain("<td>Maire &#x3C;Un></td><td></td>");
    expect(html).toContain("<td>Adjointe | Deux</td><td></td>");
    expect(html).toContain("<td>Conseiller Trois</td><td></td>");
    expect(html).not.toMatch(/Qualité|Pouvoir|Présent|hall-signatures/);
    const unscheduled = renderJinja(jinjaBody("attendance-sheet"), {
      ...context,
      attendanceSheet: { ...context.attendanceSheet, meeting: { number: 8, startsAt: null, location: null } },
    });
    expect(unscheduled).toContain("Séance du conseil municipal n° 8  \nLieu : Non renseigné");
  });

  // @verifies-requirement HALL-FR-ATT-180
  it("writes the proxy form with the grantor, the holder, the legal reminder and the grantor signature", () => {
    const output = renderJinja(jinjaBody("proxy-form"), context);
    const text = renderHtml(parse(output))
      .replaceAll(/<[^>]+>/g, " ")
      .replaceAll(/\s+/g, " ");
    expect(text).toContain(
      "Je soussigné(e) Conseiller Trois , membre du conseil municipal de la commune de Commune, donne pouvoir à Adjointe Deux , adjoint au maire, pour me représenter et prendre part en mon nom à tous les votes lors de la séance du conseil municipal du 9 octobre 2026.",
    );
    expect(text).toContain("ne peut être porteur que d’un seul pouvoir");
    expect(text).toContain("congé de maternité");
    expect(signatureBlock(output)).toBe("Fait à , le Le mandant Conseiller Trois");
    expect(renderHtml(parse(output))).toContain(
      'Fait à <span class="hall-fill hall-fill-place"></span>, le <span class="hall-fill hall-fill-date"></span>',
    );
    expect(renderHtml(parse(output))).toContain("<h1>Pouvoir</h1>");
    const elided = renderJinja(jinjaBody("proxy-form"), { ...context, hall: { ...context.hall, name: "Alésia" } });
    expect(elided).toContain("de la commune d’Alésia");
  });

  // @verifies-requirement HALL-FR-ATT-180
  it("leaves the holder and an unset meeting date to be filled in by hand", () => {
    const blank = renderJinja(jinjaBody("proxy-form"), {
      ...context,
      proxy: { ...context.proxy, holder: null, meeting: { number: 8, startsAt: null, location: null } },
    });
    const html = renderHtml(parse(blank));
    expect(html).toContain('donne pouvoir à <span class="hall-fill hall-fill-holder"></span>, pour me représenter');
    expect(html).toContain('Séance du conseil municipal du <span class="hall-fill hall-fill-date"></span>');
    expect(html).not.toContain("adjoint au maire");
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
