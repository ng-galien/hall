export type DiscriminatedHandlers<T, D extends keyof T> = {
  [K in Extract<T[D], PropertyKey>]: (value: Extract<T, Record<D, K>>) => unknown;
};

type HandlerResult<H> = H[keyof H] extends (...arguments_: never[]) => infer R ? R : never;

/**
 * Exhaustive fold for a discriminated union. The correlation cast is isolated
 * here because TypeScript cannot connect the indexed handler with the narrowed
 * union member in generic code.
 */
export function matchDiscriminated<
  D extends PropertyKey,
  T extends Record<D, PropertyKey>,
  H extends DiscriminatedHandlers<T, D>,
>(value: T, discriminator: D, handlers: H): HandlerResult<H> {
  const key = value[discriminator] as Extract<T[D], PropertyKey>;
  const handler = handlers[key] as (matched: never) => HandlerResult<H>;
  return handler(value as never);
}

export type LiteralHandlers<T extends PropertyKey> = {
  [K in T]: () => unknown;
};

/** Exhaustive fold for a closed string, number or symbol union. */
export function matchLiteral<T extends PropertyKey, H extends LiteralHandlers<T>>(
  value: T,
  handlers: H,
): HandlerResult<H> {
  return handlers[value]() as HandlerResult<H>;
}

export type NestedDiscriminatedHandlers<T, P extends keyof T, D extends keyof T[P]> = {
  [K in Extract<T[P][D], PropertyKey>]: (value: Extract<T, Record<P, Record<D, K>>>) => unknown;
};

/** Exhaustive fold when a domain union exposes its discriminator through a nested profile. */
export function matchVariant<
  T,
  P extends keyof T,
  D extends keyof T[P],
  H extends NestedDiscriminatedHandlers<T, P, D>,
>(value: T, profile: P, discriminator: D, handlers: H): HandlerResult<H> {
  const key = value[profile][discriminator] as Extract<T[P][D], PropertyKey>;
  const handler = handlers[key] as (matched: never) => HandlerResult<H>;
  return handler(value as never);
}

/** Declares a runtime list that must contain every member of a closed literal union. */
export function defineExhaustiveLiterals<T extends PropertyKey>() {
  return <const Values extends readonly T[]>(
    values: Values & ([T] extends [Values[number]] ? unknown : { missing: Exclude<T, Values[number]> }),
  ): Values => values;
}
