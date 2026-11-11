import { z } from "zod";

const replaceInvalidCharacters = (value: string) =>
  [...value]
    .map((character) => (character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? "-" : character))
    .join("");
const reservedName = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i;

export const mailAttachmentFileNameSchema = z
  .string()
  .min(1)
  .refine((value) => replaceInvalidCharacters(value) === value && !/[. ]$/.test(value) && !reservedName.test(value));

/** Changes only the outgoing copy's name; source documents and attachment bytes are preserved. */
export function mailAttachmentFileName(value: string): string {
  const normalized = replaceInvalidCharacters(value).replace(/[. ]+$/g, "") || "document";
  return reservedName.test(normalized) ? `_${normalized}` : normalized;
}
