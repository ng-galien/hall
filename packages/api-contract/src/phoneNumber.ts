import { z } from "zod";

/** Spaces, dots, hyphens and parentheses a person types between the digits of a number. */
const presentationSeparators = /[\s.()-]/g;

/**
 * The stored form of a telephone number: `+33` followed by nine digits for a French number typed with ten digits,
 * with or without separators or the `+33` prefix; any other international number typed with `+` keeps its digits.
 * Returns null when the text is not a telephone number.
 * @implements-requirement HALL-FR-DIR-170
 */
export function normalizePhoneNumber(value: string): string | null {
  const compact = value.replace(presentationSeparators, "");
  if (/^0[1-9]\d{8}$/.test(compact)) return `+33${compact.slice(1)}`;
  if (/^\+330[1-9]\d{8}$/.test(compact)) return `+33${compact.slice(4)}`;
  if (/^\+33[1-9]\d{8}$/.test(compact)) return compact;
  if (/^\+(?!33)[1-9]\d{6,14}$/.test(compact)) return compact;
  return null;
}

/** A stored French number in pairs of digits, « 07 86 29 55 76 »; another international number as stored. */
export function formatPhoneNumber(stored: string): string {
  const french = stored.match(/^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/);
  return french ? `0${french[1]} ${french.slice(2).join(" ")}` : stored;
}

export const phoneNumberInvalidMessage =
  "A telephone number has ten digits starting with 0, or starts with + followed by its country code";

/** An optional number entered by a person: empty means no number, any other text must be a telephone number. */
export const phoneNumberInputSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z
    .string()
    .max(40)
    .nullable()
    .default(null)
    .transform((value, context) => {
      if (value === null) return null;
      const normalized = normalizePhoneNumber(value);
      if (normalized) return normalized;
      context.addIssue({ code: "custom", message: phoneNumberInvalidMessage });
      return z.NEVER;
    }),
);
