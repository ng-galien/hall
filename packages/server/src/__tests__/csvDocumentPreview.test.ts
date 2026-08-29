import { describe, expect, it } from "vitest";
import { csvAsHtmlDocument, parseCsv } from "../infrastructure/documents/csvDocumentPreview.js";

describe("CSV document previews", () => {
  it("detects common separators and parses quoted cells", () => {
    expect(parseCsv(Buffer.from('association;montant;objet\r\n"Club; sportif";4800;"Jeunes, loisirs"\r\n'))).toEqual([
      ["association", "montant", "objet"],
      ["Club; sportif", "4800", "Jeunes, loisirs"],
    ]);
    expect(parseCsv(Buffer.from('name,comment\nAlice,"Line one\nLine two and ""quoted"""\n'))).toEqual([
      ["name", "comment"],
      ["Alice", 'Line one\nLine two and "quoted"'],
    ]);
    expect(parseCsv(Buffer.from("nom\tvoix\nAlice\t12\n"))).toEqual([
      ["nom", "voix"],
      ["Alice", "12"],
    ]);
  });

  it("renders a strictly escaped table with a distinct header", () => {
    const preview = csvAsHtmlDocument({
      fileName: 'votes & "résultats".csv',
      mediaType: "text/csv; charset=utf-8",
      content: Buffer.from('nom;observation\n"<script>alert(1)</script>";"L\'élu & ses collègues"\n'),
    });
    const html = preview.content.toString("utf8");

    expect(preview).toMatchObject({
      fileName: 'votes & "résultats".html',
      mediaType: "text/html; charset=utf-8",
    });
    expect(html).toContain("<thead><tr><th>nom</th><th>observation</th></tr></thead>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("L&#39;élu &amp; ses collègues");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('votes & "résultats"');
  });
});
