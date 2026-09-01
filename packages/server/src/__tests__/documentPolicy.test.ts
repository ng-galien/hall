import { createHash } from "node:crypto";
import { documentFormats } from "@hall/domain";
import { describe, expect, it } from "vitest";
import {
  acceptedDocumentExtensions,
  acceptedSpreadsheetImportExtensions,
  documentPreviewMode,
  inspectDocument,
  inspectSpreadsheetImport,
} from "../domain/documentPolicy.js";

function storedZip(entries: Array<[name: string, content: string]>): Buffer {
  const localEntries: Buffer[] = [];
  const centralEntries: Buffer[] = [];
  let localOffset = 0;
  for (const [name, value] of entries) {
    const nameBytes = Buffer.from(name);
    const content = Buffer.from(value);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    const localEntry = Buffer.concat([localHeader, nameBytes, content]);
    localEntries.push(localEntry);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
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

const openXml = (directory: string, mimeType: string) =>
  storedZip([
    ["[Content_Types].xml", `<Types><Override ContentType="${mimeType}.main+xml"/></Types>`],
    [`${directory}/document.xml`, "<document/>"],
  ]);

describe("document policy", () => {
  it("defines one preview mode for every document format", () => {
    expect(Object.fromEntries(documentFormats.map((format) => [format, documentPreviewMode(format)]))).toEqual({
      pdf: "native",
      jpeg: "native",
      png: "native",
      docx: "convertible",
      odt: "convertible",
      xlsx: "convertible",
      pptx: "convertible",
      txt: "convertible",
      csv: "convertible",
    });
  });

  it.each([
    ["piece.pdf", Buffer.from("%PDF-1.7\ncontent"), "pdf", "application/pdf"],
    ["photo.JPG", Buffer.from([0xff, 0xd8, 0xff, 0x00]), "jpeg", "image/jpeg"],
    [
      "scan.png",
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
      "png",
      "image/png",
    ],
    ["note.txt", Buffer.from("Texte UTF-8 - mairie"), "txt", "text/plain; charset=utf-8"],
    [
      "rapport.docx",
      openXml("word", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      "docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    [
      "support.pptx",
      openXml("ppt", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
      "pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    [
      "rapport.odt",
      storedZip([["mimetype", "application/vnd.oasis.opendocument.text"]]),
      "odt",
      "application/vnd.oasis.opendocument.text",
    ],
  ] as const)("identifies %s from its extension and bytes", async (fileName, content, format, mediaType) => {
    await expect(inspectDocument(fileName, content)).resolves.toEqual({
      format,
      mediaType,
      contentSha256: createHash("sha256").update(content).digest("hex"),
    });
  });

  it("rejects extensions outside the explicit modern allow-list", async () => {
    await expect(inspectDocument("script.html", Buffer.from("<script></script>"))).rejects.toMatchObject({
      code: "unsupported_document_format",
      statusCode: 415,
    });
    await expect(inspectDocument("legacy.doc", Buffer.alloc(16))).rejects.toMatchObject({
      code: "unsupported_document_format",
      statusCode: 415,
    });
    await expect(inspectDocument("table.csv", Buffer.from("nom;voix\nAlice;1"))).rejects.toMatchObject({
      code: "unsupported_document_format",
      statusCode: 415,
    });
    await expect(
      inspectDocument(
        "budget.xlsx",
        openXml("xl", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      ),
    ).rejects.toMatchObject({ code: "unsupported_document_format", statusCode: 415 });
  });

  it("reserves CSV and XLSX files for spreadsheet import", async () => {
    const csv = Buffer.from("nom;voix\nAlice;1");
    const xlsx = openXml("xl", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    await expect(inspectSpreadsheetImport("table.csv", csv)).resolves.toMatchObject({
      format: "csv",
      mediaType: "text/csv; charset=utf-8",
    });
    await expect(inspectSpreadsheetImport("budget.xlsx", xlsx)).resolves.toMatchObject({
      format: "xlsx",
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await expect(inspectSpreadsheetImport("note.txt", Buffer.from("texte"))).rejects.toMatchObject({
      code: "unsupported_document_format",
      statusCode: 415,
    });
  });

  it("rejects malformed containers and bytes that do not match the selected format", async () => {
    await expect(inspectDocument("fake.docx", Buffer.from("PK\u0003\u0004word/document.xml"))).rejects.toMatchObject({
      code: "document_content_mismatch",
      statusCode: 422,
    });
    await expect(inspectDocument("fake.pdf", Buffer.from("not a pdf"))).rejects.toMatchObject({
      code: "document_content_mismatch",
      statusCode: 422,
    });
    await expect(inspectDocument("invalid-utf8.txt", Buffer.from([0xc3, 0x28]))).rejects.toMatchObject({
      code: "document_content_mismatch",
      statusCode: 422,
    });
    await expect(inspectDocument("binary.txt", Buffer.from([0x41, 0x00, 0x42]))).rejects.toMatchObject({
      code: "document_content_mismatch",
      statusCode: 422,
    });
  });

  it("rejects macro-enabled Office content renamed with an allowed extension", async () => {
    const macroDocument = openXml("word", "application/vnd.ms-word.document.macroEnabled");
    await expect(inspectDocument("renamed.docx", macroDocument)).rejects.toMatchObject({
      code: "document_content_mismatch",
      statusCode: 422,
    });
  });

  it("publishes a stable allow-list for the HTTP contract", () => {
    expect(acceptedDocumentExtensions).toEqual([".pdf", ".jpg", ".jpeg", ".png", ".docx", ".odt", ".pptx", ".txt"]);
    expect(acceptedSpreadsheetImportExtensions).toEqual([".csv", ".xlsx"]);
  });
});
