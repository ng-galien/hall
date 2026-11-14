import type { ApiPrincipal } from "@hall/api-contract";
import type { AuthorizationClient, AuthorizationTarget } from "../security/authorization.js";

declare global {
  namespace Express {
    interface Request {
      principal?: ApiPrincipal;
      sessionId?: string;
      requestId: string;
      authorization?: AuthorizationClient;
      authorizationTarget?: AuthorizationTarget;
      allowedActions?: ReadonlySet<string>;
      /** Roles the caller may give or withdraw, offered by the account creation and role change actions. */
      assignableRoles?: ReadonlyArray<{ value: string; title: string }>;
    }
  }
}
