import type { PostgresAuthorization } from "@hall/postgres";
import type { AuthorizationClient } from "../../security/authorization.js";
import type { RequestContextStore } from "../../security/requestContext.js";

// @implements-requirement HALL-FR-DOC-350
/** The server keeps no role matrix: it pushes the roles and the linked contact and asks PostgreSQL. */
export function createPostgresAuthorizationClient({
  postgresAuthorization,
  requestContext,
}: {
  postgresAuthorization: PostgresAuthorization;
  requestContext: RequestContextStore;
}): AuthorizationClient {
  const request = () => {
    const context = requestContext.current();
    if (!context?.principal) throw new Error("An authenticated request context is required for authorization");
    return {
      role: "hall_api_authenticated" as const,
      context: {
        requestId: context.requestId,
        actorId: context.principal.id,
        contactId: context.principal.contactId,
        roles: context.principal.roles,
      },
    };
  };
  return {
    allows: (action, target = null) => postgresAuthorization.allows(request(), action, target),
    allowedActions: async (target = null) => new Set(await postgresAuthorization.allowedActions(request(), target)),
  };
}
