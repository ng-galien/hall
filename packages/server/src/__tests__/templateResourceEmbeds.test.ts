import { createHash } from "node:crypto";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { createTestServer } from "./testServer.js";

const template = (bodyMarkdown: string) => ({
  bodyMarkdown,
  subject: null,
  stylesheet: "",
  headerHtml: "",
  footerHtml: "",
});

const geographicDocument = {
  view: { kind: "center" as const, center: [2.15, 48.15] as [number, number], zoom: 14 },
  layers: [{ id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2" as const, visible: true, opacity: 1 }],
  hallLayer: { type: "FeatureCollection" as const, features: [] },
  provenance: {
    attribution: "Source : IGN",
    license: "Licence Ouverte 2.0" as const,
    metadataUrl: "https://geoservices.ign.fr/",
    configuredAt: "2026-08-31T10:00:00.000Z",
    sourceUpdatedAt: null,
  },
};

function resolvedLegalDocument(legalContent: string) {
  const contentHash = createHash("sha256").update(legalContent).digest("hex");
  const snapshotHash = createHash("sha256").update(`snapshot:${legalContent}`).digest("hex");
  const snapshot = {
    id: "00000000-0000-4000-8000-000000000001",
    commonId: "CID-L2121-10",
    versionId: "LEGIARTI000041410274",
    effectiveAt: "2020-01-01",
    fetchedAt: "2026-08-31T10:00:00.000Z",
    validFrom: "2020-01-01",
    validTo: null,
    legalStatus: "VIGUEUR",
    normalizedContent: legalContent,
    contentHash,
    snapshotHash,
  };
  return {
    resolutionStatus: "resolved" as const,
    provider: "legifrance" as const,
    referenceKind: "article" as const,
    fund: "CODE_DATE" as const,
    commonId: snapshot.commonId,
    versionId: snapshot.versionId,
    effectiveAt: snapshot.effectiveAt,
    legalStatus: snapshot.legalStatus,
    sourceUrl: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000041410274",
    fetchedAt: snapshot.fetchedAt,
    providerUpdatedAt: null,
    citationLabel: "CGCT, article L2121-10",
    attribution: "Source : DILA - Légifrance. Licence Ouverte 2.0.",
    snapshotHash,
    verificationDueAt: "2026-09-30T10:00:00.000Z",
    verificationStatus: "current" as const,
    verificationFailedAt: null,
    snapshots: [snapshot],
  };
}

async function extractedPdfText(content: Buffer): Promise<string> {
  const document = await getDocument({ data: new Uint8Array(content) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const text = await page.getTextContent();
    pages.push(text.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return pages.join("\n");
}

describe("authoritative resource presentation rendering", () => {
  it("appends inline PDF resources once in first-appearance order", async () => {
    const appendedIds: string[] = [];
    const { container } = await createTestServer({
      documentRenderer: {
        async pdf() {
          return Buffer.from("body");
        },
        async appendPdfs(primary, attachments) {
          appendedIds.push(...attachments.map((attachment) => attachment.id));
          return primary;
        },
      },
    });
    const resourcesClient = container.cradle.resourcesClient;
    const createPdf = (title: string) => {
      const content = Buffer.from(title);
      return resourcesClient.createDocument({
        name: title,
        path: "seed",
        mediaType: "application/pdf",
        content,
      });
    };
    const first = (await createPdf("Premier")).data;
    const second = (await createPdf("Second")).data;

    await container.cradle.contentTemplateService.previewPdf(
      [
        `:resource[Second]{#${second.id}}`,
        `:resource[Premier]{#${first.id}}`,
        `:resource[Second encore]{#${second.id}}`,
      ].join("\n\n"),
      {},
    );

    expect(appendedIds).toEqual([second.id, first.id]);
  });

  it("feeds the exact authoritative preview body to the PDF renderer", async () => {
    let renderedHtml = "";
    const { container } = await createTestServer({
      documentRenderer: {
        async pdf(input) {
          renderedHtml = input.html;
          return Buffer.from("pdf");
        },
        async appendPdfs(primary) {
          return primary;
        },
      },
    });
    const remote = (
      await container.cradle.resourcesClient.create({
        kind: "remote",
        name: "Portail institutionnel",
        path: "seed",
        target: { kind: "url", url: "https://example.fr/dossier" },
      })
    ).data;
    const markdown = `::resource-embed[Lien]{#${remote.id} presentation="link"}`;
    const authoritativePreview = await container.cradle.templateRenderingService.preview(template(markdown));

    await expect(container.cradle.contentTemplateService.previewPdf(markdown, {})).resolves.toEqual(Buffer.from("pdf"));

    expect(renderedHtml).toBe(authoritativePreview.printHtml);
    expect(renderedHtml).toContain("https://example.fr/dossier");
  });

  it("renders every presentation for which the server owns static source data", async () => {
    const { container } = await createTestServer();
    const resourcesClient = container.cradle.resourcesClient;
    const text = (
      await resourcesClient.create({
        kind: "text",
        name: "Rapport renommé",
        path: "seed",
        content: "Contenu qui ne doit pas être recopié.",
      })
    ).data;
    const imageContent = Buffer.from("89504e470d0a1a0a", "hex");
    const image = (
      await resourcesClient.createDocument({
        name: "plan.png",
        path: "seed",
        mediaType: "image/png",
        content: imageContent,
      })
    ).data;
    const pdfContent = Buffer.from("pdf-content");
    const pdf = (
      await resourcesClient.createDocument({
        name: "Annexe financière",
        path: "seed",
        mediaType: "application/pdf",
        content: pdfContent,
      })
    ).data;
    const remote = (
      await resourcesClient.create({
        kind: "remote",
        name: "Portail institutionnel",
        path: "seed",
        target: { kind: "url", url: "https://example.fr/dossier?version=1&lang=fr" },
      })
    ).data;
    const spreadsheet = (
      await resourcesClient.create({
        kind: "spreadsheet",
        name: "Budget primitif",
        path: "seed",
        document: {
          schemaVersion: 2,
          workbook: {
            id: "workbook-1",
            name: "Budget primitif",
            sheetOrder: ["sheet-1"],
            sheets: {
              "sheet-1": {
                id: "sheet-1",
                name: "Dépenses",
                rowCount: 20,
                columnCount: 8,
                cellData: {
                  0: { 0: { v: "Poste", t: 1, s: { bl: 1 } }, 1: { v: "Montant", t: 1, s: { bl: 1 } } },
                  1: {
                    0: { v: "Mobilier", t: 1 },
                    1: { f: "=100+20", v: 120, t: 2, s: { n: { pattern: '#,##0.00 "€"' }, ht: 3 } },
                  },
                },
              },
            },
          },
        },
      })
    ).data;
    const legalContent = "Toute convocation est faite par le maire.";
    const legal = (
      await resourcesClient.create({
        kind: "legalReference",
        name: "CGCT, article L2121-10",
        path: "seed",
        document: resolvedLegalDocument(legalContent),
      })
    ).data;

    const preview = await container.cradle.templateRenderingService.preview(
      template(
        [
          `Texte : :resource[Ancien titre]{#${text.id}}`,
          `PDF inline : :resource[Ancien PDF]{#${pdf.id}}`,
          `Web inline : :resource[Ancien lien]{#${remote.id}}`,
          `::resource-embed[Plan]{#${image.id} presentation="image" align="center" width="60"}`,
          `::resource-embed[Annexe]{#${pdf.id} presentation="document"}`,
          `::resource-embed[Lien]{#${remote.id} presentation="link"}`,
          `::resource-embed[Article]{#${legal.id} presentation="legal-citation"}`,
          `::resource-embed[Budget]{#${spreadsheet.id} presentation="table" sheet="sheet-1" range="A1:B2"}`,
        ].join("\n\n"),
      ),
    );

    expect(preview.diagnostics).toEqual([]);
    expect(preview.printHtml).toContain("Rapport renommé");
    expect(preview.printHtml).not.toContain("Contenu qui ne doit pas être recopié");
    expect(preview.printHtml).toContain(`data:image/png;base64,${imageContent.toString("base64")}`);
    expect(preview.printHtml).toContain(`href="https://hall.invalid/pdf-attachments/${pdf.id}"`);
    expect(preview.printHtml).toContain(">Annexe financière</a>");
    expect(preview.pdfAttachments.map((resource) => resource.id)).toEqual([pdf.id]);
    expect(preview.printHtml).toContain("https://example.fr/dossier?version=1&#x26;lang=fr");
    expect(preview.printHtml).toContain(">Portail institutionnel</a>");
    expect(preview.printHtml).toContain('target="_blank"');
    expect(preview.printHtml).toContain(">CGCT, article L2121-10</a>");
    expect(preview.printHtml).toContain("Toute convocation est faite par le maire.");
    expect(preview.printHtml).not.toContain("VIGUEUR");
    expect(preview.printHtml).not.toContain("Licence Ouverte 2.0");
    expect(preview.printHtml).toContain("<strong>Dépenses</strong> - A1:B2");
    expect(preview.printHtml).toContain("Mobilier");
    expect(preview.printHtml).toContain("120,00");
    expect(preview.printHtml).toContain("font-weight: bold");
    expect(preview.printHtml).not.toContain("=100+20");
    expect(preview.html).toContain(preview.printHtml.match(/<main[^>]*>([\s\S]*)<\/main>/)?.[1] ?? "missing");
  });

  it("keeps the legal citation and article text in the final Chromium PDF", async () => {
    const { container } = await createTestServer();
    const resourcesClient = container.cradle.resourcesClient;
    const legalContent =
      "Toute convocation est faite par le maire. Elle indique les questions portées à l'ordre du jour.";
    const legal = (
      await resourcesClient.create({
        kind: "legalReference",
        name: "CGCT, article L2121-10",
        path: "seed",
        document: resolvedLegalDocument(legalContent),
      })
    ).data;

    const pdf = await container.cradle.contentTemplateService.previewPdf(
      `::resource-embed[Article]{#${legal.id} presentation="legal-citation"}`,
      {},
    );
    const text = await extractedPdfText(pdf);

    expect(text).toContain("CGCT, article L2121-10");
    expect(text).toContain(legalContent);
    expect(text).not.toContain("VIGUEUR");
    expect(text).not.toContain("Licence Ouverte 2.0");
    expect(text).not.toContain("DILA");
  });

  it("diagnoses missing and incompatible resources while rendering the persisted map", async () => {
    const { container } = await createTestServer();
    const resourcesClient = container.cradle.resourcesClient;
    const text = (
      await resourcesClient.create({ kind: "text", name: "Texte", path: "seed", content: "Texte" })
    ).data;
    const geography = (
      await resourcesClient.create({
        kind: "geographic",
        name: "Plan cadastral",
        path: "seed",
        document: geographicDocument,
      })
    ).data;

    const preview = await container.cradle.templateRenderingService.preview(
      template(
        [
          `::resource-embed[Absente]{#00000000-0000-4000-8000-000000000000 presentation="document"}`,
          `::resource-embed[Mauvais type]{#${text.id} presentation="document"}`,
          `::resource-embed[Carte]{#${geography.id} presentation="map"}`,
        ].join("\n\n"),
      ),
    );

    expect(preview.diagnostics).toEqual([
      expect.objectContaining({
        code: "unresolved_reference",
        anchor: expect.objectContaining({ directive: "resource-embed", occurrence: 0 }),
      }),
      expect.objectContaining({
        code: "incompatible_resource",
        anchor: expect.objectContaining({ directive: "resource-embed", occurrence: 1, id: text.id }),
      }),
    ]);
    expect(preview.printHtml).toContain("data:image/svg+xml;base64,");
    expect(preview.printHtml).not.toContain("image statique indisponible");
  });

  it("feeds the rendered map image to the real PDF preview pipeline", async () => {
    let renderedHtml = "";
    const { container } = await createTestServer({
      documentRenderer: {
        async pdf(input) {
          renderedHtml = input.html;
          return Buffer.from("%PDF-preview");
        },
        async appendPdfs(primary) {
          return primary;
        },
      },
    });
    const geography = (
      await container.cradle.resourcesClient.create({
        kind: "geographic",
        name: "Plan cadastral",
        path: "seed",
        document: geographicDocument,
      })
    ).data;

    await expect(
      container.cradle.contentTemplateService.previewPdf(
        `::resource-embed[Carte]{#${geography.id} presentation="map"}`,
        {},
      ),
    ).resolves.toEqual(Buffer.from("%PDF-preview"));
    expect(renderedHtml).toContain("data:image/svg+xml;base64,");
    expect(renderedHtml).not.toContain("image statique indisponible");
  });

  it("never recalculates a spreadsheet formula that has no persisted value", async () => {
    const { container } = await createTestServer();
    const spreadsheet = (
      await container.cradle.resourcesClient.create({
        kind: "spreadsheet",
        name: "Calcul non figé",
        path: "seed",
        document: {
          schemaVersion: 2,
          workbook: {
            id: "workbook-1",
            name: "Calcul non figé",
            sheetOrder: ["sheet-1"],
            sheets: {
              "sheet-1": {
                id: "sheet-1",
                name: "Feuille",
                rowCount: 20,
                columnCount: 8,
                cellData: { 0: { 0: { v: "Total", t: 1 } }, 1: { 0: { f: "=1+1" } } },
              },
            },
          },
        },
      })
    ).data;

    const preview = await container.cradle.templateRenderingService.preview(
      template(`::resource-embed[Calcul]{#${spreadsheet.id} presentation="table" sheet="sheet-1" range="A1:A2"}`),
    );

    expect(preview.diagnostics).toEqual([
      expect.objectContaining({
        code: "resource_representation_unavailable",
        message: expect.stringContaining("without a persisted calculated value"),
      }),
    ]);
    expect(preview.printHtml).not.toContain("=1+1");
    expect(preview.printHtml).not.toContain(">2<");
  });
});
