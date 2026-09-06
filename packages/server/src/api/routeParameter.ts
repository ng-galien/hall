import { DomainError } from "../services/errors.js";

export function routeParameter(value: unknown): string {
  if (typeof value !== "string") throw new DomainError("invalid_request", 400);
  return value;
}
