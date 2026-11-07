import { writeFile } from "node:fs/promises";
import type { MinutesDetail } from "@hall/api-contract";
import { defaultDocumentTemplates } from "@hall/domain";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it, vi } from "vitest";
import { RequestContextStore } from "../src/security/requestContext.js";
import { createDocumentRenderer } from "../src/services/documentRenderer.js";
import { minutesTemplateData } from "../src/services/templateData.js";
import { createTemplateRenderingService } from "../src/services/templateRendering.js";

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

const mandates = [
  { id: "chair", role: "mayor", active: true, contactId: "contact-chair" },
  { id: "secretary", role: "councillor", active: true, contactId: "contact-secretary" },
];
const contacts = [
  { id: "contact-chair", firstName: "Marie", lastName: "Martin" },
  { id: "contact-secretary", firstName: "Jean", lastName: "Dupont" },
];

function service(minutes = fixture, members = mandates) {
  const openAgendaItem = vi.fn(async (id: string) => ({
    id,
    subject: { kind: "openQuestion", content: "Question **actuelle**." },
  }));
  const dependencies = {
    hallSettingsRepository: { get: async () => ({ name: "Commune test", timeZone: "Europe/Paris" }) },
    councilClient: { openAgendaItem },
    minutesClient: { open: async () => minutes },
    resourcesClient: {},
    geographicMapRenderer: {},
    referenceEntityResolver: {},
    directoryClient: {
      listCouncilMembers: async () => members,
      openCouncilMember: async (id: string) => members.find((member) => member.id === id) ?? null,
      openContact: async (id: string) => contacts.find((contact) => contact.id === id) ?? null,
    },
  } as unknown as Parameters<typeof createTemplateRenderingService>[0];
  return { renderer: createTemplateRenderingService(dependencies), openAgendaItem };
}

const template = {
  bodyMarkdown: `{# hall:jinja #}
{% for point in minutes.points %}
## {{ point.number }}. {{ point.title | text }}

{% if point.subjectText %}
{{ point.subjectText }}
{% endif %}

{{ point.narrative }}

{% if point.ballot %}
Pour : {{ point.ballot.totals.approve }}
{% endif %}
{% endfor %}`,
  stylesheet: "h2 { break-after: avoid; } table { break-inside: avoid; }",
  subject: null,
  headerHtml: "{{ hall.name | text }}",
  footerHtml: "Page :page-number / :page-count",
};

describe("structured Jinja document rendering", () => {
  it("lets the saved source reorder and omit municipal fields without code changes", async () => {
    const minutes = structuredClone(fixture);
    minutes.facts.agenda[0]!.kind = "councilDecisionProposal";
    minutes.facts.agenda[0]!.title = "Sujet <distinct>";
    minutes.facts.agenda[0]!.proposal = "Texte du sujet.";
    const { renderer } = service(minutes);
    const before = structuredClone(minutes);
    const preview = await renderer.preview(template, { minutesId: minutes.id });
    expect(preview.diagnostics).toEqual([]);
    expect(preview.html).toContain("Sujet &#x3C;distinct>");
    expect(preview.resolvedMarkdown).toContain("## 1. Sujet");
    expect(preview.resolvedMarkdown).not.toContain("<h2>");
    expect(preview.html).toContain("Texte du sujet.");
    expect(preview.html).toContain("Une correction de rédaction.");
    expect(preview.html).toContain("Pour : 1");
    expect(preview.html).not.toContain("Rapport figé");
    expect(preview.html).not.toContain("<script>");
    expect(preview.headerHtml).toContain("Commune test");
    expect(preview.footerHtml).toContain('class="pageNumber"');
    const changed = await renderer.preview(
      {
        ...template,
        bodyMarkdown: "{% for p in minutes.points %}{{ p.ballot.totals.approve }}\n\n{{ p.subjectText }}\n{% endfor %}",
      },
      { minutesId: minutes.id },
    );
    expect(changed.html.indexOf("<p>1</p>")).toBeLessThan(changed.html.indexOf("Texte du sujet"));
    expect(changed.html).not.toContain("Une correction de rédaction");
    expect(minutes).toEqual(before);
  });
  it("reads current question text separately and never relabels it as a historical copy", async () => {
    const minutes = structuredClone(fixture);
    minutes.facts.agenda[0]!.kind = "openQuestion";
    const { renderer, openAgendaItem } = service(minutes);
    const preview = await renderer.preview(
      {
        ...template,
        bodyMarkdown: "{% for p in minutes.points %}{{ p.subjectSource }} {{ p.subjectText|markdown }}{% endfor %}",
      },
      { minutesId: minutes.id },
    );
    expect(openAgendaItem).toHaveBeenCalledWith("agenda");
    expect(preview.diagnostics).toEqual([]);
    expect(preview.html).toContain("currentResource");
    expect(preview.html).toContain("<strong>actuelle</strong>");
    expect(minutesTemplateData(minutes, new Map()).points[0]!.subjectSource).toBe("missing");
  });
  it("preserves numbered agenda lists and plain text entities in messages", async () => {
    const { renderer } = service();
    const preview = await renderer.preview({
      ...template,
      bodyMarkdown: '{% for n in [3, 4] %}{{ n }}. {{ "A & B" | text }}\n{% endfor %}',
      subject: '{{ "A & B" }}',
    });
    expect(preview.html).toContain('<ol start="3">');
    expect(preview.text).toContain("A & B");
    expect(preview.subject).toBe("A & B");
  });

  it("renders a Markdown decoration logo at the existing bounded size", async () => {
    const { renderer } = service();
    const preview = await renderer.preview({
      ...template,
      bodyMarkdown: "# Document",
      headerHtml: "![Logo](data:image/png;base64,AA==)",
    });
    expect(preview.headerHtml).toContain("data:image/png;base64,AA==");
    expect(preview.headerHtml).toContain("width:35mm");
    expect(preview.headerHtml).toContain("max-height:18mm");
  });

  it("reports missing fields and syntax errors instead of producing silent blank documents", async () => {
    const { renderer } = service();
    for (const source of ["{{ nonexistent.value }}", "{% for broken %}"]) {
      const preview = await renderer.preview({ ...template, bodyMarkdown: source });
      expect(preview.diagnostics.some((item) => item.severity === "error" && item.anchor.directive === "jinja")).toBe(
        true,
      );
    }
  });
  it("renders structured dossier/event data and keeps Jinja out of authored text", async () => {
    const { renderer } = service();
    const preview = await renderer.preview(
      {
        ...template,
        bodyMarkdown:
          "# {{ event.name | text }}\n\n{% for piece in dossier.point.pieces %}- {{ piece.name | text }}\n{% endfor %}\n{{ generated.bodyMarkdown }}",
      },
      {},
      undefined,
      undefined,
      {
        generated: {
          bodyMarkdown: "Texte littéral {{ not_a_template }}",
          subject: null,
          data: {
            event: { name: "Réunion" },
            dossier: { point: { pieces: [{ name: "Pièce A" }, { name: "Pièce B" }] } },
          },
        },
      },
    );
    expect(preview.diagnostics).toEqual([]);
    expect(preview.html).toContain("Réunion");
    expect(preview.html).toContain("Pièce A");
    expect(preview.html).toContain("{{ not_a_template }}");
  });
});

describe("Jinja PDF layout", () => {
  it("uses template page breaks and repeating footer counters through the official PDF renderer", async () => {
    const { renderer } = service();
    const preview = await renderer.preview({
      ...template,
      bodyMarkdown: `{% for chapter in range(1, 4) %}
{% if not loop.first %}
::page-break
{% endif %}

# Conseil municipal - point {{ chapter }}

## Texte du sujet

Un sujet distinct pour contrôler le titre, les retours à la ligne et la séparation du compte rendu.

## Rédaction du conseil

{% for paragraph in range(1, 7) %}
Paragraphe {{ paragraph }}. Le conseil examine la proposition présentée. Les membres échangent sur sa réalisation et ses conditions. La rédaction conserve le contenu de la discussion.

{% endfor %}
## Résultat du vote

| Pour | Contre | Abstentions |
| --- | --- | --- |
| 9 | 0 | 1 |

{% endfor %}`,
      stylesheet: "@page { size: A4; } table { break-inside: avoid; }",
      footerHtml: "Hall - :page-number / :page-count",
    });
    expect(preview.diagnostics).toEqual([]);
    const bytes = await createDocumentRenderer().pdf({
      html: preview.printHtml,
      headerHtml: preview.headerHtml,
      footerHtml: preview.footerHtml,
    });
    expect(preview.resolvedMarkdown).toContain("# Conseil municipal - point 1");
    expect(preview.resolvedMarkdown).toContain("| 9 | 0 | 1 |");
    expect(preview.resolvedMarkdown).not.toContain("<table>");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
    if (process.env.HALL_JINJA_PROOF_PATH) await writeFile(process.env.HALL_JINJA_PROOF_PATH, bytes);
  }, 30_000);
});

async function pdfText(bytes: Uint8Array): Promise<string> {
  const loading = getDocument({ data: bytes, useSystemFonts: true });
  try {
    const pdf = await loading.promise;
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const content = await (await pdf.getPage(number)).getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? " " : "") : "")).join(""));
    }
    return pages.join(" ").replace(/\s+/g, " ").trim();
  } finally {
    await loading.destroy();
  }
}

const defaultTemplate = (documentType: string) =>
  defaultDocumentTemplates.find((entry) => entry.documentType === documentType)!;

async function renderedPdf(preview: { printHtml: string; headerHtml: string; footerHtml: string }) {
  const bytes = await createDocumentRenderer().pdf({
    html: preview.printHtml,
    headerHtml: preview.headerHtml,
    footerHtml: preview.footerHtml,
  });
  return pdfText(new Uint8Array(bytes));
}

describe("signature blocks of the default PDF documents", () => {
  // @verifies-requirement HALL-FR-MIN-280
  it("ends the minutes PDF with the chair and secretary, their mandate roles and signature lines", async () => {
    const { renderer } = service();
    const preview = await renderer.preview(defaultTemplate("minutes"), { minutesId: fixture.id });
    expect(preview.diagnostics).toEqual([]);
    expect(preview.resolvedMarkdown).toContain("| Présidence de séance | Secrétariat de séance |");
    expect(preview.resolvedMarkdown).toContain("| Marie Martin, maire | Jean Dupont, membre du conseil municipal |");
    const text = await renderedPdf(preview);
    const signatures = text.slice(text.lastIndexOf("Signatures"));
    expect(signatures).toContain("Séance du conseil municipal n° 1 du samedi 5 septembre 2026, Salle <A>.");
    expect(signatures).toMatch(
      /Présidence de séance Secrétariat de séance Marie Martin, maire Jean Dupont, membre du conseil municipal Signature : Signature :/,
    );
  }, 30_000);

  // @verifies-requirement HALL-FR-MIN-280
  it("leaves the role and signature line of an officer whose mandate cannot be read", async () => {
    const { renderer } = service(fixture, []);
    const preview = await renderer.preview(defaultTemplate("minutes"), { minutesId: fixture.id });
    expect(preview.diagnostics).toEqual([]);
    expect(preview.resolvedMarkdown).toContain("| Marie Martin | Jean Dupont |");
    expect(preview.resolvedMarkdown).toContain("| Signature : | Signature : |");
  });

  // @verifies-requirement HALL-FR-MIN-280
  it("renders unnamed signature blocks without reading the directory outside an authenticated request", async () => {
    const listCouncilMembers = vi.fn(async () => mandates);
    const renderer = createTemplateRenderingService({
      hallSettingsRepository: { get: async () => ({ name: "Commune test", timeZone: "Europe/Paris" }) },
      councilClient: {},
      minutesClient: { open: async () => fixture },
      resourcesClient: {},
      geographicMapRenderer: {},
      referenceEntityResolver: {},
      directoryClient: { listCouncilMembers },
      requestContext: new RequestContextStore(),
    } as unknown as Parameters<typeof createTemplateRenderingService>[0]);
    const preview = await renderer.preview(defaultTemplate("minutes"), { minutesId: fixture.id });
    expect(preview.diagnostics).toEqual([]);
    expect(listCouncilMembers).not.toHaveBeenCalled();
    expect(preview.resolvedMarkdown).toContain("| Marie Martin | Jean Dupont |");
    expect(preview.resolvedMarkdown).toContain("| Signature : | Signature : |");
  });

  // @verifies-requirement HALL-FR-MIN-270
  // @verifies-requirement HALL-FR-NOT-080
  it("signs the examined deliberations list and the notice PDFs by the mayor in office", async () => {
    const { renderer } = service();
    const list = await renderer.preview(defaultTemplate("deliberation-list"), { minutesId: fixture.id });
    expect(list.diagnostics).toEqual([]);
    expect(await renderedPdf(list)).toContain("Adoptée Le maire Marie Martin Signature :");
    const notice = await renderer.preview(
      defaultTemplate("meeting-notice"),
      {},
      {
        issuedOn: "2026-08-28",
        hall: { name: "Commune test", timeZone: "Europe/Paris" },
        meeting: {
          id: "00000000-0000-4000-8000-000000000001",
          number: 1,
          scheduledAt: fixture.facts.meeting.scheduledAt!,
          location: "Salle du conseil",
          agendaFrozenAt: "2026-08-28T08:00:00Z",
          agenda: [
            {
              id: "00000000-0000-4000-8000-000000000002",
              position: 1,
              agendaNumber: 1,
              title: "",
              kind: "minutesApproval",
            },
          ],
        },
      },
    );
    expect(notice.diagnostics).toEqual([]);
    expect(await renderedPdf(notice)).toContain(
      "Arrêt du procès-verbal de la séance précédente Le maire Marie Martin Signature :",
    );
    const vacant = await service(fixture, []).renderer.preview(defaultTemplate("deliberation-list"), {
      minutesId: fixture.id,
    });
    expect(vacant.resolvedMarkdown).toContain("| Le maire |\n| --- |\n|  |\n| Signature : |");
  }, 30_000);
});
