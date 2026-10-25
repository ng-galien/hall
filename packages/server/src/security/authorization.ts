import { type ApiPermission, type ApiPrincipal, type ApiRole, type ApiUser, apiPermissions } from "@hall/api-contract";
import type { NextFunction, Request, Response } from "express";
import { sendProblem } from "../api/problemDetails.js";

const rolePermissions: Record<ApiRole, readonly ApiPermission[]> = {
  administrator: apiPermissions,
  clerk: [
    "contacts.read",
    "contacts.manage",
    "members.manage",
    "workspace.read",
    "workspace.write",
    "personal-workspaces.manage",
    "council-business.update",
    "meetings.read",
    "meetings.prepare",
  ],
  contributor: ["contacts.read", "workspace.read", "workspace.write", "council-business.update", "meetings.read"],
  meetingConductor: ["contacts.read", "workspace.read", "meetings.read", "meetings.conduct"],
  reader: ["contacts.read", "workspace.read", "meetings.read"],
  // @implements-requirement HALL-FR-WSP-390
  // @implements-requirement HALL-FR-WSP-400
  councillor: ["contacts.read", "workspace.read", "personal-workspace.write", "meetings.read"],
};

export function permissionsForRoles(roles: readonly ApiRole[]): ApiPermission[] {
  const permissions = new Set<ApiPermission>();
  for (const role of roles) {
    for (const permission of rolePermissions[role]) permissions.add(permission);
  }
  return apiPermissions.filter((permission) => permissions.has(permission));
}

export function principalForUser(user: ApiUser): ApiPrincipal {
  return {
    id: user.id,
    displayName: user.displayName,
    roles: user.roles,
    permissions: permissionsForRoles(user.roles),
    contactId: user.contactId,
  };
}

export function hasPermission(principal: ApiPrincipal | undefined, permission: ApiPermission): boolean {
  return principal?.permissions.includes(permission) ?? false;
}

export function requirePermission(permission: ApiPermission) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.principal) {
      sendProblem(request, response, 401, "authentication_required");
      return;
    }
    if (!hasPermission(request.principal, permission)) {
      sendProblem(request, response, 403, "permission_denied");
      return;
    }
    next();
  };
}

export function requireAnyPermission(...permissions: ApiPermission[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.principal) {
      sendProblem(request, response, 401, "authentication_required");
      return;
    }
    if (!permissions.some((permission) => hasPermission(request.principal, permission))) {
      sendProblem(request, response, 403, "permission_denied");
      return;
    }
    next();
  };
}
