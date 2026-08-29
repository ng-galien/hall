import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { SqlQueryName } from "../infrastructure/database/queries.js";

export function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr-FR")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "element"
  );
}

export async function nextAnnualNumber(
  sqlExecutor: SqlExecutor,
  kind: "meeting" | "decision",
  year: number,
): Promise<{ sequence: number; value: string }> {
  const row = await sqlExecutor.get("numberSequence.next", { kind, year });
  const sequence = Number(row?.last_value);
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("Invalid number sequence");
  return { sequence, value: `${year}-${String(sequence).padStart(3, "0")}` };
}

export async function uniqueSlug(
  sqlExecutor: SqlExecutor,
  query: Extract<SqlQueryName, `${string}.slugExists`>,
  value: string,
): Promise<string> {
  const base = slugify(value);
  let candidate = base;
  let suffix = 2;
  while (await sqlExecutor.get(query, { slug: candidate })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
