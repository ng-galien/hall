import { extname } from "node:path";

/** Multipart file names arrive as UTF-8 bytes read as Latin-1; returns the UTF-8 name when it decodes exactly. */
export function uploadFileName(name: string): string {
  if (![...name].every((char) => char.charCodeAt(0) <= 255)) return name;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(name, "latin1"));
  } catch {
    return name;
  }
}

/** The file name without its extension, every other character kept, « / » included. */
export function uploadFileStem(name: string): string {
  return name.slice(0, name.length - extname(name).length);
}
