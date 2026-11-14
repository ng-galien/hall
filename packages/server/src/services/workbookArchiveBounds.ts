import { inflateRawSync } from "node:zlib";
import { DomainError } from "./errors.js";

// @implements-requirement HALL-TR-DOC-090
/** Bounds of an XLSX workbook accepted for import or table conversion, checked before the workbook is parsed. */
export const workbookArchiveBounds = Object.freeze({
  /** Total size of the archive entries once decompressed. */
  expandedBytes: 64 * 1024 * 1024,
  /** Number of worksheets. */
  worksheets: 50,
  /** Number of cells written in all worksheets. */
  cells: 500_000,
});

const endOfCentralDirectorySignature = 0x06054b50;
const centralDirectoryEntrySignature = 0x02014b50;
const localFileHeaderSignature = 0x04034b50;
const worksheetEntry = /^xl\/worksheets\/[^/]+\.xml$/;
const cellElement = /<(?:[A-Za-z_][\w.-]*:)?c[\s/>]/g;

function tooLarge(): never {
  throw new DomainError("spreadsheet_too_large", 413);
}

function malformed(): never {
  throw new DomainError("invalid_request", 422);
}

function endOfCentralDirectory(content: Buffer): number {
  const earliest = Math.max(0, content.length - 22 - 0xffff);
  for (let offset = content.length - 22; offset >= earliest; offset -= 1) {
    if (content.readUInt32LE(offset) === endOfCentralDirectorySignature) return offset;
  }
  return malformed();
}

function expandedEntry(method: number, data: Buffer, budget: number): Buffer {
  if (method === 0) return data;
  if (method !== 8) return malformed();
  try {
    return inflateRawSync(data, { maxOutputLength: Math.max(1, budget) });
  } catch (error) {
    if (error instanceof RangeError) return tooLarge();
    return malformed();
  }
}

/**
 * Reads the ZIP container of an XLSX workbook entry by entry and refuses it with spreadsheet_too_large as soon as its
 * decompressed size, its worksheet count or its cell count exceeds workbookArchiveBounds. Decompression is bounded by
 * the remaining size budget, whatever sizes the archive declares.
 */
export function checkWorkbookArchiveBounds(content: Buffer): void {
  if (content.length < 22) malformed();
  const end = endOfCentralDirectory(content);
  const entryCount = content.readUInt16LE(end + 10);
  const directoryOffset = content.readUInt32LE(end + 16);
  if (entryCount === 0xffff || directoryOffset === 0xffffffff) tooLarge();
  let offset = directoryOffset;
  let expandedBytes = 0;
  let worksheets = 0;
  let cells = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > content.length || content.readUInt32LE(offset) !== centralDirectoryEntrySignature) malformed();
    const flags = content.readUInt16LE(offset + 8);
    const method = content.readUInt16LE(offset + 10);
    const compressedSize = content.readUInt32LE(offset + 20);
    const nameLength = content.readUInt16LE(offset + 28);
    const extraLength = content.readUInt16LE(offset + 30);
    const commentLength = content.readUInt16LE(offset + 32);
    const localOffset = content.readUInt32LE(offset + 42);
    const name = content.toString("utf8", offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (flags & 0x1) malformed();
    if (compressedSize === 0xffffffff || localOffset === 0xffffffff) tooLarge();
    if (localOffset + 30 > content.length || content.readUInt32LE(localOffset) !== localFileHeaderSignature)
      malformed();
    const dataStart =
      localOffset + 30 + content.readUInt16LE(localOffset + 26) + content.readUInt16LE(localOffset + 28);
    if (dataStart + compressedSize > content.length) malformed();
    const data = content.subarray(dataStart, dataStart + compressedSize);
    const expanded = expandedEntry(method, data, workbookArchiveBounds.expandedBytes - expandedBytes);
    expandedBytes += expanded.length;
    if (expandedBytes > workbookArchiveBounds.expandedBytes) tooLarge();
    if (!worksheetEntry.test(name)) continue;
    worksheets += 1;
    if (worksheets > workbookArchiveBounds.worksheets) tooLarge();
    cells += expanded.toString("utf8").match(cellElement)?.length ?? 0;
    if (cells > workbookArchiveBounds.cells) tooLarge();
  }
}
