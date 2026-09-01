import { randomUUID } from "node:crypto";
import { apiPermissions } from "@hall/api-contract";
import type { NextFunction, Request, Response } from "express";
import type { ServerConfig } from "../core/config.js";
import { logger } from "../core/logger.js";
import type { SecurityRepository } from "../repositories/securityRepository.js";
import type { RequestContextStore } from "../security/requestContext.js";
import type { AuthService } from "../services/authService.js";
import { principalForSession, SESSION_COOKIE_NAME } from "../services/authService.js";
import { resolveAuditIntent } from "./apiCommandResolution.js";
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

export function prepareAudit(requestContext: RequestContextStore) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const intent = resolveAuditIntent(request);
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
