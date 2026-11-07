import type { ContentTemplate, HallSettings } from "@hall/domain";
import { generatedDocumentTemplates, jinjaBody } from "@hall/domain";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
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
        bodyMarkdown: `# Custom wrapper\n\n${jinjaBody(type)}\n\nEnd wrapper`,
        stylesheet: "h1 { color: #123456; }",
        headerHtml: "<div>Header UNIQUE</div>",
        footerHtml: "<div>Page UNIQUE</div>",
      };
      await agent.put(`/api/templates/${original.id}`).send(input).expect(200);
      await container.cradle.contentTemplateService.generatedPdf(
        type,
        "# Original fact\n\nContent remains here.",
        {},
        false,
        {
          dossier: {
            meeting: {
              number: 1,
              scheduledAt: "2026-11-10T10:00:00Z",
              location: "Room",
              agenda: [{ agendaNumber: 1, kind: "openQuestion", title: "Original fact" }],
            },
            point: {
              number: 1,
              kind: "openQuestion",
              title: "Original fact",
              report: "",
              subjectText: "Content remains here.",
              pieces: [],
            },
          },
        },
      );
      const output = printed.at(-1)!;
      expect(output.html).toContain("Original fact");
      expect(output.html).toContain("Custom wrapper");
      expect(output.html).toContain("#123456");
      expect(output.headerHtml).toContain("Header UNIQUE");
      expect(output.footerHtml).toContain("Page UNIQUE");
      await agent
        .put(`/api/templates/${original.id}`)
        .send({ ...input, bodyMarkdown: "{% for broken %}" })
        .expect(422);
      await agent
        .put(`/api/templates/${original.id}`)
        .send({ ...input, kind: "message", subject: "Wrong family", stylesheet: "", headerHtml: "", footerHtml: "" })
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
        bodyMarkdown: `Event introduction\n\n${jinjaBody("event-invitation")}`,
        subject: "Configured {{ generated.subject | text }}",
      })
      .expect(200);
    const preview = await container.cradle.contentTemplateService.generatedPreview(
      "event-invitation",
      "Meeting source text",
      "Invitation",
      {},
      false,
      {
        event: {
          name: "Meeting",
          content: "Meeting source text",
          method: "request",
          schedule: { kind: "timed", start: "2026-11-10T10:00:00Z", end: "2026-11-10T11:00:00Z" },
          location: "Room",
          participants: [],
        },
      },
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

  it("keeps a deleted default template deleted when the server starts again", async () => {
    const { container } = await createTestServer();
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    try {
      await pool.query("DELETE FROM hall.document_template WHERE document_type = 'event-invitation'");
      await container.cradle.postgresClient.bootstrap.install();
      expect(
        (await pool.query("SELECT id FROM hall.document_template WHERE document_type = 'event-invitation'")).rows,
      ).toHaveLength(0);
    } finally {
      await pool.end();
    }
  });
});
