/** Multipart file names arrive as UTF-8 bytes read as Latin-1; returns the UTF-8 name when it decodes exactly. */
export function uploadFileName(name: string): string {
  if (![...name].every((char) => char.charCodeAt(0) <= 255)) return name;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(name, "latin1"));
  } catch {
    return name;
  }
}
