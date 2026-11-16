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
  hall: { name: "Commune", postalCode: "", city: "", timeZone: "Europe/Paris" },
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

/** Text of a rendered Markdown output, without markup, in reading order. */
const plainText = (markdown: string) =>
  renderHtml(parse(markdown))
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();

/** The signature block, and the municipality block of the minutes, are the only HTML written in the default sources. */
const withoutSignatureMarkup = (value: string) =>
  value.replaceAll(
    /<div class="hall-(?:commune|signature|signatures|signatories)(?: hall-signatures-handwritten)?">|<\/div>|<span class="hall-fill hall-fill-(?:place|date)"><\/span>/g,
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
      expect(output).not.toContain("Texte du sujet");
      expect(output).not.toContain("Sujet présenté");
      expect(output).toContain("#### Discussion\n\nRédaction du conseil");
      expect(output.trimStart()).toMatch(
        /^<div class="hall-commune">\n\nCommune\n\n<\/div>\n\n# Procès-verbal du conseil/,
      );
      expect(output).toContain("Pour : 8");
      expect(output).not.toContain("Rapport dossier");
      expect(output.match(/Élue/g)).toHaveLength(3);
      expect(output).toContain("### 1. Sujet précis");
    }
  });
  // @verifies-requirement HALL-FR-MIN-280
  // @verifies-requirement HALL-FR-MIN-290
  it("closes the default minutes with the secretary on the left and the chair on the right, without a table", () => {
    const output = renderJinja(jinjaBody("minutes"), context);
    expect(signatureBlock(output)).toBe(
      "Fait à , le Le secrétaire de séance Secrétaire &#x3C;Un> membre du conseil municipal Le président de séance Présidente &#x3C;Une> adjoint au maire",
    );
    expect(output).toContain(
      '<div class="hall-signature">\n\nLe président de séance\n\nPrésidente \\<Une\\>\n\nadjoint au maire\n\n</div>',
    );
    expect(output).toContain(
      '<div class="hall-signatures hall-signatures-handwritten">\n\nFait à <span class="hall-fill hall-fill-place"></span>, le <span class="hall-fill hall-fill-date"></span>',
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
      "Fait à , le Le secrétaire de séance Le président de séance Présidente",
    );
    const mayor = {
      ...context,
      minutes: {
        ...context.minutes,
        signatories: { ...context.minutes.signatories, chair: { name: "Maire", role: "mayor" } },
      },
    };
    expect(signatureBlock(renderJinja(jinjaBody("minutes"), mayor))).toBe(
      "Fait à , le Le secrétaire de séance Secrétaire &#x3C;Un> membre du conseil municipal Le président de séance Maire maire",
    );
  });

  // @verifies-requirement HALL-FR-MIN-240
  it("names the meeting chair and secretary at the opening of the minutes", () => {
    const output = renderJinja(jinjaBody("minutes"), context);
    expect(plainText(output)).toContain(
      "Lieu : Mairie Président de séance : Élue &#x3C;Une> Secrétaire de séance : Élue &#x3C;Une>",
    );
    expect(output).toMatch(/\nPrésident de séance : .+ {2}\nSecrétaire de séance : .+\n/);
    const unrecorded = {
      ...context,
      minutes: { ...context.minutes, meeting: { ...meeting, chair: null, secretary: null } },
    };
    expect(plainText(renderJinja(jinjaBody("minutes"), unrecorded))).toContain(
      "Président de séance : Non renseigné Secrétaire de séance : Non renseigné",
    );
  });

  // @verifies-requirement HALL-FR-AGI-410
  it("prints the questions added during the meeting in their own section after the convened points", () => {
    const added = {
      ...point,
      id: "added",
      number: 3,
      title: "Question du public",
      kind: "openQuestion",
      introducedAt: "2026-10-09T19:30:00Z",
      narrative: "Réponse du maire",
      ballot: null,
    };
    const second = { ...point, id: "second", number: 2, title: "Second point", narrative: "Deuxième rédaction" };
    const output = renderJinja(jinjaBody("minutes"), {
      ...context,
      minutes: { ...context.minutes, points: [point, added, second] },
    });
    const html = renderHtml(parse(output));
    const positions = [
      "<h2>Examen des points</h2>",
      "<h3>1. Sujet précis</h3>",
      "<h3>2. Second point</h3>",
      "<h2>Questions ajoutées en séance</h2>",
      "<h3>3. Question du public</h3>",
      "<p>Question ajoutée en séance le 9 octobre 2026 à 21:30.</p>",
      "Réponse du maire",
      'class="hall-signatures',
    ].map((fragment) => html.indexOf(fragment));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual(positions.toSorted((left, right) => left - right));
    expect(html.match(/Question du public/g)).toHaveLength(1);

    const convened = renderHtml(parse(renderJinja(jinjaBody("minutes"), context)));
    expect(convened).not.toContain("Questions ajoutées en séance");
    expect(convened).not.toContain("Question ajoutée en séance");
  });

  // @verifies-requirement HALL-FR-MIN-260
  // @verifies-requirement HALL-FR-ATT-140
  // @verifies-requirement HALL-FR-MTG-350
  it("mentions the persons attending, the officer handovers and the closed sessions", () => {
    const output = renderJinja(jinjaBody("minutes"), {
      ...context,
      minutes: {
        ...context.minutes,
        conduct: {
          ...context.minutes.conduct,
          auxiliaryAttendances: [
            { name: "Claire <Martin>", quality: "secrétaire de mairie" },
            { name: "Jean Libre", quality: null },
          ],
          officerChanges: [
            {
              observedAt: "2026-10-09T18:30:00Z",
              office: "chair",
              memberName: "Paul Adjoint",
              basis: "deputyInNominationOrder",
            },
            {
              observedAt: "2026-10-09T18:31:00Z",
              office: "secretary",
              memberName: "Lise Conseillère",
              basis: "councilNomination",
            },
          ],
          closedSessions: [
            {
              observedAt: "2026-10-09T18:40:00Z",
              requesters: [{ name: "Maire" }],
              approvals: 5,
              presentOrRepresented: 9,
              wholeMeeting: false,
              agendaItemIds: ["point"],
            },
          ],
        },
        points: [{ ...point, closedSession: true }],
      },
    });
    const text = plainText(output);
    expect(text).toContain("Assistaient également : Claire &#x3C;Martin> (secrétaire de mairie) Jean Libre");
    expect(text).toContain("présidence confiée à Paul Adjoint (adjoint dans l’ordre des nominations)");
    expect(text).toContain("secrétariat confié à Lise Conseillère (nomination par le conseil)");
    expect(text).toContain(
      "huis clos décidé sans débat sur demande de Maire, par 5 voix sur 9 membres présents ou représentés, pour les points 1.",
    );
    expect(text).toContain("1. Sujet précis Point examiné à huis clos.");
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
  it("signs the decision by the meeting secretary and the mayor without naming a chair who is not the mayor", () => {
    expect(signatureBlock(renderJinja(jinjaBody("council-decision"), context))).toBe(
      "Fait à Commune, le 9 octobre 2026 Le secrétaire de séance Élue &#x3C;Une> Le maire Élue &#x3C;Une>",
    );
    const deputy = {
      ...context,
      decision: {
        ...context.decision,
        facts: { ...context.decision.facts, meeting: { ...meeting, chairRole: "deputyMayor" } },
      },
    };
    expect(signatureBlock(renderJinja(jinjaBody("council-decision"), deputy))).toBe(
      "Fait à Commune, le 9 octobre 2026 Le secrétaire de séance Élue &#x3C;Une> Le maire",
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
  it("leaves an unset meeting date to be filled in by hand with both councillors identified", () => {
    const blank = renderJinja(jinjaBody("proxy-form"), {
      ...context,
      proxy: { ...context.proxy, meeting: { number: 8, startsAt: null, location: null } },
    });
    const html = renderHtml(parse(blank));
    expect(html).toContain("donne pouvoir à <strong>Adjointe Deux</strong>, adjoint au maire");
    expect(html).toContain('séance du conseil municipal du <span class="hall-fill hall-fill-date"></span>');
    expect(html).not.toContain("hall-fill-holder");
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
