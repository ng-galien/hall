import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createDocumentRenderer, pdfAttachmentHref } from "../services/documentRenderer.js";

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

    const packet = await renderer.appendPdfs(body, [
      { id: "annex-1", content: Buffer.from(await attachment.save()) },
    ]);
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
