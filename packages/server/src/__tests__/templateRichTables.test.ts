import { PDFDocument } from "pdf-lib";
import type { Response } from "superagent";
import { describe, expect, it } from "vitest";
import { createServiceTestServer, domainBody } from "./testServer.js";

function binaryParser(response: Response, callback: (error: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  response.on("end", () => callback(null, Buffer.concat(chunks)));
  response.on("error", callback);
}

const richTable = [
  '<table style="width: 400px">',
  '<colgroup><col style="width: 160px"><col style="width: 240px"></colgroup>',
  '<tbody><tr><th colspan="2" rowspan="1" colwidth="160,240" style="text-align: center">Budget</th></tr>',
  '<tr><td colspan="1" rowspan="1" colwidth="160" style="text-align: left">Voirie</td>',
  '<td colspan="1" rowspan="1" colwidth="240" style="text-align: right">12 000 €</td></tr></tbody>',
  "</table>",
].join("");

describe("rich table template rendering", () => {
  it("preserves the sanitized Tiptap table contract in backend previews", async () => {
    const { container } = await createServiceTestServer();
    const preview = await container.cradle.templateRenderingService.preview({
      bodyMarkdown: richTable,
      subject: null,
      stylesheet: "",
      headerHtml: "",
      footerHtml: "",
    });

    expect(preview.printHtml).toContain("<colgroup>");
    expect(preview.printHtml).toContain('colspan="2"');
    expect(preview.printHtml).toContain('colwidth="160,240"');
    expect(preview.printHtml).toContain("width: 160px");
    expect(preview.printHtml).toContain("text-align: right");
    expect(preview.printHtml).toContain("12 000 €");
    expect(preview.diagnostics).toEqual([]);
  });

  it("prints a rich Tiptap table through the real Chromium PDF pipeline", async () => {
    const { agent } = await createServiceTestServer();
    const template = domainBody<{ id: string }>(
      await agent
        .post("/api/templates")
        .send({
          kind: "pdf",
          documentType: "rich-table-proof",
          name: "Tableau riche",
          bodyMarkdown: richTable,
        })
        .expect(201),
    );

    const response = (await agent
      .post(`/api/templates/${template.id}/generate`)
      .send({})
      .buffer(true)
      .parse(binaryParser)
      .expect(200)) as Response & { body: Buffer };

    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.body.subarray(0, 4).toString()).toBe("%PDF");
    const pdf = await PDFDocument.load(response.body);
    expect(pdf.getPageCount()).toBe(1);
    expect(response.body.byteLength).toBeGreaterThan(1_000);
  });
});
