import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from "pdf-lib";
import { chromium } from "playwright";

export interface PdfRenderInput {
  html: string;
  headerHtml: string;
  footerHtml: string;
}

export interface DocumentationPrintInput {
  url: string;
  footerHtml: string;
}

export interface PdfAttachment {
  id: string;
  content: Buffer;
}

export function pdfAttachmentHref(id: string): string {
  return `https://hall.invalid/pdf-attachments/${encodeURIComponent(id)}`;
}

export interface DocumentRenderer {
  pdf(input: PdfRenderInput): Promise<Buffer>;
  appendPdfs(primary: Buffer, attachments: PdfAttachment[]): Promise<Buffer>;
}

function annotationUri(annotation: PDFDict): string | null {
  const action = annotation.lookupMaybe(PDFName.of("A"), PDFDict);
  const uri = action?.lookupMaybe(PDFName.of("URI"), PDFString, PDFHexString);
  return uri?.decodeText() ?? null;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export async function printDocumentation(input: DocumentationPrintInput): Promise<Buffer> {
  const printOrigin = originOf(input.url);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      javaScriptEnabled: true,
      serviceWorkers: "block",
      locale: "fr-FR",
      colorScheme: "light",
    });
    await context.route("**/*", (route) => {
      const url = route.request().url();
      const allowed =
        url.startsWith("about:") ||
        url.startsWith("data:") ||
        url.startsWith("blob:") ||
        (printOrigin !== null && originOf(url) === printOrigin);
      return allowed ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    await page.goto(input.url, { waitUntil: "load" });
    await page.waitForSelector("html[data-docs-print-ready]", { state: "attached", timeout: 60_000 });
    await page.evaluate("document.fonts.ready.then(() => true)");
    const bytes = await page.pdf({
      format: "A4",
      printBackground: true,
      outline: true,
      tagged: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: input.footerHtml,
      margin: { top: "16mm", right: "16mm", bottom: "18mm", left: "16mm" },
    });
    await context.close();
    return Buffer.from(bytes);
  } finally {
    await browser.close();
  }
}

export function createDocumentRenderer(): DocumentRenderer {
  return {
    async pdf(input) {
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({ javaScriptEnabled: false });
        await context.route("**/*", (route) => {
          const url = route.request().url();
          return url.startsWith("about:") || url.startsWith("data:") ? route.continue() : route.abort();
        });
        const page = await context.newPage();
        await page.setContent(input.html, { waitUntil: "load" });
        await page.evaluate("document.fonts.ready.then(() => true)");
        const bytes = await page.pdf({
          preferCSSPageSize: true,
          format: "A4",
          printBackground: true,
          displayHeaderFooter: Boolean(input.headerHtml || input.footerHtml),
          headerTemplate: input.headerHtml || "<span></span>",
          footerTemplate: input.footerHtml || "<span></span>",
          margin: {
            top: input.headerHtml ? "28mm" : "18mm",
            right: "18mm",
            bottom: input.footerHtml ? "25mm" : "18mm",
            left: "18mm",
          },
        });
        await context.close();
        return Buffer.from(bytes);
      } finally {
        await browser.close();
      }
    },
    async appendPdfs(primary, attachments) {
      const output = await PDFDocument.create();
      const primaryDocument = await PDFDocument.load(primary);
      const primaryPages = await output.copyPages(primaryDocument, primaryDocument.getPageIndices());
      for (const page of primaryPages) output.addPage(page);

      const destinations = new Map<string, ReturnType<typeof output.getPage>["ref"]>();
      for (const attachment of attachments) {
        const source = await PDFDocument.load(attachment.content);
        const pages = await output.copyPages(source, source.getPageIndices());
        if (pages[0]) destinations.set(pdfAttachmentHref(attachment.id), pages[0].ref);
        for (const page of pages) output.addPage(page);
      }

      for (const page of primaryPages) {
        const annotations = page.node.Annots();
        if (!annotations) continue;
        for (const reference of annotations.asArray()) {
          const annotation = output.context.lookup(reference, PDFDict);
          const uri = annotationUri(annotation);
          const destinationPage = destinations.get(uri ?? "");
          if (!destinationPage) {
            const action = annotation.lookupMaybe(PDFName.of("A"), PDFDict);
            if (uri && action) action.set(PDFName.of("NewWindow"), PDFBool.True);
            continue;
          }
          const destination = PDFArray.withContext(output.context);
          destination.push(destinationPage);
          destination.push(PDFName.of("Fit"));
          annotation.delete(PDFName.of("A"));
          annotation.set(PDFName.of("Dest"), destination);
        }
      }
      return Buffer.from(await output.save());
    },
  };
}
