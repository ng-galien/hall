import type { ApiActionName, ApiPrincipal } from "@hall/api-contract";
import type { NextFunction, Request, Response } from "express";
import { apiCommandPolicies } from "./apiCommandPolicy.js";
import { sendProblem } from "./problemDetails.js";

export function actionIsPermitted(principal: ApiPrincipal | undefined, action: ApiActionName): boolean {
  const permissions = apiCommandPolicies[action].permissions;
  return permissions.length === 0 || permissions.some((permission) => principal?.permissions.includes(permission));
}

export function requireActionPermission(action: ApiActionName) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.principal) {
      sendProblem(request, response, 401, "authentication_required");
      return;
    }
    if (!actionIsPermitted(request.principal, action)) {
      sendProblem(request, response, 403, "permission_denied");
      return;
    }
    next();
  };
}
