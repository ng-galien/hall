import { randomUUID } from "node:crypto";
import type { PostgresAuthorization } from "@hall/postgres";
import type { AuthorizationAdministrationClient } from "../../clients/authorizationAdministrationClient.js";
import type { AuthorizationClient, AuthorizeReading } from "../../security/authorization.js";
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
  const request = () => postgresAuthorizationRequest(requestContext);
  return {
    allows: (action, target = null) => postgresAuthorization.allows(request(), action, target),
    allowedActions: async (target = null) => new Set(await postgresAuthorization.allowedActions(request(), target)),
  };
}

export function postgresAuthorizationRequest(requestContext: RequestContextStore) {
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
}

export function createPostgresAuthorizationAdministrationClient({
  postgresAuthorization,
  requestContext,
}: {
  postgresAuthorization: PostgresAuthorization;
  requestContext: RequestContextStore;
}): AuthorizationAdministrationClient {
  const request = () => postgresAuthorizationRequest(requestContext);
  return {
    roleOptions: () => postgresAuthorization.roleOptions(request()),
    configuration: () => postgresAuthorization.configuration(request()),
    saveRole: (id, input) => postgresAuthorization.saveRole(request(), id, input),
    deleteRole: (id, revision) => postgresAuthorization.deleteRole(request(), id, revision),
    requiresPersonalWorkspace: (roles) => postgresAuthorization.requiresPersonalWorkspace(request(), roles),
  };
}

export function createPrincipalReadingAuthorization({
  postgresAuthorization,
}: {
  postgresAuthorization: PostgresAuthorization;
}): AuthorizeReading {
  return (principal) =>
    postgresAuthorization.allows(
      {
        role: "hall_api_authenticated",
        context: {
          requestId: randomUUID(),
          actorId: principal.id,
          contactId: principal.contactId,
          roles: principal.roles,
        },
      },
      "application.read",
    );
}
