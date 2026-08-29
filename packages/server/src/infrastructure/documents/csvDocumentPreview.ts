import type { DocumentPreviewConversionInput } from "../../services/documentPreviewConverter.js";

const delimiters = [";", ",", "\t"] as const;

function parseWithDelimiter(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const finishField = () => {
    row.push(field);
    field = "";
  };
  const finishRow = () => {
    finishField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === delimiter) {
      finishField();
    } else if (character === "\n") {
      finishRow();
    } else if (character === "\r") {
      if (text[index + 1] === "\n") index += 1;
      finishRow();
    } else {
      field += character;
    }
  }
  if (field.length > 0 || row.length > 0) finishRow();
  return rows;
}

function delimiterScore(rows: string[][]): number {
  const sampledRows = rows.filter((row) => row.some((cell) => cell.length > 0)).slice(0, 20);
  if (sampledRows.length === 0) return 0;
  const frequencies = new Map<number, number>();
  for (const row of sampledRows) frequencies.set(row.length, (frequencies.get(row.length) ?? 0) + 1);
  const [columnCount, matchingRows] = [...frequencies.entries()].sort(
    ([leftColumns, leftCount], [rightColumns, rightCount]) => rightCount - leftCount || rightColumns - leftColumns,
  )[0];
  if (columnCount <= 1) return 0;
  return matchingRows * 1_000 + columnCount * 10 - (sampledRows.length - matchingRows);
}

export function parseCsv(content: Buffer): string[][] {
  const text = content.toString("utf8").replace(/^\uFEFF/, "");
  let selectedRows = parseWithDelimiter(text, delimiters[0]);
  let selectedScore = delimiterScore(selectedRows);
  for (const delimiter of delimiters.slice(1)) {
    const rows = parseWithDelimiter(text, delimiter);
    const score = delimiterScore(rows);
    if (score > selectedScore) {
      selectedRows = rows;
      selectedScore = score;
    }
  }
  return selectedRows;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function csvAsHtmlDocument(input: DocumentPreviewConversionInput): DocumentPreviewConversionInput {
  const rows = parseCsv(input.content);
  const [header = [""], ...body] = rows;
  const headerCells = header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");
  const bodyRows = body.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  const title = escapeHtml(input.fileName);
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
@page { size: A4 landscape; margin: 14mm; }
body { color: #172033; font-family: Arial, sans-serif; font-size: 10pt; }
h1 { font-size: 15pt; margin: 0 0 10mm; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #9aa4b5; padding: 5px 7px; text-align: left; vertical-align: top; }
th { background: #e8edf5; font-weight: bold; }
tbody tr:nth-child(even) td { background: #f7f9fc; }
</style>
</head>
<body>
<h1>${title}</h1>
<table>
<thead><tr>${headerCells}</tr></thead>
<tbody>${bodyRows}</tbody>
</table>
</body>
</html>`;
  return {
    fileName: input.fileName.replace(/\.csv$/i, ".html"),
    mediaType: "text/html; charset=utf-8",
    content: Buffer.from(html, "utf8"),
  };
}
