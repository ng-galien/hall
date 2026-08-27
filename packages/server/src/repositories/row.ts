export type DatabaseRow = Record<string, unknown>;

export const asBoolean = (value: unknown): boolean => value === 1;
export const asNullableString = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);
