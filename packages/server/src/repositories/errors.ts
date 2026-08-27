export type PersistenceErrorCode = "conflict";

export class PersistenceError extends Error {
  constructor(
    readonly code: PersistenceErrorCode,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "PersistenceError";
  }
}
