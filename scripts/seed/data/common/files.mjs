import { deflateSync } from "node:zlib";

/** Generates a dependency-free, single-page A4 PDF using Helvetica and WinAnsi. */
export function makePdf(title, lines) {
  const esc = (text) =>
    text
      .replace(/\u2014/g, "-")
      .replace(/’/g, "'")
      .replace(/œ/g, "oe")
      .replace(/…/g, "...")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  let y = 760;
  const ops = [`BT /F1 16 Tf 56 792 Td (${esc(title)}) Tj ET`];
  const wrappedLines = lines.flatMap((line) => {
    const wrapped = [];
    let current = "";
    for (const word of line.split(/\s+/)) {
      if (current && current.length + word.length + 1 > 78) {
        wrapped.push(current);
        current = "";
      }
      current = current ? `${current} ${word}` : word;
    }
    wrapped.push(current);
    return wrapped;
  });
  for (const line of wrappedLines) {
    ops.push(`BT /F1 11 Tf 56 ${y} Td (${esc(line)}) Tj ET`);
    y -= 18;
  }
  const content = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

function crc32(value) {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeStoredZip(entries) {
  const localEntries = [];
  const centralEntries = [];
  let localOffset = 0;
  for (const [name, rawContent] of entries) {
    const nameBytes = Buffer.from(name);
    const content = Buffer.from(rawContent);
    const checksum = crc32(content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    const localEntry = Buffer.concat([localHeader, nameBytes, content]);
    localEntries.push(localEntry);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralEntries.push(Buffer.concat([centralHeader, nameBytes]));
    localOffset += localEntry.length;
  }
  const centralDirectory = Buffer.concat(centralEntries);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localEntries, centralDirectory, end]);
}

export function makeDocx(text) {
  const mainType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
  return makeStoredZip([
    [
      "[Content_Types].xml",
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${mainType}"/></Types>`,
    ],
    [
      "_rels/.rels",
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ],
    [
      "word/document.xml",
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
    ],
  ]);
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function spreadsheetColumn(index) {
  let value = index + 1;
  let column = "";
  while (value > 0) {
    value -= 1;
    column = String.fromCharCode(65 + (value % 26)) + column;
    value = Math.floor(value / 26);
  }
  return column;
}

export function makeXlsx(rows, sheetName = "Données") {
  const worksheetRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const reference = `${spreadsheetColumn(columnIndex)}${rowIndex + 1}`;
          if (typeof value === "number") return `<c r="${reference}"><v>${value}</v></c>`;
          const style = rowIndex === 0 ? ' s="1"' : "";
          return `<c r="${reference}" t="inlineStr"${style}><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  const lastColumn = spreadsheetColumn(
    Math.max(0, rows.reduce((maximum, row) => Math.max(maximum, row.length), 1) - 1),
  );
  const lastRow = Math.max(1, rows.length);
  return makeStoredZip([
    [
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    ],
    [
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ],
    [
      "xl/styles.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    ],
    [
      "xl/worksheets/sheet1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="2" width="20" customWidth="1"/><col min="3" max="3" width="45" customWidth="1"/></cols><sheetData>${worksheetRows}</sheetData><pageSetup orientation="landscape" paperSize="9"/></worksheet>`,
    ],
  ]);
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return chunk;
}

/**
 * Generates an RGB PNG from simple shapes drawn in order on a plain background.
 * Shapes: { kind: "rect", x, y, width, height, color, stroke? }, { kind: "disc", x, y, radius, color },
 * { kind: "path", points: [[x, y], ...], width, color, dash? }.
 */
export function makePng({ width, height, background, shapes }) {
  const pixels = Buffer.alloc(width * height * 3);
  const paint = (x, y, [red, green, blue]) => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const offset = (py * width + px) * 3;
    pixels[offset] = red;
    pixels[offset + 1] = green;
    pixels[offset + 2] = blue;
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) paint(x, y, background);
  for (const shape of shapes) {
    if (shape.kind === "rect") {
      const stroke = shape.stroke ?? 0;
      for (let y = shape.y; y < shape.y + shape.height; y += 1) {
        for (let x = shape.x; x < shape.x + shape.width; x += 1) {
          const onEdge =
            x < shape.x + stroke ||
            x >= shape.x + shape.width - stroke ||
            y < shape.y + stroke ||
            y >= shape.y + shape.height - stroke;
          if (stroke === 0 || onEdge) paint(x, y, shape.color);
        }
      }
    } else if (shape.kind === "disc") {
      for (let y = -shape.radius; y <= shape.radius; y += 1) {
        for (let x = -shape.radius; x <= shape.radius; x += 1) {
          if (x * x + y * y <= shape.radius * shape.radius) paint(shape.x + x, shape.y + y, shape.color);
        }
      }
    } else if (shape.kind === "path") {
      let travelled = 0;
      for (let index = 1; index < shape.points.length; index += 1) {
        const [x0, y0] = shape.points[index - 1];
        const [x1, y1] = shape.points[index];
        const length = Math.hypot(x1 - x0, y1 - y0);
        for (let step = 0; step <= length; step += 0.5) {
          const along = travelled + step;
          if (shape.dash && Math.floor(along / shape.dash) % 2 === 1) continue;
          const x = x0 + ((x1 - x0) * step) / length;
          const y = y0 + ((y1 - y0) * step) / length;
          const half = shape.width / 2;
          for (let dy = -half; dy <= half; dy += 1)
            for (let dx = -half; dx <= half; dx += 1) paint(x + dx, y + dy, shape.color);
        }
        travelled += length;
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const scanlines = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    pixels.copy(scanlines, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
