import { timingSafeEqual } from "node:crypto";
import {
  assignUserRolesSchema,
  bootstrapUserSchema,
  changePasswordSchema,
  createUserSchema,
  loginSchema,
  resetPasswordSchema,
  SIREN_MEDIA_TYPE,
  type SirenEntity,
  updateUserSchema,
} from "@hall/api-contract";
import { type Request, Router } from "express";
import { isLoopbackHost } from "../../core/config.js";
import type { Cradle } from "../../core/container.js";
import { hasPermission, requirePermission } from "../../security/authorization.js";
import { principalForSession, SESSION_COOKIE_NAME } from "../../services/authService.js";
import { DomainError } from "../../services/errors.js";
import { requireAuthentication } from "../accessControl.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { routeParameter } from "../routeParameter.js";

const sessionMaxAgeSeconds = 12 * 60 * 60;

function cookie(token: string, secure: boolean): string {
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${sessionMaxAgeSeconds}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function clearedCookie(secure: boolean): string {
  return [`${SESSION_COOKIE_NAME}=`, "HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=0", secure ? "Secure" : ""]
    .filter(Boolean)
    .join("; ");
}

export function createAuthRouter({ authService, config }: Cradle): Router {
  const router = Router();
  type Attempt = { failures: number; expiresAt: number; blockedUntil: number };
  const ipAttempts = new Map<string, Attempt>();
  const accountAttempts = new Map<string, Attempt>();
  const loginWindowMs = 15 * 60 * 1000;
  const accountLimit = 5;
  const ipLimit = 20;
  const maximumTrackedKeys = 10_000;
  let loginQueue = Promise.resolve();

  const serializeLogin = async <T>(operation: () => Promise<T>): Promise<T> => {
    const previous = loginQueue;
    let release!: () => void;
    loginQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  };

  const prune = (attempts: Map<string, Attempt>, now: number) => {
    for (const [key, attempt] of attempts) {
      if (attempt.expiresAt <= now) attempts.delete(key);
    }
    while (attempts.size >= maximumTrackedKeys) {
      const oldest = attempts.keys().next().value;
      if (oldest === undefined) break;
      attempts.delete(oldest);
    }
  };

  const rejectIfBlocked = (attempts: Map<string, Attempt>, key: string, now: number) => {
    prune(attempts, now);
    if ((attempts.get(key)?.blockedUntil ?? 0) > now) throw new DomainError("too_many_login_attempts", 429);
  };

  const recordFailure = (attempts: Map<string, Attempt>, key: string, limit: number, now: number) => {
    prune(attempts, now);
    const previous = attempts.get(key);
    const failures = previous && previous.expiresAt > now ? previous.failures + 1 : 1;
    attempts.delete(key);
    attempts.set(key, {
      failures,
      expiresAt: now + loginWindowMs,
      blockedUntil: failures >= limit ? now + loginWindowMs : 0,
    });
    return failures >= limit;
  };

  const accountKey = (email: string) => email.trim().toLowerCase();
  const requestIp = (request: Request) => request.ip ?? request.socket.remoteAddress ?? "unknown";
  const bootstrapAllowed = isLoopbackHost(config.host) || Boolean(config.bootstrapToken);
  const validBootstrapToken = (value: unknown) => {
    if (isLoopbackHost(config.host)) return true;
    if (typeof value !== "string" || !config.bootstrapToken) return false;
    const received = Buffer.from(value);
    const expected = Buffer.from(config.bootstrapToken);
    return received.length === expected.length && timingSafeEqual(received, expected);
  };

  router.get("/status", async (_request, response) => {
    const developmentAccess = config.devAutoLogin === true;
    const bootstrapRequired = developmentAccess ? false : await authService.bootstrapRequired();
    const representation: SirenEntity<{
      bootstrapRequired: boolean;
      bootstrapAllowed: boolean;
      bootstrapTokenRequired: boolean;
      developmentAccess: boolean;
    }> = {
      class: ["authentication-status"],
      properties: {
        bootstrapRequired,
        bootstrapAllowed,
        bootstrapTokenRequired: !isLoopbackHost(config.host),
        developmentAccess,
      },
      actions: developmentAccess
        ? []
        : bootstrapRequired && !bootstrapAllowed
          ? []
          : [
              bootstrapRequired
                ? {
                    name: "session.bootstrap",
                    title: "Create the first administrator",
                    method: "POST",
                    href: "/api/auth/bootstrap",
                    type: "application/json",
                    fields: isLoopbackHost(config.host) ? undefined : [{ name: "setupToken", type: "password" }],
                  }
                : {
                    name: "session.login",
                    title: "Sign in",
                    method: "POST",
                    href: "/api/auth/login",
                    type: "application/json",
                  },
            ],
      links: [{ rel: ["self"], href: "/api/auth/status", type: SIREN_MEDIA_TYPE }],
    };
    response.json(representation);
  });

  router.post("/bootstrap", async (request, response) => {
    if (!bootstrapAllowed || !validBootstrapToken(request.body?.setupToken)) {
      throw new DomainError("permission_denied", 403);
    }
    const now = Date.now();
    const ip = requestIp(request);
    rejectIfBlocked(ipAttempts, ip, now);
    const input = bootstrapUserSchema.parse(request.body);
    try {
      await authService.bootstrap(input);
    } catch (error) {
      if (recordFailure(ipAttempts, ip, ipLimit, now)) {
        throw new DomainError("too_many_login_attempts", 429);
      }
      throw error;
    }
    ipAttempts.delete(ip);
    const result = await authService.login(input.email, input.password);
    request.principal = principalForSession(result.session);
    request.sessionId = result.session.sessionId;
    response.setHeader("Set-Cookie", cookie(result.token, config.behindTlsProxy === true));
    response.status(201).json(result.session.user);
  });

  router.post("/login", async (request, response) => {
    const input = loginSchema.parse(request.body);
    const result = await serializeLogin(async () => {
      const now = Date.now();
      const emailKey = accountKey(input.email);
      const ip = requestIp(request);
      rejectIfBlocked(ipAttempts, ip, now);
      rejectIfBlocked(accountAttempts, emailKey, now);
      try {
        const authenticated = await authService.login(input.email, input.password);
        accountAttempts.delete(emailKey);
        return authenticated;
      } catch (error) {
        if (error instanceof DomainError && error.code === "invalid_credentials") {
          const accountBlocked = recordFailure(accountAttempts, emailKey, accountLimit, now);
          const ipBlocked = recordFailure(ipAttempts, ip, ipLimit, now);
          if (accountBlocked || ipBlocked) throw new DomainError("too_many_login_attempts", 429);
        }
        throw error;
      }
    });
    request.principal = principalForSession(result.session);
    request.sessionId = result.session.sessionId;
    response.setHeader("Set-Cookie", cookie(result.token, config.behindTlsProxy === true));
    response.json(result.session.user);
  });

  router.post("/logout", requireAuthentication, async (request, response) => {
    if (!request.sessionId) throw new DomainError("authentication_required", 401);
    await authService.logout(request.sessionId);
    response.setHeader("Set-Cookie", clearedCookie(config.behindTlsProxy === true));
    response.status(204).end();
  });

  router.post("/change-password", requireActionPermission("session.change-password"), async (request, response) => {
    if (!request.sessionId || !request.principal) throw new DomainError("authentication_required", 401);
    const { currentPassword, newPassword } = changePasswordSchema.parse(request.body);
    await authService.changePassword(request.principal.id, currentPassword, newPassword);
    response.setHeader("Set-Cookie", clearedCookie(config.behindTlsProxy === true));
    response.status(204).end();
  });

  router.get("/session", requireAuthentication, async (request, response) => {
    response.json(request.principal);
  });

  return router;
}

export function createUsersRouter({ authService }: Cradle): Router {
  const router = Router();
  router.get("/:userId", requireAuthentication, async (request, response) => {
    const userId = routeParameter(request.params.userId);
    if (request.principal?.id !== userId && !hasPermission(request.principal, "users.manage")) {
      throw new DomainError("permission_denied", 403);
    }
    response.json(await authService.getUser(userId));
  });
  router.get("/", requirePermission("users.manage"), async (_request, response) =>
    response.json(await authService.listUsers()),
  );
  router.post("/", requireActionPermission("user.create"), async (request, response) => {
    response.status(201).json(await authService.createUser(createUserSchema.parse(request.body)));
  });
  router.put("/:userId", requireActionPermission("user.update"), async (request, response) => {
    response.json(
      await authService.updateUser(routeParameter(request.params.userId), updateUserSchema.parse(request.body)),
    );
  });
  router.post("/:userId/reset-password", requireActionPermission("user.reset-password"), async (request, response) => {
    const { newPassword } = resetPasswordSchema.parse(request.body);
    await authService.resetPassword(routeParameter(request.params.userId), newPassword);
    response.status(204).end();
  });
  router.put("/:userId/roles", requireActionPermission("user.assign-role"), async (request, response) => {
    const { roles } = assignUserRolesSchema.parse(request.body);
    response.json(await authService.assignRoles(routeParameter(request.params.userId), roles));
  });
  router.post("/:userId/disable", requireActionPermission("user.disable"), async (request, response) => {
    response.json(await authService.disableUser(routeParameter(request.params.userId)));
  });
  return router;
}
