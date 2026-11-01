import type { ContentTemplate, HallSettings } from "@hall/domain";
import { generatedDocumentTemplates } from "@hall/domain";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { postgresDocumentConfigurationMigration } from "../infrastructure/postgres/schema.js";
import type { PdfRenderInput } from "../services/documentRenderer.js";
import { createTestServer, domainBody } from "./testServer.js";

// @verifies-requirement HALL-FR-CFG-020
// @verifies-requirement HALL-FR-CFG-030
describe("generated document configuration", () => {
  it("applies stored wrappers, PDF presentation, mail signature and footer to future output", async () => {
    const printed: PdfRenderInput[] = [];
    const server = await createTestServer({
      documentRenderer: {
        pdf: async (input) => {
          printed.push(input);
          return Buffer.from("PDF");
        },
        appendPdfs: async (content) => content,
      },
    });
    const { agent, container } = server;
    const settings = domainBody<HallSettings>(await agent.get("/api/settings").expect(200));
    await agent
      .put("/api/settings")
      .send({
        ...settings,
        name: "Test municipality",
        outboundEmailSenderAddress: "sender@example.test",
        outboundEmailSignatureMarkdown: "Signature UNIQUE",
        outboundEmailFooterMarkdown: "Footer UNIQUE",
      })
      .expect(200);
    const templates = domainBody<ContentTemplate[]>(await agent.get("/api/templates").expect(200));
    expect(
      generatedDocumentTemplates.every((type) => templates.some((entry) => entry.documentType === type.documentType)),
    ).toBe(true);
    for (const type of ["document-print", "meeting-dossier-cover", "meeting-dossier-point"] as const) {
      const original = templates.find((entry) => entry.documentType === type)!;
      const input = {
        ...original,
        bodyMarkdown: "# Custom wrapper\n\n::generated-content\n\nEnd wrapper",
        stylesheet: "h1 { color: #123456; }",
        headerHtml: "<div>Header UNIQUE</div>",
        footerHtml: "<div>Page UNIQUE</div>",
      };
      await agent.put(`/api/templates/${original.id}`).send(input).expect(200);
      await container.cradle.contentTemplateService.generatedPdf(type, "# Original fact\n\nContent remains here.");
      const output = printed.at(-1)!;
      expect(output.html).toContain("Original fact");
      expect(output.html).toContain("Custom wrapper");
      expect(output.html).toContain("#123456");
      expect(output.headerHtml).toContain("Header UNIQUE");
      expect(output.footerHtml).toContain("Page UNIQUE");
      await agent
        .put(`/api/templates/${original.id}`)
        .send({ ...input, bodyMarkdown: "No source facts" })
        .expect(422);
      await agent
        .put(`/api/templates/${original.id}`)
        .send({ ...input, bodyMarkdown: "::generated-content\n\n::generated-content" })
        .expect(422);
      expect(domainBody<ContentTemplate>(await agent.get(`/api/templates/${original.id}`)).bodyMarkdown).toContain(
        "Custom wrapper",
      );
    }
    const eventTemplate = templates.find((entry) => entry.documentType === "event-invitation")!;
    await agent
      .put(`/api/templates/${eventTemplate.id}`)
      .send({
        ...eventTemplate,
        bodyMarkdown: "Event introduction\n\n::generated-content",
        subject: "Configured :field{name=generated.subject}",
      })
      .expect(200);
    const preview = await container.cradle.contentTemplateService.generatedPreview(
      "event-invitation",
      "Meeting source text",
      "Invitation",
    );
    expect(preview.subject).toBe("Configured Invitation");
    for (const value of [preview.html, preview.text]) {
      expect(value).toContain("Meeting source text");
      expect(value.match(/Signature UNIQUE/g)).toHaveLength(1);
      expect(value.match(/Footer UNIQUE/g)).toHaveLength(1);
    }
    const notice = domainBody<ContentTemplate>(
      await agent
        .post("/api/templates")
        .send({
          kind: "message",
          documentType: "meeting-notice-message",
          name: "Notice",
          subject: "Notice",
          bodyMarkdown: "Notice source",
        })
        .expect(201),
    );
    const message = await container.cradle.contentTemplateService.generate(notice.id, {
      context: {},
      to: [],
      cc: [],
      bcc: [],
      attachmentResourceIds: [],
    });
    const eml = message.content.toString("utf8");
    expect(eml.match(/Signature UNIQUE/g)).toHaveLength(2);
    expect(eml.match(/Footer UNIQUE/g)).toHaveLength(2);
    expect(eml).toContain("text/plain");
    expect(eml).toContain("text/html");
    const event = domainBody<{ id: string }>(
      await agent
        .post("/api/resources")
        .send({
          kind: "event",
          path: "",
          name: "Test event",
          document: {
            content: "Original event",
            location: "Room",
            schedule: { kind: "timed", start: "2026-11-10T10:00:00Z", end: "2026-11-10T11:00:00Z" },
            participants: [],
          },
        })
        .expect(201),
    );
    for (const method of ["request", "cancel"] as const) {
      const invitation = await agent
        .post(`/api/resources/${event.id}/event-invitation`)
        .send({ method })
        .expect((response) => expect(response.status, JSON.stringify(response.body)).toBe(200));
      const source = invitation.text;
      expect(source.match(/Signature UNIQUE/g)).toHaveLength(2);
      expect(source.match(/Footer UNIQUE/g)).toHaveLength(2);
      expect(source).toContain(`METHOD:${method === "request" ? "REQUEST" : "CANCEL"}`);
      expect(source).toContain(`hall-event-${event.id}@hall.local`);
    }
  });

  it("migrates legacy settings and custom templates without loss, then does not recreate a deleted default", async () => {
    await createTestServer();
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    try {
      await pool.query("UPDATE templates SET name = 'Existing customization' WHERE document_type = 'document-print'");
      await pool.query(
        "ALTER TABLE hall_settings DROP COLUMN outbound_email_signature_markdown, DROP COLUMN outbound_email_footer_markdown",
      );
      await pool.query(postgresDocumentConfigurationMigration);
      expect((await pool.query("SELECT name FROM templates WHERE document_type = 'document-print'")).rows[0].name).toBe(
        "Existing customization",
      );
      expect(
        (
          await pool.query(
            "SELECT outbound_email_signature_markdown, outbound_email_footer_markdown FROM hall_settings",
          )
        ).rows[0],
      ).toEqual({ outbound_email_signature_markdown: "", outbound_email_footer_markdown: "" });
      await pool.query("DELETE FROM templates WHERE document_type = 'event-invitation'");
      await pool.query(postgresDocumentConfigurationMigration);
      expect((await pool.query("SELECT id FROM templates WHERE document_type = 'event-invitation'")).rows).toHaveLength(
        0,
      );
    } finally {
      await pool.end();
    }
  });
});
