/**
 * French cadastral parcel identifier: department (2, or 2A/2B), commune (3), prefix (3), section (2 characters with at
 * least one letter, such as 0A or AB), number (4). The section letter keeps a 14-digit SIRET from passing for a parcel.
 */
// @implements-requirement HALL-FR-DOC-360
export const CADASTRE_PARCEL_ID_PATTERN = /^([0-9]{2}|2A|2B)[0-9]{6}([0-9A-Z][A-Z]|[A-Z][0-9A-Z])[0-9]{4}$/;

/** Parcel identifiers found in free text, in order of first appearance and without repetition. */
export function cadastreParcelIdsInText(text: string): { parcelIds: string[]; rejected: string[] } {
  const parcelIds: string[] = [];
  const rejected: string[] = [];
  for (const token of text.split(/[\s,;|"']+/)) {
    const candidate = token.trim().toUpperCase();
    if (candidate === "") continue;
    if (CADASTRE_PARCEL_ID_PATTERN.test(candidate)) {
      if (!parcelIds.includes(candidate)) parcelIds.push(candidate);
    } else if (!rejected.includes(token.trim())) {
      rejected.push(token.trim());
    }
  }
  return { parcelIds, rejected };
}

function withoutLeadingZeros(value: string): string {
  return value.replace(/^0+(?=.)/, "");
}

/**
 * Label of a cadastral parcel: section then number without leading zeros, preceded by the prefix when it is not 000.
 * Section and number come from the section and numero properties, otherwise from the parcel identifier.
 */
// @implements-requirement HALL-FR-DOC-370
export function cadastreParcelLabel(parcelId: string, properties: Readonly<Record<string, unknown>> | null): string {
  const text = (name: string) => {
    const value = properties?.[name];
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  };
  const prefix = text("prefixe") ?? parcelId.slice(5, 8);
  const section = withoutLeadingZeros(text("section") ?? parcelId.slice(8, 10));
  const number = withoutLeadingZeros(text("numero") ?? parcelId.slice(10, 14));
  return [prefix === "000" ? null : prefix, section, number].filter((part) => part !== null).join(" ");
}
