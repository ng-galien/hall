export type DatabaseRow = Record<string, unknown>;

function persistedTypeError(field: string, expected: string, value: unknown): Error {
  return new Error(`Invalid persisted ${field}: expected ${expected}, received ${String(value)}`);
}

export function asString(value: unknown, field = "string"): string {
  if (typeof value !== "string") throw persistedTypeError(field, "a string", value);
  return value;
}

export function asNullableString(value: unknown, field = "nullable string"): string | null {
  if (value === null) return null;
  return asString(value, field);
}

export function asInteger(value: unknown, field = "integer"): number {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed)) throw persistedTypeError(field, "a safe integer", value);
  return parsed;
}

export function asNullableInteger(value: unknown, field = "nullable integer"): number | null {
  if (value === null) return null;
  return asInteger(value, field);
}

export function asNumber(value: unknown, field = "number"): number {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw persistedTypeError(field, "a finite number", value);
  return parsed;
}

export function asNullableNumber(value: unknown, field = "nullable number"): number | null {
  if (value === null) return null;
  return asNumber(value, field);
}

export async function mapSequential<T, U>(values: T[], mapper: (value: T) => Promise<U>): Promise<U[]> {
  const result: U[] = [];
  for (const value of values) result.push(await mapper(value));
  return result;
}
