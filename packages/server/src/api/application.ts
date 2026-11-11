import { existsSync } from "node:fs";
import { join } from "node:path";
import { handleWorkspaceMcp, WorkspaceClient } from "@hall/mcp";
import type { AwilixContainer } from "awilix";
import express from "express";
import type { Cradle } from "../core/container.js";
import { publishWorkspaceChanges } from "../realtime/workspaceChanges.js";
import { SESSION_COOKIE_NAME } from "../services/authService.js";
import {
  auditApiRequest,
  cookieValue,
  enforceRequestHost,
  enforceSameOrigin,
  loadAuthentication,
  loadAuthorization,
  persistFailedAudit,
  prepareAudit,
  requestContextMiddleware,
  requireAuthentication,
  requirePasswordReplacement,
} from "./accessControl.js";
import { errorHandler } from "./errorHandler.js";
import { sendProblem } from "./problemDetails.js";
import { requireApplicationReading } from "./readAuthorization.js";
import { createAuditRouter } from "./routes/auditRoutes.js";
import { createAuthRouter, createUsersRouter } from "./routes/authRoutes.js";
import { createBallotPreviewsRouter } from "./routes/ballotPreviewsRoutes.js";
import { createBallotsRouter } from "./routes/ballotsRoutes.js";
import { createContactsRouter } from "./routes/contactsRoutes.js";
import { createContentTemplatesRouter } from "./routes/contentTemplatesRoutes.js";
import { createCouncilBusinessRouter } from "./routes/councilBusinessRoutes.js";
import { createCouncilCommitteesRouter } from "./routes/councilCommitteesRoutes.js";
import { createCouncilDecisionsRouter } from "./routes/councilDecisionsRoutes.js";
import { createCouncilDelegationsRouter } from "./routes/councilDelegationsRoutes.js";
import { createCouncilMeetingsRouter } from "./routes/councilMeetingsRoutes.js";
import { createCouncilMembersRouter } from "./routes/councilMembersRoutes.js";
import { createCouncilTermsRouter } from "./routes/councilTermsRoutes.js";
import { createDocumentaryResourcesRouter } from "./routes/documentaryResourcesRoutes.js";
import { createDocumentationRouter } from "./routes/documentationRoutes.js";
import { createGeographicLayersRouter } from "./routes/geographicLayersRoutes.js";
import { createMailGroupsRouter, createMailRouter } from "./routes/mailRoutes.js";
import { createMeetingNoticesRouter } from "./routes/meetingNoticesRoutes.js";
import { createMinutesRouter } from "./routes/minutesRoutes.js";
import { createRolesRouter } from "./routes/rolesRoutes.js";
import { createSettingsRouter } from "./routes/settingsRoutes.js";
import { apiRootRepresentation, sirenResponses } from "./sirenRepresentation.js";

export const API_JSON_BODY_LIMIT_BYTES = 12 * 1024 * 1024;

export function createHttpApplication(container: AwilixContainer<Cradle>) {
  const app = express();
  const { authService, config, requestContext, securityRepository } = container.cradle;

  app.disable("x-powered-by");
  app.use(enforceRequestHost(config));
  app.use((_request, response, next) => {
    response.set("X-Content-Type-Options", "nosniff");
    response.set("Referrer-Policy", "same-origin");
    response.set("Content-Security-Policy", "object-src 'self' blob:; base-uri 'self'; frame-ancestors 'self'");
    next();
  });
  if (config.behindTlsProxy) app.set("trust proxy", 1);
  app.get("/api/health", async (_request, response) => {
    try {
      await container.cradle.postgresClient.health();
      response.json({ status: "ok", version: config.version ?? "unidentified" });
    } catch {
      response.status(503).json({ status: "unavailable", version: config.version ?? "unidentified" });
    }
  });
  app.all(
    "/mcp",
    requestContextMiddleware(requestContext),
    loadAuthentication(authService, requestContext, config),
    requirePasswordReplacement,
    requireAuthentication,
    enforceSameOrigin(config),
    express.json({ limit: 36 * 1024 * 1024 }),
    async (request, response) => {
      const address = request.socket.localAddress ?? "127.0.0.1";
      const hostname = address.includes(":") ? `[${address}]` : address;
      await handleWorkspaceMcp(
        request,
        response,
        request.body,
        new WorkspaceClient(
          `http://${hostname}:${request.socket.localPort}`,
          cookieValue(request, SESSION_COOKIE_NAME) ?? undefined,
          true,
        ),
      );
    },
  );
  app.use(
    "/api",
    requestContextMiddleware(requestContext),
    loadAuthentication(authService, requestContext, config),
    loadAuthorization(container.cradle.authorizationClient),
    sirenResponses,
    auditApiRequest,
    prepareAudit(requestContext),
    persistFailedAudit(requestContext, securityRepository),
    requirePasswordReplacement,
    enforceSameOrigin(config),
    express.json({ limit: API_JSON_BODY_LIMIT_BYTES }),
    prepareAudit(requestContext),
  );
  app.use("/api/auth", createAuthRouter(container.cradle));
  app.get("/api", (request, response) => response.json(apiRootRepresentation(request)));
  app.use("/api", requireAuthentication);
  app.use("/api/roles", createRolesRouter(container.cradle));
  app.use("/api/users", createUsersRouter(container.cradle));
  app.use("/api/audit-events", createAuditRouter(container.cradle));
  app.use("/api", requireApplicationReading);
  app.use(["/api/council-business", "/api/resources"], publishWorkspaceChanges(container.cradle));
  app.use("/api/ballot-previews", createBallotPreviewsRouter(container.cradle));
  app.use("/api/ballots", createBallotsRouter(container.cradle));
  app.use("/api/mail", createMailRouter(container.cradle));
  app.use("/api/mail-recipient-groups", createMailGroupsRouter(container.cradle));
  app.use("/api/contacts", createContactsRouter(container.cradle));
  app.use("/api/council-members", createCouncilMembersRouter(container.cradle));
  app.use("/api/council-terms", createCouncilTermsRouter(container.cradle));
  app.use("/api/council-delegations", createCouncilDelegationsRouter(container.cradle));
  app.use("/api/council-committees", createCouncilCommitteesRouter(container.cradle));
  app.use("/api/council-business", createCouncilBusinessRouter(container.cradle));
  app.use("/api/council-meetings", createCouncilMeetingsRouter(container.cradle));
  app.use("/api/meeting-notices", createMeetingNoticesRouter(container.cradle));
  app.use("/api/minutes", createMinutesRouter(container.cradle));
  app.use("/api/council-decisions", createCouncilDecisionsRouter(container.cradle));
  app.use("/api/resources", createGeographicLayersRouter(container.cradle));
  app.use("/api/resources", createDocumentaryResourcesRouter(container.cradle));
  app.use("/api/templates", createContentTemplatesRouter(container.cradle));
  app.use("/api/settings", createSettingsRouter(container.cradle));
  app.use("/api/documentation", createDocumentationRouter(container.cradle));
  app.use("/api", (request, response) => sendProblem(request, response, 404, "route_not_found"));

  if (config.clientDirectory && existsSync(join(config.clientDirectory, "index.html"))) {
    app.use("/app", express.static(config.clientDirectory));
    app.get("/app/{*path}", (_request, response) => response.sendFile("index.html", { root: config.clientDirectory! }));
    app.get("/", (_request, response) => response.redirect("/app/"));
  }

  app.use(errorHandler);
  return app;
}
