import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { LIVE_ORIGIN_HEADER, liveOriginSchema } from "@hall/api-contract";
import type { NextFunction, Request, Response } from "express";
import { isLoopbackHost, type ServerConfig } from "../core/config.js";
import { logger } from "../core/logger.js";
import type { SecurityRepository } from "../repositories/securityRepository.js";
import { type AuthorizationClient, loadRequestAuthorization } from "../security/authorization.js";
import type { RequestContextStore } from "../security/requestContext.js";
import type { AuthService } from "../services/authService.js";
import { principalForSession, SESSION_COOKIE_NAME } from "../services/authService.js";
import { resolveAuditIntent } from "./apiCommandResolution.js";
import { sendProblem } from "./problemDetails.js";

export function isForwarded(headers: IncomingHttpHeaders): boolean {
  return Object.keys(headers).some((name) => name === "forwarded" || name.startsWith("x-forwarded-"));
}

export function requestHostAllowed(headers: IncomingHttpHeaders, config: ServerConfig): boolean {
  if (!headers.host) return false;
  let url: URL;
  try {
    url = new URL(`http://${headers.host}`);
  } catch {
    return false;
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return false;
  const local = isLoopbackHost(url.hostname.replace(/^\[|\]$/g, ""));
  if (config.devAutoLogin) return local && !isForwarded(headers) && !config.behindTlsProxy;
  if (!isLoopbackHost(config.host)) return true;
  return local || (config.allowedOrigins ?? []).some((origin) => new URL(origin).host === url.host);
}

export function enforceRequestHost(config: ServerConfig) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!requestHostAllowed(request.headers, config)) {
      sendProblem(request, response, 403, "permission_denied");
      return;
    }
    next();
  };
}

export function cookieValue(request: Request, name: string): string | null {
  return cookieValueFromHeader(request.header("cookie"), name);
}

export function cookieValueFromHeader(cookie: string | undefined, name: string): string | null {
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
    const requestId = randomUUID();
    request.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    const liveOrigin = liveOriginSchema.safeParse(request.header(LIVE_ORIGIN_HEADER));
    requestContext.run({ requestId, liveOrigin: liveOrigin.success ? liveOrigin.data : undefined }, next);
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
        contactId: null,
        passwordChangeRequired: false,
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

/** Gives the request the database authorization and loads the actions its account may take. */
export function loadAuthorization(authorizationClient: AuthorizationClient) {
  return async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    request.authorization = authorizationClient;
    await loadRequestAuthorization(request);
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

// @implements-requirement HALL-FR-USR-070
export function requirePasswordReplacement(request: Request, response: Response, next: NextFunction): void {
  const allowed = new Set([
    "GET /api/auth/status",
    "GET /api/auth/session",
    "POST /api/auth/change-password",
    "POST /api/auth/logout",
    "POST /api/auth/password-links",
    "POST /api/auth/password-links/open",
    "POST /api/auth/password-links/complete",
  ]);
  const path = request.originalUrl.split("?", 1)[0]?.replace(/\/+$/, "");
  if (request.principal?.passwordChangeRequired && !allowed.has(`${request.method} ${path}`)) {
    sendProblem(request, response, 403, "password_change_required");
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

/**
 * Logs every API change and every failed API read. A refusal carries its problem code and, for a
 * database error, its SQLSTATE; request bodies are never logged.
 */
// @implements-requirement HALL-TR-DST-050
export function auditApiRequest(request: Request, response: Response, next: NextFunction): void {
  response.once("finish", () => {
    const change = request.method !== "GET" && request.method !== "HEAD";
    if (!change && response.statusCode < 500) return;
    const problemCode: unknown = response.locals.problemCode;
    const sqlState: unknown = response.locals.sqlState;
    logger.info(
      {
        requestId: request.requestId,
        actorUserId: request.principal?.id ?? null,
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        ...(typeof problemCode === "string" ? { problemCode } : {}),
        ...(typeof sqlState === "string" ? { sqlState } : {}),
      },
      change ? "API change" : "API read failed",
    );
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
