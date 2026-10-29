import type { ApiActionName } from "@hall/api-contract";
import { requireAction } from "../security/authorization.js";

/** Guards a route by its action: PostgreSQL decides with the roles, the contact and the meeting of the request. */
export function requireActionPermission(action: ApiActionName) {
  return requireAction(action);
}
