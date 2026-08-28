export type PersistenceErrorCode = "conflict";

export class PersistenceError extends Error {
  readonly constraint?: string;

  constructor(
    readonly code: PersistenceErrorCode,
    options?: ErrorOptions & { constraint?: string },
  ) {
    super(code, options);
    this.name = "PersistenceError";
    this.constraint = options?.constraint;
  }
}
