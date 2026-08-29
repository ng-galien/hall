import { randomUUID } from "node:crypto";
import { apiPermissions } from "@hall/api-contract";
import type { NextFunction, Request, Response } from "express";
import type { ServerConfig } from "../core/config.js";
import { logger } from "../core/logger.js";
import type { SecurityRepository } from "../repositories/securityRepository.js";
import type { RequestContextStore } from "../security/requestContext.js";
import type { AuthService } from "../services/authService.js";
import { principalForSession, SESSION_COOKIE_NAME } from "../services/authService.js";
import { sendProblem } from "./problemDetails.js";

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.header("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      try {
        return decodeURIComponent(rawValue.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function requestContextMiddleware(requestContext: RequestContextStore) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const requestId = request.header("x-request-id") ?? randomUUID();
    request.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    requestContext.run({ requestId }, next);
  };
}

export function loadAuthentication(
  authService: AuthService,
  requestContext: RequestContextStore,
  config: ServerConfig,
) {
  return async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    if (config.devAutoLogin) {
      request.principal = {
        id: "development",
        displayName: "Development administrator",
        roles: ["administrator"],
        permissions: [...apiPermissions],
        councilMemberId: null,
      };
      requestContext.setPrincipal(request.principal);
      next();
      return;
    }
    const token = cookieValue(request, SESSION_COOKIE_NAME);
    if (!token) {
      next();
      return;
    }
    const session = await authService.authenticate(token);
    if (session) {
      request.principal = principalForSession(session);
      request.sessionId = session.sessionId;
      requestContext.setPrincipal(request.principal);
    }
    next();
  };
}

export function requireAuthentication(request: Request, response: Response, next: NextFunction): void {
  if (!request.principal) {
    sendProblem(request, response, 401, "authentication_required");
    return;
  }
  next();
}

function auditIntentFor(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return null;
  const path = request.path.replace(/^\/api\/?/, "");
  const segments = path.split("/").filter(Boolean);
  const [root, id, child, childId, operation] = segments;
  const targetType = root ?? "api";
  const targetId =
    id && !["texts", "documents", "editor-assets", "bootstrap", "login", "logout"].includes(id) ? id : null;

  if (root === "council-meetings") {
    if (!id) return { action: "meeting.create", targetType: "council-meeting" };
    if (!child) return { action: "meeting.update", targetType: "council-meeting", targetId: id };
    if (child === "status") {
      const actionByStatus: Record<string, string> = {
        scheduled: "meeting.schedule",
        inProgress: "meeting.open",
        closed: "meeting.close",
        cancelled: "meeting.cancel",
      };
      return {
        action: actionByStatus[String(request.body?.status)] ?? "meeting.change-status",
        targetType: "council-meeting",
        targetId: id,
      };
    }
    if (child === "agenda-items") {
      return {
        action:
          operation === "start"
            ? "agenda-item.start"
            : operation === "complete"
              ? "agenda-item.complete"
              : operation === "notes"
                ? "agenda-item.save-notes"
                : "agenda-item.remove",
        targetType: "agenda-item",
        targetId: childId,
      };
    }
    if (child === "ballots") {
      return {
        action: request.method === "DELETE" ? "ballot.cancel" : "ballot.record",
        targetType: "ballot",
        targetId: childId ?? null,
      };
    }
    if (child === "late-business") {
      return { action: "meeting.add-late-business", targetType: "council-meeting", targetId: id };
    }
    if (child === "attendance") {
      return {
        action: "meeting.record-attendance",
        targetType: "council-meeting",
        targetId: id,
        details: request.body
          ? {
              memberId: request.body.memberId,
              status: request.body.status,
              proxyHolderMemberId: request.body.proxyHolderMemberId ?? null,
              proxyDocumentId: request.body.proxyDocumentId ?? null,
              expectedVersion: request.body.expectedVersion ?? null,
            }
          : undefined,
      };
    }
    const meetingActions: Record<string, string> = {
      officers: "meeting.set-officers",
      attendance: "meeting.record-attendance",
      "agenda-order": "meeting.reorder-agenda",
      "quorum-failure": "meeting.record-quorum-failure",
      reconvene: "meeting.reconvene",
      minutes: "meeting.finalize-minutes",
    };
    return { action: meetingActions[child] ?? `meeting.${child}`, targetType: "council-meeting", targetId: id };
  }
  if (root === "council-business") {
    const action = !id
      ? "council-business.create"
      : child === "classification"
        ? "council-business.reclassify"
        : child === "schedule"
          ? "council-business.schedule"
          : child === "decision"
            ? request.method === "DELETE"
              ? "council-business.detach-decision"
              : "council-business.attach-decision"
            : "council-business.update";
    return { action, targetType: "council-business", targetId };
  }
  if (root === "council-committees") {
    const action = !id
      ? "committee.create"
      : child === "archive"
        ? "committee.archive"
        : child === "memberships"
          ? operation === "end"
            ? "committee.end-membership"
            : childId
              ? "committee.update-membership"
              : "committee.add-membership"
          : "committee.update";
    return {
      action,
      targetType: childId ? "committee-membership" : "council-committee",
      targetId: childId ?? targetId,
    };
  }
  if (root === "resources") {
    const action =
      id === "texts"
        ? "resource.create-text"
        : id === "documents"
          ? "resource.create-document"
          : id === "editor-assets"
            ? "resource.create-editor-asset"
            : child === "promote"
              ? "resource.promote-editor-asset"
              : request.method === "DELETE"
                ? "resource.delete"
                : "resource.update";
    return { action, targetType: "resource", targetId };
  }
  if (root === "users") {
    const action = !id ? "user.create" : child === "roles" ? "user.assign-role" : "user.disable";
    const details =
      !id && Array.isArray(request.body?.roles)
        ? { roles: request.body.roles, councilMemberId: request.body.councilMemberId ?? null }
        : child === "roles" && Array.isArray(request.body?.roles)
          ? { roles: request.body.roles }
          : undefined;
    return {
      action,
      targetType: "user",
      targetId,
      details,
    };
  }
  if (root === "settings") return { action: "settings.update", targetType: "hall-settings", targetId: "hall" };
  if (root === "templates") {
    if (id === "preview-pdf") return null;
    const action =
      id === "preview"
        ? "template.preview"
        : child === "generate"
          ? "template.generate"
          : !id
            ? "template.create"
            : request.method === "DELETE"
              ? "template.delete"
              : "template.update";
    return { action, targetType: "template", targetId: id && id !== "preview" ? id : null };
  }
  if (root === "auth") return { action: `session.${id ?? "unknown"}`, targetType: "session" };
  if (root === "council-members") {
    return { action: id ? "member.update" : "member.create", targetType: "council-member", targetId };
  }
  if (root === "council-decisions") {
    return { action: id ? "decision.update" : "decision.create", targetType: "council-decision", targetId };
  }
  return { action: `${request.method.toLowerCase()}.${path}`, targetType, targetId };
}

export function prepareAudit(requestContext: RequestContextStore) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const intent = auditIntentFor(request);
    if (intent) requestContext.setAudit(intent);
    next();
  };
}

export function auditApiRequest(request: Request, response: Response, next: NextFunction): void {
  response.once("finish", () => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      logger.info(
        {
          requestId: request.requestId,
          actorUserId: request.principal?.id ?? null,
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
        },
        "API change",
      );
    }
  });
  next();
}

export function enforceSameOrigin(config: ServerConfig) {
  const allowedOrigins = new Set(config.allowedOrigins ?? []);
  return (request: Request, response: Response, next: NextFunction): void => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      next();
      return;
    }
    const origin = request.header("origin");
    const fetchSite = request.header("sec-fetch-site");
    const expectedOrigin = `${request.protocol}://${request.get("host")}`;
    if ((origin && origin !== expectedOrigin && !allowedOrigins.has(origin)) || fetchSite === "cross-site") {
      sendProblem(request, response, 403, "csrf_validation_failed");
      return;
    }
    next();
  };
}

export function persistFailedAudit(requestContext: RequestContextStore, securityRepository: SecurityRepository) {
  return (_request: Request, response: Response, next: NextFunction): void => {
    const context = requestContext.current();
    response.once("finish", () => {
      if (!context?.audit || context.auditRecorded || response.statusCode < 400) return;
      context.auditRecorded = true;
      const outcome = [401, 403, 429].includes(response.statusCode) ? "denied" : "failed";
      void securityRepository
        .recordAuditEvent({
          actorUserId: context.principal?.id ?? null,
          requestId: context.requestId,
          action: context.audit.action,
          targetType: context.audit.targetType,
          targetId: context.audit.targetId ?? null,
          outcome,
          details: {
            ...context.audit.details,
            statusCode: response.statusCode,
            actor: context.principal ? { id: context.principal.id, displayName: context.principal.displayName } : null,
          },
        })
        .catch((error) => logger.error({ requestId: context.requestId, error }, "Failed to persist audit outcome"));
    });
    next();
  };
}
