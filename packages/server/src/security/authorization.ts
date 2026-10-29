import type { ApiActionName, ApiPrincipal, ApiUser } from "@hall/api-contract";
import type { NextFunction, Request, Response } from "express";
import { sendProblem } from "../api/problemDetails.js";

/** The API actions and the two reserved readings that the role matrix of the database rules. */
export type AuthorizedAction = ApiActionName | "user.list" | "audit-event.list";
/** The object an action applies to, when a condition of the role matrix depends on it. */
export type AuthorizationTarget = Readonly<{ meetingId?: string; location?: string }>;

export interface AuthorizationClient {
  allows(action: AuthorizedAction, target?: AuthorizationTarget | null): Promise<boolean>;
  allowedActions(target?: AuthorizationTarget | null): Promise<ReadonlySet<string>>;
}

export function principalForUser(user: ApiUser): ApiPrincipal {
  return { id: user.id, displayName: user.displayName, roles: user.roles, contactId: user.contactId };
}

/** Loads the actions the caller may take, for the meeting of the request when it has one. */
export async function loadRequestAuthorization(request: Request, target?: AuthorizationTarget): Promise<void> {
  if (!request.principal || !request.authorization) return;
  request.authorizationTarget = target;
  request.allowedActions = await request.authorization.allowedActions(target ?? null);
}

/** Whether the actions loaded for the request include this one; Siren projections offer only those. */
export function canExecute(request: Request, action: AuthorizedAction): boolean {
  return request.allowedActions?.has(action) ?? false;
}

export function requireAction(action: AuthorizedAction) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    if (!request.principal) {
      sendProblem(request, response, 401, "authentication_required");
      return;
    }
    if (!request.authorization || !(await request.authorization.allows(action, request.authorizationTarget ?? null))) {
      sendProblem(request, response, 403, "permission_denied");
      return;
    }
    next();
  };
}
