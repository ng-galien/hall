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
    }
  }
}
