import { PDFDocument } from "pdf-lib";
import type { Response } from "superagent";
import { describe, expect, it } from "vitest";
import { createTestServer, domainBody } from "./testServer.js";

function binaryParser(response: Response, callback: (error: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  response.on("end", () => callback(null, Buffer.concat(chunks)));
  response.on("error", callback);
}

async function createMemberAndMeeting(agent: Awaited<ReturnType<typeof createTestServer>>["agent"]) {
  const member = domainBody<{ id: string }>(
    await agent
      .post("/api/council-members")
      .send({
        firstName: "Martine",
        lastName: "Delcourt",
        email: "martine@example.test",
        role: "mayor",
        termStartedOn: "2026-03-22",
      })
      .expect(201),
  );
  const meeting = domainBody<{ id: string }>(
    await agent
      .post("/api/council-meetings")
      .send({
        title: "Conseil de septembre",
        startsAt: "2026-09-10T18:30:00+02:00",
        location: "Salle du conseil",
        chairMemberId: member.id,
        secretaryMemberId: member.id,
      })
      .expect(201),
  );
  return { member, meeting };
}

describe("content templates", () => {
  it("canonicalizes shared directives and resolves references in backend previews", async () => {
    const { agent } = await createTestServer();
    const { member, meeting } = await createMemberAndMeeting(agent);
    const created = await agent
      .post("/api/templates")
      .send({
        kind: "message",
        documentType: "meeting-notice-message",
        name: "Message de convocation",
        subject: ":field{name=meeting.title}",
        bodyMarkdown: `Bonjour :member[Ancien libellé]{#${member.id}}, rendez-vous le :field{name=meeting.startsAt}.`,
      })
      .expect(201);
    const template = domainBody<{ id: string; subject: string }>(created);
    expect(template.subject).toBe(':field{name="meeting.title"}');
    expect((created.body.actions ?? []).map((item: { name: string }) => item.name)).toContain("template.generate");

    const previewResponse = await agent
      .post("/api/templates/preview")
      .send({
        kind: "message",
        subject: ":field{name=meeting.title}",
        bodyMarkdown: `Bonjour :member[Ancien libellé]{#${member.id}}.`,
        context: { meetingId: meeting.id },
      })
      .expect(200);
    const preview = domainBody<{ html: string; subject: string; diagnostics: unknown[] }>(previewResponse);
    expect(preview.subject).toBe("Conseil de septembre");
    expect(preview.html).toContain("Martine Delcourt");
    expect(preview.html).not.toContain("Ancien libellé");
    expect(preview.diagnostics).toEqual([]);

    const references = await agent.get(`/api/templates/references?type=member&query=Martine`).expect(200);
    expect(references.body.entities[0].links).toContainEqual(
      expect.objectContaining({ rel: ["self"], href: `/api/council-members/${member.id}` }),
    );

    const invalidPreview = domainBody<{ diagnostics: Array<{ code: string }> }>(
      await agent
        .post("/api/templates/preview")
        .send({
          kind: "pdf",
          bodyMarkdown: "::snippet[Signature]{#signature}",
          context: {},
        })
        .expect(200),
    );
    expect(invalidPreview.diagnostics).toEqual([expect.objectContaining({ code: "unknown_directive" })]);

    await agent.delete(`/api/templates/${template.id}`).expect(204);
    const audit = domainBody<Array<{ action: string }>>(await agent.get("/api/audit-events").expect(200));
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "template.preview" }),
        expect.objectContaining({ action: "template.delete" }),
      ]),
    );
  });

  it("generates a Chromium PDF packet and an Outlook-compatible EML", async () => {
    const { agent } = await createTestServer();
    const { member, meeting } = await createMemberAndMeeting(agent);

    const attachmentPdf = await PDFDocument.create();
    attachmentPdf.addPage();
    const attachment = domainBody<{ id: string }>(
      await agent
        .post("/api/resources/documents")
        .field("title", "Annexe")
        .field("category", "supporting")
        .attach("file", Buffer.from(await attachmentPdf.save()), {
          filename: "annexe.pdf",
          contentType: "application/pdf",
        })
        .expect(201),
    );

    const pdfTemplate = domainBody<{ id: string }>(
      await agent
        .post("/api/templates")
        .send({
          kind: "pdf",
          documentType: "meeting-notice",
          name: "Convocation PDF",
          bodyMarkdown: "# :field{name=meeting.title}\n\nLieu : :field{name=meeting.location}",
          stylesheet: "h1 { color: #102a83; }",
          headerHtml: "<div>Hall</div>",
          footerHtml: "<div>Conseil municipal</div>",
        })
        .expect(201),
    );
    const pdfResponse = (await agent
      .post(`/api/templates/${pdfTemplate.id}/generate`)
      .send({ context: { meetingId: meeting.id }, attachmentResourceIds: [attachment.id] })
      .buffer(true)
      .parse(binaryParser)
      .expect(200)) as Response & { body: Buffer };
    expect(pdfResponse.headers["content-type"]).toContain("application/pdf");
    expect(pdfResponse.body.subarray(0, 4).toString()).toBe("%PDF");
    expect((await PDFDocument.load(pdfResponse.body)).getPageCount()).toBe(2);

    const messageTemplate = domainBody<{ id: string }>(
      await agent
        .post("/api/templates")
        .send({
          kind: "message",
          documentType: "meeting-notice-email",
          name: "Convocation Outlook",
          subject: ":field{name=meeting.title}",
          bodyMarkdown: `Bonjour :member[Martine]{#${member.id}}`,
        })
        .expect(201),
    );
    const emlResponse = (await agent
      .post(`/api/templates/${messageTemplate.id}/generate`)
      .send({
        context: { meetingId: meeting.id },
        attachmentResourceIds: [attachment.id, attachment.id],
        to: ["destinataire@example.test"],
      })
      .buffer(true)
      .parse(binaryParser)
      .expect(200)) as Response & { body: Buffer };
    const eml = emlResponse.body.toString("utf8");
    expect(emlResponse.headers["content-type"]).toContain("message/rfc822");
    expect(eml).toContain("Subject: Conseil de septembre");
    expect(eml).toContain("destinataire@example.test");
    expect(eml.match(/filename=annexe\.pdf/g)).toHaveLength(1);

    const audit = domainBody<Array<{ action: string }>>(await agent.get("/api/audit-events").expect(200));
    expect(audit).toEqual(expect.arrayContaining([expect.objectContaining({ action: "template.generate" })]));
  });

  it("caps the cumulative attachment payload", async () => {
    const { agent, container } = await createTestServer();
    const template = domainBody<{ id: string }>(
      await agent
        .post("/api/templates")
        .send({
          kind: "message",
          documentType: "bounded-message",
          name: "Message borné",
          subject: "Sujet",
          bodyMarkdown: "Corps",
        })
        .expect(201),
    );
    const chunk = Buffer.alloc(18 * 1024 * 1024);
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const resource = await container.cradle.resourceRepository.createDocument({
        title: `Annexe ${index}`,
        folderPath: "",
        tags: [],
        fileName: `annexe-${index}.pdf`,
        format: "pdf",
        mediaType: "application/pdf",
        contentSha256: "0".repeat(64),
        category: "supporting",
        content: chunk,
      });
      ids.push(resource.id);
    }

    const response = await agent
      .post(`/api/templates/${template.id}/generate`)
      .send({ attachmentResourceIds: ids })
      .expect(413);
    expect(response.body.code).toBe("template_attachments_too_large");
  });

  it("bounds the complete generation pipeline before loading attachments", async () => {
    const { agent, container } = await createTestServer();
    const template = domainBody<{ id: string }>(
      await agent
        .post("/api/templates")
        .send({
          kind: "message",
          documentType: "bounded-concurrency",
          name: "Concurrence bornée",
          subject: "Sujet",
          bodyMarkdown: "Corps",
        })
        .expect(201),
    );
    const resource = await container.cradle.resourceRepository.createDocument({
      title: "Annexe",
      folderPath: "",
      tags: [],
      fileName: "annexe.pdf",
      format: "pdf",
      mediaType: "application/pdf",
      contentSha256: "0".repeat(64),
      category: "supporting",
      content: Buffer.from("annexe"),
    });

    const repository = container.cradle.resourceRepository;
    const originalFind = repository.find.bind(repository);
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let attachmentLoads = 0;
    let twoLoadsReached!: () => void;
    const firstTwoLoads = new Promise<void>((resolve) => {
      twoLoadsReached = resolve;
    });
    repository.find = async (id) => {
      attachmentLoads += 1;
      if (attachmentLoads === 2) twoLoadsReached();
      await blocked;
      return originalFind(id);
    };
    const input = {
      context: {},
      attachmentResourceIds: [resource.id],
      to: [],
      cc: [],
      bcc: [],
    };
    const accepted = Array.from({ length: 6 }, () =>
      container.cradle.contentTemplateService.generate(template.id, input),
    );
    await firstTwoLoads;

    await expect(container.cradle.contentTemplateService.generate(template.id, input)).rejects.toMatchObject({
      code: "template_generation_busy",
      statusCode: 429,
    });
    expect(attachmentLoads).toBe(2);
    release();
    await Promise.all(accepted);
  });

  it("advertises preview but not mutation to a reader", async () => {
    const { rawAgent } = await createTestServer({ devAutoLogin: false });
    await rawAgent
      .post("/api/auth/bootstrap")
      .send({ email: "admin@example.fr", displayName: "Administration", password: "Mot-de-passe-demo-2026!" })
      .expect(201);
    await rawAgent
      .post("/api/users")
      .send({
        email: "lecture@example.fr",
        displayName: "Lecture seule",
        password: "Mot-de-passe-lecture-2026!",
        roles: ["reader"],
        councilMemberId: null,
      })
      .expect(201);
    await rawAgent.post("/api/auth/logout").expect(204);
    await rawAgent
      .post("/api/auth/login")
      .send({ email: "lecture@example.fr", password: "Mot-de-passe-lecture-2026!" })
      .expect(200);

    const templates = await rawAgent.get("/api/templates").expect(200);
    expect(templates.body.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "template.preview" })]),
    );
    expect(templates.body.actions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "template.create" })]),
    );
    await rawAgent
      .post("/api/templates/preview")
      .send({ kind: "message", subject: "Sujet", bodyMarkdown: "Corps" })
      .expect(200);
  });
});
