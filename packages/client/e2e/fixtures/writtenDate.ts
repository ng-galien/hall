/** A date as Hall writes it in English: day and month in words, the year only when it is not the current year. */
export function writtenDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value.length === 10 ? `${value}T12:00:00` : value) : value;
  const otherYear = date.getFullYear() !== new Date().getFullYear();
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", ...(otherYear ? { year: "numeric" } : {}) });
}
