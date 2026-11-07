import { referenceEntityKinds } from "@hall/domain";
import { PostgresCouncil, PostgresDirectory } from "@hall/postgres";
import { PDFDocument } from "pdf-lib";
import type { Response } from "superagent";
import { describe, expect, it } from "vitest";
import type { DocumentRenderer, PdfRenderInput } from "../services/documentRenderer.js";
import { createPostgresHttpTestServer, createServiceTestServer, createTestServer, domainBody } from "./testServer.js";

function binaryParser(response: Response, callback: (error: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  response.on("end", () => callback(null, Buffer.concat(chunks)));
  response.on("error", callback);
}

async function createMemberAndMeeting(server: { agent: Awaited<ReturnType<typeof createTestServer>>["agent"] }) {
  const { agent } = server;
  const contact = domainBody<{ id: string }>(
    await agent
      .post("/api/contacts")
      .send({ firstName: "Martine", lastName: "Delcourt", email: "martine@example.test" })
      .expect(201),
  );
  const member = domainBody<{ id: string }>(
    await agent
      .post("/api/council-members")
      .send({
        contactId: contact.id,
        role: "mayor",
        termStartedOn: "2026-03-22",
      })
      .expect(201),
  );
  const provisioned = domainBody<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));
  const meeting = domainBody<{ id: string; number: number; scheduledAt: string }>(
    await agent
      .put(`/api/council-meetings/${provisioned.id}/prepare`)
      .send({
        scheduledAt: "2026-09-10T18:30:00+02:00",
        location: "Salle du conseil",
        chairMemberId: member.id,
        secretaryMemberId: member.id,
      })
      .expect(200),
  );
  return { contact, member, meeting };
}

describe("content templates", () => {
  it("canonicalizes shared directives and resolves references in backend previews", async () => {
    const server = await createTestServer();
    const { agent } = server;
    const { member, meeting } = await createMemberAndMeeting(server);
    const created = await agent
      .post("/api/templates")
      .send({
        kind: "message",
        documentType: "meeting-notice-message",
        name: "Message de convocation",
        subject: "{{ meeting.scheduledAt | datetime }}",
        bodyMarkdown: `Bonjour :member[Ancien libellé]{#${member.id}}, rendez-vous le {{ meeting.scheduledAt | datetime }}.`,
      })
      .expect(201);
    const template = domainBody<{ id: string; subject: string }>(created);
    expect(template.subject).toBe("{{ meeting.scheduledAt | datetime }}");
    expect((created.body.actions ?? []).map((item: { name: string }) => item.name)).toContain("template.generate");

    const previewResponse = await agent
      .post("/api/templates/preview")
      .send({
        kind: "message",
        subject: "{{ meeting.scheduledAt | datetime }}",
        bodyMarkdown: `Bonjour :member[Ancien libellé]{#${member.id}}.`,
        context: { meetingId: meeting.id },
      })
      .expect(200);
    const preview = domainBody<{ html: string; subject: string; diagnostics: unknown[] }>(previewResponse);
    expect(preview.subject).toContain("10 septembre 2026");
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

    await agent
      .put(`/api/templates/${template.id}`)
      .send({
        kind: "message",
        documentType: "meeting-notice-message",
        name: "Message de convocation actualisé",
        subject: "{{ meeting.scheduledAt | datetime }}",
        bodyMarkdown: `Bonjour :member[Ancien libellé]{#${member.id}}.`,
      })
      .expect(200);

    await agent.delete(`/api/templates/${template.id}`).expect(204);
    const audit = domainBody<Array<{ action: string; targetType: string; targetId: string | null }>>(
      await agent.get("/api/audit-events").expect(200),
    );
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "template.create", targetType: "template", targetId: template.id }),
        expect.objectContaining({ action: "template.update", targetType: "template", targetId: template.id }),
        expect.objectContaining({ action: "template.preview" }),
        expect.objectContaining({ action: "template.delete" }),
      ]),
    );
  });

  it("resolves every closed reference kind from current server data", async () => {
    const server = await createPostgresHttpTestServer();
    const { agent } = server;
    const databaseRequest = {
      role: "hall_api_authenticated" as const,
      context: { requestId: "reference-fixture", actorId: "test-clerk", roles: ["administrator"], contactId: null },
    };
    await new PostgresDirectory(server.pool).configureActiveCouncilTerm(databaseRequest, 1);
    const { contact, member, meeting } = await createMemberAndMeeting(server);
    const business = domainBody<{ id: string }>(
      await agent
        .post("/api/council-business")
        .send({
          path: "seed",
          name: "Sujet actuel",
          reportName: "Rapport principal",
          reportContent: "Rapport",
        })
        .expect(201),
    );
    const proposal = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-business/${business.id}/prepared-subjects`)
        .send({ kind: "councilDecisionProposal", name: "Décision actuelle", content: "Projet" })
        .expect(201),
    );
    const scheduled = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
        .send({ kind: "councilDecisionProposal", subjectId: proposal.id, position: 1 })
        .expect(201),
    );
    const council = new PostgresCouncil(server.pool);
    await council.freezeAgenda(databaseRequest, meeting.id);
    const noticeFacts = await council.noticeFacts(databaseRequest, meeting.id);
    if (!noticeFacts) throw new Error("Frozen meeting notice facts are required");
    await council.generateNotice(
      databaseRequest,
      meeting.id,
      { meeting: noticeFacts, issuedOn: null, hall: { name: "Test commune", timeZone: "Europe/Paris" } },
      Buffer.from("%PDF-fixture"),
    );
    await agent
      .post(`/api/council-meetings/${meeting.id}/record-opening`)
      .send({
        chairMemberId: member.id,
        secretaryMemberId: member.id,
        attendance: [{ councilMemberId: member.id, status: "present" }],
      })
      .expect(200);
    await agent.post(`/api/council-meetings/${meeting.id}/agenda-items/${scheduled.id}/start`).send({}).expect(200);
    const attendance = await council.listAttendance(databaseRequest, meeting.id);
    const candidate = {
      procedure: "ordinaryMajority",
      mode: "public",
      participantAttendanceIds: [attendance[0].id],
      votes: [{ meetingAttendanceId: attendance[0].id, choice: "approve" }],
      nonParticipations: [],
    };
    const ballotPreview = domainBody<{ id: string }>(
      await agent.post("/api/ballot-previews").send({ agendaItemId: scheduled.id, candidate }).expect(201),
    );
    await agent.post(`/api/ballot-previews/${ballotPreview.id}/confirm`).send({}).expect(200);
    const decisions = domainBody<Array<{ id: string; title: string; number: string | null }>>(
      await agent.get("/api/council-decisions").expect(200),
    );
    expect(decisions).toHaveLength(1);
    const decision = decisions[0];
    expect(decision.title).toBe("Décision actuelle");
    const resource = domainBody<{ id: string }>(
      await agent
        .post("/api/resources")
        .send({ kind: "text", name: "Ressource actuelle", path: "seed", content: "Contenu" })
        .expect(201),
    );

    const bodyMarkdown = [
      `:member[ancien membre]{#${member.id}}`,
      `:contact[ancien contact]{#${contact.id}}`,
      `:resource[ancienne ressource]{#${resource.id}}`,
      `:councilBusiness[ancien sujet]{#${business.id}}`,
      `:meeting[ancienne séance]{#${meeting.id}}`,
      `:decision[ancienne décision]{#${decision!.id}}`,
    ].join(" · ");
    const preview = domainBody<{ html: string; diagnostics: unknown[] }>(
      await agent.post("/api/templates/preview").send({ kind: "pdf", bodyMarkdown, context: {} }).expect(200),
    );

    expect(preview.html).toContain("Martine Delcourt");
    expect(preview.html).toContain("Ressource actuelle");
    expect(preview.html).toContain("Sujet actuel");
    expect(preview.html).toContain("2026-09-10");
    expect(preview.html).toContain("Décision actuelle");
    expect(preview.html).not.toMatch(/ancien(?:ne)?/);
    expect(preview.diagnostics).toEqual([]);

    const expectedReferences = {
      member: { id: member.id, label: "Martine Delcourt" },
      contact: { id: contact.id, label: "Martine Delcourt" },
      resource: { id: resource.id, label: "Ressource actuelle" },
      councilBusiness: { id: business.id, label: "Sujet actuel" },
      meeting: { id: meeting.id, label: `${meeting.number} - ${meeting.scheduledAt.slice(0, 10)}` },
      decision: { id: decision!.id, label: `${decision!.number} - Décision actuelle` },
    } satisfies Record<(typeof referenceEntityKinds)[number], { id: string; label: string }>;
    for (const kind of referenceEntityKinds) {
      const candidates = domainBody<Array<{ type: string; id: string; label: string }>>(
        await agent.get(`/api/templates/references?type=${kind}`).expect(200),
      );
      expect(candidates).toContainEqual({ type: kind, ...expectedReferences[kind] });
    }
  });

  it("generates a Chromium PDF packet and an Outlook-compatible EML", async () => {
    const server = await createTestServer();
    const { agent } = server;
    const { member, meeting } = await createMemberAndMeeting(server);

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
          bodyMarkdown: "# Convocation\n\nLieu : {{ meeting.location | text }}",
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
          subject: "Convocation au conseil municipal",
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
    expect(eml).toContain("Subject: Convocation au conseil municipal");
    expect(eml).toContain("destinataire@example.test");
    expect(eml.match(/filename=annexe\.pdf/g)).toHaveLength(1);

    const audit = domainBody<Array<{ action: string }>>(await agent.get("/api/audit-events").expect(200));
    expect(audit).toEqual(expect.arrayContaining([expect.objectContaining({ action: "template.generate" })]));
  });

  // @verifies-requirement HALL-FR-DOC-580
  it("prints the next generated PDF with the text, header image and body image saved in the template", async () => {
    const rendered: PdfRenderInput[] = [];
    const renderer: DocumentRenderer = {
      async pdf(input) {
        rendered.push(input);
        const document = await PDFDocument.create();
        document.addPage();
        return Buffer.from(await document.save());
      },
      async appendPdfs(primary) {
        return primary;
      },
    };
    const server = await createTestServer({ documentRenderer: renderer });
    const { agent } = server;
    const { meeting } = await createMemberAndMeeting(server);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEElEQVR42mNk+M+ABzDhkAIAEwQCAiV7nNwAAAAASUVORK5CYII=",
      "base64",
    );
    const logo = domainBody<{ id: string }>(
      await agent
        .post("/api/resources/documents")
        .field("path", "")
        .field("name", "blason.png")
        .attach("file", png, { filename: "blason.png", contentType: "image/png" })
        .expect(201),
    );
    const template = domainBody<{ id: string }>(
      await agent
        .post("/api/templates")
        .send({
          kind: "pdf",
          documentType: "meeting-notice",
          name: "Convocation",
          bodyMarkdown: "# Convocation\n\nLieu : {{ meeting.location | text }}",
          headerHtml: "<div>Ancien en-tête</div>",
          footerHtml: "<div>Conseil municipal</div>",
        })
        .expect(201),
    );
    const generate = () =>
      agent
        .post(`/api/templates/${template.id}/generate`)
        .send({ context: { meetingId: meeting.id } })
        .buffer(true)
        .parse(binaryParser)
        .expect(200);
    await generate();
    expect(rendered.at(-1)?.headerHtml).toContain("Ancien en-tête");

    const headerImage = `<img src="data:image/png;base64,${png.toString("base64")}" alt="blason" style="width:35mm">`;
    const updated = {
      kind: "pdf",
      documentType: "meeting-notice",
      name: "Convocation de la mairie",
      bodyMarkdown: `# Convocation du conseil\n\n::image[Blason]{#${logo.id} align="center" width="40"}\n\nLieu : {{ meeting.location | text }}`,
      stylesheet: "",
      headerHtml: `${headerImage}<div>Mairie d’Alésia</div>`,
      footerHtml: "<div>Hôtel de ville</div>",
    };
    await agent.put(`/api/templates/${template.id}`).send(updated).expect(200);
    const reread = domainBody<Record<string, string>>(await agent.get(`/api/templates/${template.id}`).expect(200));
    expect(reread).toMatchObject({
      name: updated.name,
      headerHtml: updated.headerHtml,
      footerHtml: updated.footerHtml,
    });
    expect(reread.bodyMarkdown).toContain(`#${logo.id}`);

    await generate();
    const printed = rendered.at(-1)!;
    expect(printed.headerHtml).toContain("Mairie d’Alésia");
    expect(printed.headerHtml).toContain(`src="data:image/png;base64,${png.toString("base64")}"`);
    expect(printed.headerHtml).not.toContain("Ancien en-tête");
    expect(printed.footerHtml).toContain("Hôtel de ville");
    expect(printed.html).toContain("Convocation du conseil");
    expect(printed.html).toContain(`src="data:image/png;base64,${png.toString("base64")}"`);
    expect(printed.html).toContain("Salle du conseil");
  });

  it("renders an ad hoc PDF preview without persisting or auditing a template", async () => {
    const { agent } = await createTestServer();
    const templatesBefore = domainBody<unknown[]>(await agent.get("/api/templates").expect(200));
    const response = (await agent
      .post("/api/templates/preview-pdf")
      .send({ bodyMarkdown: "# Aperçu\n\nContenu courant de l’éditeur." })
      .buffer(true)
      .parse(binaryParser)
      .expect(200)) as Response & { body: Buffer };
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toBe("inline; filename=preview.pdf");
    expect(response.body.subarray(0, 4).toString()).toBe("%PDF");
    const createdPreview = await agent
      .post("/api/templates/preview-pdf?delivery=url")
      .send({ bodyMarkdown: "# Aperçu navigable\n\nContenu réellement affiché." })
      .expect(201);
    const previewUrl = domainBody<{ url: string }>(createdPreview).url;
    const navigatedPreview = (await agent.get(previewUrl).buffer(true).parse(binaryParser).expect(200)) as Response & {
      body: Buffer;
    };
    expect(navigatedPreview.headers["content-type"]).toContain("application/pdf");
    expect(navigatedPreview.headers["content-disposition"]).toBe("inline; filename=preview.pdf");
    expect(navigatedPreview.body.subarray(0, 4).toString()).toBe("%PDF");
    expect(domainBody<unknown[]>(await agent.get("/api/templates").expect(200))).toEqual(templatesBefore);
    expect(domainBody<Array<{ action: string }>>(await agent.get("/api/audit-events").expect(200))).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "template.preview-pdf" })]),
    );

    const invalid = await agent
      .post("/api/templates/preview-pdf")
      .send({ bodyMarkdown: "::snippet[Hors contrat]{#signature}" })
      .expect(422);
    expect(domainBody<{ code: string }>(invalid)).toMatchObject({ code: "template_invalid" });
  });

  it("caps the cumulative attachment payload", async () => {
    const { agent, container } = await createServiceTestServer();
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
      const resource = await container.cradle.resourcesClient.createDocument({
        name: `Annexe ${index}`,
        path: "",
        mediaType: "application/pdf",
        content: chunk,
      });
      ids.push(resource.data.id);
    }

    const response = await agent
      .post(`/api/templates/${template.id}/generate`)
      .send({ attachmentResourceIds: ids })
      .expect(413);
    expect(response.body.code).toBe("template_attachments_too_large");
  });

  it("bounds the complete generation pipeline before loading attachments", async () => {
    const { agent, container } = await createServiceTestServer();
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
    const resource = await container.cradle.resourcesClient.createDocument({
      name: "Annexe",
      path: "",
      mediaType: "application/pdf",
      content: Buffer.from("annexe"),
    });

    const resourcesClient = container.cradle.resourcesClient;
    const originalOpen = resourcesClient.open.bind(resourcesClient);
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let attachmentLoads = 0;
    let twoLoadsReached!: () => void;
    const firstTwoLoads = new Promise<void>((resolve) => {
      twoLoadsReached = resolve;
    });
    resourcesClient.open = async (id: string) => {
      attachmentLoads += 1;
      if (attachmentLoads === 2) twoLoadsReached();
      await blocked;
      return originalOpen(id);
    };
    const input = {
      context: {},
      attachmentResourceIds: [resource.data.id],
      to: [],
      cc: [],
      bcc: [],
    };
    const service = container.cradle.contentTemplateService;
    const stored = await service.find(template.id);
    const accepted = Array.from({ length: 6 }, () => service.generateFromTemplate(stored, input));
    await firstTwoLoads;

    await expect(service.generateFromTemplate(stored, input)).rejects.toMatchObject({
      code: "template_generation_busy",
      statusCode: 429,
    });
    expect(attachmentLoads).toBe(2);
    release();
    await Promise.all(accepted);
  });

  it("advertises preview but not mutation to a contributor", async () => {
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
        roles: ["contributor"],
        contactId: null,
      })
      .expect(201);
    await rawAgent.post("/api/auth/logout").expect(204);
    await rawAgent
      .post("/api/auth/login")
      .send({ email: "lecture@example.fr", password: "Mot-de-passe-lecture-2026!" })
      .expect(200);

    const templates = await rawAgent.get("/api/templates").expect(200);
    expect(templates.body.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "template.preview" }),
        expect.objectContaining({ name: "template.preview-pdf" }),
      ]),
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
