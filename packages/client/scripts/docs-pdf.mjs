/* Prints the whole French documentation to one PDF (`npm run build:docs:pdf`).
   The standalone site is built into a temporary folder, its print view (`#/docs-print`) is printed by
   Chromium, and the PDF is written to public/documentation/ (copied into the client build and served
   at /app/documentation/) and next to the standalone site in dist-docs/. */
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { build } from "vite";

const clientDirectory = resolve(import.meta.dirname, "..");
const fileName = "documentation-hall.pdf";
const outputs = [join(clientDirectory, "public/documentation", fileName), join(clientDirectory, "dist-docs", fileName)];

const siteDirectory = await mkdtemp(join(tmpdir(), "hall-docs-pdf-"));
try {
  await build({
    configFile: join(clientDirectory, "vite.docs.config.ts"),
    root: clientDirectory,
    logLevel: "warn",
    build: { outDir: siteDirectory, emptyOutDir: true },
  });

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ locale: "fr-FR", colorScheme: "light" });
    const page = await context.newPage();
    await page.goto(`${pathToFileURL(join(siteDirectory, "docs-site.html")).href}#/docs-print`);
    await page.waitForSelector("html[data-docs-print-ready]");
    await page.evaluate(() => document.fonts.ready);
    const [first] = outputs;
    await mkdir(resolve(first, ".."), { recursive: true });
    await page.pdf({
      path: first,
      format: "A4",
      printBackground: true,
      outline: true,
      tagged: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="width:100%;text-align:center;font-family:sans-serif;font-size:8pt;color:#555">' +
        'Documentation de Hall · page <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { top: "16mm", bottom: "18mm", left: "16mm", right: "16mm" },
    });
    for (const output of outputs.slice(1)) {
      await mkdir(resolve(output, ".."), { recursive: true });
      await copyFile(first, output);
    }
  } finally {
    await browser.close();
  }
  for (const output of outputs) console.log(output);
} finally {
  await rm(siteDirectory, { recursive: true, force: true });
}
