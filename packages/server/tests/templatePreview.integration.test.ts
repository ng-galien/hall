import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { ContentTemplate } from "@hall/domain";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { expect, it } from "vitest";
import { createPostgresHttpTestServer, domainBody } from "../src/__tests__/testServer.js";

const execute = promisify(execFile);

async function pdfText(bytes: Uint8Array): Promise<string> {
  const loading = getDocument({ data: bytes, useSystemFonts: true });
  try {
    const pdf = await loading.promise;
    expect(pdf.numPages).toBeGreaterThan(0);
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

type Preview = {
  html: string;
  sourceLabel: string | null;
  diagnostics: Array<{ severity: string }>;
};

// @verifies-requirement HALL-FR-CFG-020
// @verifies-requirement HALL-FR-DOC-480
it("previews the nine configured families from real Alésia records as HTML and native PDFs without changing their sources", async () => {
  const { agent, url } = await createPostgresHttpTestServer();
  await execute(
    process.execPath,
    [
      fileURLToPath(new URL("../../../scripts/seed/seed-dev.mjs", import.meta.url)),
      "--dataset",
      "alesia",
      "--scenario",
      "default",
    ],
    { env: { ...process.env, SEED_API: `${url}/api` }, timeout: 120_000 },
  );
  const templates = domainBody<ContentTemplate[]>(await agent.get("/api/templates").expect(200));
  expect(templates).toHaveLength(9);
  const headings: Record<string, string> = {
    "meeting-notice": "Convocation au conseil municipal",
    "meeting-notice-message": "Convocation au conseil municipal",
    minutes: "Procès-verbal du conseil",
    "council-decision": "Extrait du registre des délibérations",
    "deliberation-list": "Liste des délibérations examinées",
    "meeting-dossier-cover": "Dossier de séance",
    "meeting-dossier-point": "Point ",
    "document-print": "Situation de l’oppidum",
  };
  let noticeMeetingNumber = "";
  for (const template of templates) {
    const input = { ...template, context: {} };
    const preview = domainBody<Preview>(await agent.post("/api/templates/preview").send(input).expect(200));
    expect(preview.sourceLabel, template.documentType).toBeTruthy();
    expect(preview.diagnostics, template.documentType).toEqual([]);
    if (template.documentType === "meeting-notice") noticeMeetingNumber = preview.sourceLabel!;
    expect(preview.html, template.documentType).not.toContain("Commune non renseignée");
    expect(preview.html, template.documentType).not.toContain("Contenu d’exemple");
    if (template.documentType === "event-invitation") expect(preview.html).toContain(preview.sourceLabel!);
    else expect(preview.html, template.documentType).toContain(headings[template.documentType]!);
    if (template.kind !== "pdf") continue;
    const created = domainBody<{ url: string }>(
      await agent.post("/api/templates/preview-pdf?delivery=url").send(input).expect(201),
    );
    const response = await fetch(`${url}${created.url}`);
    expect(response.status, template.documentType).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(response.headers.get("content-disposition")).toBe("inline; filename=preview.pdf");
    const text = await pdfText(new Uint8Array(await response.arrayBuffer()));
    expect(text, template.documentType).toContain("Alésia");
    expect(text, template.documentType).toContain(headings[template.documentType]!);
  }

  const print = templates.find((template) => template.documentType === "document-print")!;
  const configured = {
    ...print,
    headerHtml: "Présentation vérifiée — {{ hall.name | text }}",
    footerHtml: "Page :page-number / :page-count",
    stylesheet: "h1 { color: #123456; }",
    context: {},
  };
  const created = domainBody<{ url: string }>(
    await agent.post("/api/templates/preview-pdf?delivery=url").send(configured).expect(201),
  );
  const response = await fetch(`${url}${created.url}`);
  expect(response.status).toBe(200);
  const text = await pdfText(new Uint8Array(await response.arrayBuffer()));
  expect(text).toContain("Présentation vérifiée — Alésia");
  expect(text).toContain("Situation de l’oppidum");
  expect(text).toContain("Page 1 / 1");

  const minutes = templates.find((template) => template.documentType === "minutes")!;
  const absent = { ...minutes, context: { minutesId: randomUUID() } };
  const missing = domainBody<Preview>(await agent.post("/api/templates/preview").send(absent).expect(200));
  expect(missing.sourceLabel).toBeNull();
  expect(missing.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ severity: "error" })]));
  await agent.post("/api/templates/preview-pdf?delivery=url").send(absent).expect(422);
  await agent
    .post("/api/templates/preview-pdf?delivery=url")
    .send({ ...configured, bodyMarkdown: "{% for broken %}" })
    .expect(422);
  expect(domainBody<ContentTemplate[]>(await agent.get("/api/templates").expect(200))).toEqual(templates);

  const legal = domainBody<{ id: string; name: string }>(
    await agent
      .post("/api/resources")
      .send({ kind: "legalReference", name: "Référence à vérifier", path: "" })
      .expect(201),
  );
  const reference = domainBody<Preview>(
    await agent
      .post("/api/templates/preview")
      .send({ ...configured, bodyMarkdown: `Voir :resource[Ancien titre]{#${legal.id}}.` })
      .expect(200),
  );
  expect(reference.diagnostics).toEqual([]);
  expect(reference.html).toContain(legal.name);
  expect(reference.html).not.toContain("Ancien titre");

  const attachment = await PDFDocument.create();
  attachment.addPage().drawText("Unique appendix evidence");
  const resource = domainBody<{ id: string }>(
    await agent
      .post("/api/resources/documents")
      .field("path", "")
      .field("name", "Annexe à consulter.pdf")
      .attach("file", Buffer.from(await attachment.save()), { filename: "annexe.pdf", contentType: "application/pdf" })
      .expect(201),
  );
  const source = `# Document avec annexe\n\nVoir :resource[Ancien nom]{#${resource.id}} et encore :resource[Ancien nom]{#${resource.id}}.`;
  await agent
    .put(`/api/templates/${print.id}`)
    .send({ ...print, bodyMarkdown: source })
    .expect(200);
  const generated = await fetch(`${url}/api/templates/${print.id}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context: {}, attachmentResourceIds: [resource.id] }),
  });
  expect(generated.status).toBe(200);
  const generatedBytes = new Uint8Array(await generated.arrayBuffer());
  expect((await PDFDocument.load(generatedBytes)).getPageCount()).toBe(2);
  const generatedText = await pdfText(generatedBytes);
  expect(generatedText).toContain("Document avec annexe");
  expect(generatedText.match(/Unique appendix evidence/g)).toHaveLength(1);
  expect(generatedText).not.toContain("Ancien nom");
  expect(domainBody<ContentTemplate>(await agent.get(`/api/templates/${print.id}`).expect(200)).bodyMarkdown).toBe(
    source,
  );

  const meetings = domainBody<Array<{ id: string; number: number }>>(
    await agent.get("/api/council-meetings").expect(200),
  );
  const meeting = meetings.find((entry) => String(entry.number) === noticeMeetingNumber)!;
  expect(meeting).toBeDefined();
  const notices = domainBody<Array<{ councilMeetingId: string }>>(
    await agent.get(`/api/council-meetings/${meeting.id}/notices`).expect(200),
  );
  expect(notices.length).toBeGreaterThan(0);
  expect(notices.every((notice) => notice.councilMeetingId === meeting.id)).toBe(true);
  const freeze = domainBody<{ agenda: unknown[] }>(
    await agent.get(`/api/council-meetings/${meeting.id}/agenda-freeze`).expect(200),
  );
  expect(freeze.agenda.length).toBeGreaterThan(0);
  const agenda = domainBody<Array<{ councilBusinessId: string | null }>>(
    await agent.get(`/api/council-meetings/${meeting.id}/agenda-items`).expect(200),
  );
  const businessId = agenda.find((item) => item.councilBusinessId)!.councilBusinessId;
  const business = domainBody<{ reportResourceId: string }>(
    await agent.get(`/api/council-business/${businessId}`).expect(200),
  );
  const report = domainBody<{ version: number }>(
    await agent.get(`/api/resources/${business.reportResourceId}`).expect(200),
  );
  const reportSource = "Rapport conservé :horscontrat[Texte rédigé littéral].";
  await agent
    .put(`/api/resources/${business.reportResourceId}/content`)
    .send({ kind: "text", expectedVersion: report.version, content: reportSource })
    .expect(200);
  const dossier = await fetch(`${url}/api/council-meetings/${meeting.id}/dossier`);
  expect(dossier.status).toBe(200);
  expect(await pdfText(new Uint8Array(await dossier.arrayBuffer()))).toContain(reportSource);
  expect(
    domainBody<{ content: string }>(await agent.get(`/api/resources/${business.reportResourceId}`).expect(200)).content,
  ).toBe(reportSource);
});
