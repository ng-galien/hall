import { describe, expect, it } from "vitest";
import {
  defaultDocumentTemplates,
  generatedDocumentTemplates,
  generatedDocumentTypes,
} from "../src/generatedDocumentTemplates.js";
import { jinjaBody } from "../src/jinjaDocumentTemplates.js";

const families = [
  ["meeting-notice", "pdf", "Convocation au conseil municipal"],
  ["meeting-notice-message", "message", "Le PDF de la convocation est joint"],
  ["minutes", "pdf", "Procès-verbal du conseil"],
  ["council-decision", "pdf", "Extrait du registre des délibérations"],
  ["deliberation-list", "pdf", "Liste des délibérations examinées"],
  ["attendance-sheet", "pdf", "Feuille d’émargement"],
  ["proxy-form", "pdf", "donne pouvoir à"],
  ["document-print", "pdf", "{{ generated.bodyMarkdown | markdown }}"],
  ["meeting-dossier-cover", "pdf", "Dossier de séance"],
  ["meeting-dossier-point", "pdf", "{{ dossier.point.title | text }}"],
  ["event-invitation", "message", "{{ event.name | text }}"],
] as const;

// @verifies-requirement HALL-FR-CFG-020
describe("canonical document template catalogue", () => {
  it("offers exactly the eleven distinct editable document families", () => {
    expect(defaultDocumentTemplates.map((template) => template.documentType)).toEqual(families.map(([type]) => type));
    expect(new Set(defaultDocumentTemplates.map((template) => template.name)).size).toBe(11);
  });

  it.each(families)("publishes a readable %s source with its %s presentation", (type, kind, content) => {
    const template = defaultDocumentTemplates.find((entry) => entry.documentType === type)!;
    expect(template.kind).toBe(kind);
    expect(template.name.length).toBeGreaterThan(0);
    expect(template.bodyMarkdown).toContain(content);
    expect(jinjaBody(type)).toContain(content);
    expect(template.bodyMarkdown).toMatch(/^\{# hall:jinja #\}\n/);
    expect(template.bodyMarkdown).not.toMatch(/::(?:meeting-notice|minutes|council-decision)|:field\{/);
    if (kind === "pdf") {
      expect(template.subject).toBeNull();
      expect(template.stylesheet).toContain("break-after: avoid");
      if (type === "proxy-form") {
        expect(template.headerHtml).toBe("");
        expect(template.bodyMarkdown).toMatch(/^Commune .*\{\{ commune \| text \}\}/m);
      } else {
        expect(template.headerHtml).toContain("{{ hall.name | text }}");
      }
      expect(template.footerHtml).toContain(":page-number / :page-count");
    } else {
      expect(template.stylesheet).toBe("");
      expect(template.headerHtml).toBe("");
      expect(template.footerHtml).toBe("");
      expect(template.subject).toContain(
        type === "event-invitation" ? "generated.subject" : "notice.meeting.scheduledAt",
      );
    }
  });

  it("initializes the four generated families with the same full canonical presentation", () => {
    const types = ["document-print", "meeting-dossier-cover", "meeting-dossier-point", "event-invitation"];
    expect(generatedDocumentTypes).toEqual(types);
    expect(generatedDocumentTemplates.map((template) => template.documentType)).toEqual(types);
    for (const template of generatedDocumentTemplates)
      expect(template).toEqual(defaultDocumentTemplates.find((entry) => entry.documentType === template.documentType));
  });
});
