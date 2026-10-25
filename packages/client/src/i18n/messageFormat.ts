export type MessageValues = Record<string, string | number>;

export function interpolateMessage(message: string, values: MessageValues = {}): string {
  return message.replace(/\{([\w]+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : placeholder,
  );
}

export function pluralMessage(locale: string, count: number, one: string, other: string): string {
  return interpolateMessage(new Intl.PluralRules(locale).select(count) === "one" ? one : other, { count });
}
