import { PDFDocument } from "pdf-lib";
import { chromium } from "playwright";

export interface PdfRenderInput {
  html: string;
  headerHtml: string;
  footerHtml: string;
}

export interface DocumentRenderer {
  pdf(input: PdfRenderInput): Promise<Buffer>;
  appendPdfs(primary: Buffer, attachments: Buffer[]): Promise<Buffer>;
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
        const bytes = await page.pdf({
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
      for (const bytes of [primary, ...attachments]) {
        const source = await PDFDocument.load(bytes);
        const pages = await output.copyPages(source, source.getPageIndices());
        for (const page of pages) output.addPage(page);
      }
      return Buffer.from(await output.save());
    },
  };
}
