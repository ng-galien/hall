export type DatabaseRow = Record<string, unknown>;

export const asBoolean = (value: unknown): boolean => value === true || value === 1;
export const asNullableString = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

export async function mapSequential<T, U>(values: T[], mapper: (value: T) => Promise<U>): Promise<U[]> {
  const result: U[] = [];
  for (const value of values) result.push(await mapper(value));
  return result;
}
