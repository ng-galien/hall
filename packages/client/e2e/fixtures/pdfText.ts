import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** A run of text of a PDF page, with the position of its origin in PDF units (y grows upwards). */
export interface PdfTextRun {
  text: string;
  x: number;
  y: number;
}

/** The text runs of every page of a PDF, page by page. */
export async function pdfTextRuns(data: Buffer): Promise<PdfTextRun[][]> {
  const loading = getDocument({ data: new Uint8Array(data), useSystemFonts: true });
  try {
    const pdf = await loading.promise;
    const pages: PdfTextRun[][] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const content = await (await pdf.getPage(number)).getTextContent();
      pages.push(
        content.items.flatMap((item) =>
          "str" in item && item.str.trim() ? [{ text: item.str, x: item.transform[4], y: item.transform[5] }] : [],
        ),
      );
    }
    return pages;
  } finally {
    await loading.destroy();
  }
}

/** The first run of the pages that contains the text, with its page index. */
export function findRun(pages: PdfTextRun[][], text: string): (PdfTextRun & { page: number }) | undefined {
  for (const [page, runs] of pages.entries()) {
    const run = runs.find((entry) => entry.text.includes(text));
    if (run) return { ...run, page };
  }
  return undefined;
}
