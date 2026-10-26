// @verifies-requirement HALL-FR-DOC-560
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from "pdf-lib";
import { afterEach, describe, expect, it } from "vitest";
import { createDocumentRenderer, pdfAttachmentHref, printDocumentation } from "../services/documentRenderer.js";

describe("document renderer PDF annexes", () => {
  it("appends referenced PDFs and rewrites their inline links to the first annex page", async () => {
    const renderer = createDocumentRenderer();
    const attachment = await PDFDocument.create();
    attachment.addPage([300, 400]);
    attachment.addPage([300, 400]);
    const body = await renderer.pdf({
      html: `<a href="${pdfAttachmentHref("annex-1")}">Annexe</a><a href="https://example.fr" target="_blank">Web</a>`,
      headerHtml: "",
      footerHtml: "",
    });

    const packet = await renderer.appendPdfs(body, [{ id: "annex-1", content: Buffer.from(await attachment.save()) }]);
    const pdf = await PDFDocument.load(packet);

    expect(pdf.getPageCount()).toBe(3);
    const annotations = pdf.getPage(0).node.Annots();
    expect(annotations?.size()).toBe(2);
    const annotation = pdf.context.lookup(annotations!.get(0), PDFDict);
    expect(annotation.has(PDFName.of("A"))).toBe(false);
    const destination = annotation.lookup(PDFName.of("Dest"), PDFArray);
    expect(destination.get(0).toString()).toBe(pdf.getPage(1).ref.toString());
    expect(destination.get(1)).toBe(PDFName.of("Fit"));
    const external = pdf.context.lookup(annotations!.get(1), PDFDict);
    const externalAction = external.lookup(PDFName.of("A"), PDFDict);
    expect(externalAction.lookup(PDFName.of("NewWindow"), PDFBool)).toBe(PDFBool.True);
  });
});

const scriptAddingPages =
  "<script>for (let i = 0; i < 3; i++) { const d = document.createElement('div'); d.style.breakBefore = 'page'; " +
  "d.textContent = 'ajout'; document.body.appendChild(d); } document.documentElement.dataset.docsPrintReady = 'true';</script>";

interface RecordingServer {
  origin: string;
  requests: string[];
  server: Server;
}

const servers: Server[] = [];

async function recordingServer(body: string): Promise<RecordingServer> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? "");
    if (request.url?.endsWith(".png")) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(body);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests, server };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe("document renderer isolation", () => {
  it("keeps JavaScript disabled and external resources blocked for minutes and notices", async () => {
    const external = await recordingServer("");
    const renderer = createDocumentRenderer();
    const bytes = await renderer.pdf({
      html: `<p>Procès-verbal</p><img src="${external.origin}/pixel.png">${scriptAddingPages}`,
      headerHtml: "",
      footerHtml: "",
    });

    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    expect(external.requests).toEqual([]);
  });

  it("prints the documentation view with its script, its own origin only, and one bookmark per heading", async () => {
    const external = await recordingServer("");
    const view = await recordingServer(
      `<!doctype html><html><body><h1>Sommaire</h1><h1>Accueil</h1><h1>Concepts</h1>` +
        `<img src="${external.origin}/pixel.png">${scriptAddingPages}</body></html>`,
    );
    const bytes = await printDocumentation({ url: `${view.origin}/app/docs-print`, footerHtml: "<span></span>" });

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(4);
    expect(view.requests).toContain("/app/docs-print");
    expect(external.requests).toEqual([]);
    const outlines = pdf.catalog.lookup(PDFName.of("Outlines"), PDFDict);
    const titles: string[] = [];
    let entry = outlines.lookupMaybe(PDFName.of("First"), PDFDict);
    while (entry) {
      titles.push(entry.lookup(PDFName.of("Title"), PDFString, PDFHexString).decodeText());
      entry = entry.lookupMaybe(PDFName.of("Next"), PDFDict);
    }
    expect(titles).toEqual(["Sommaire", "Accueil", "Concepts"]);
  });
});
