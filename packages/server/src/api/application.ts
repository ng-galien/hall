import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AwilixContainer } from "awilix";
import express from "express";
import type { Cradle } from "../core/container.js";
import {
  auditApiRequest,
  enforceSameOrigin,
  loadAuthentication,
  persistFailedAudit,
  prepareAudit,
  requestContextMiddleware,
  requireAuthentication,
} from "./accessControl.js";
import { errorHandler } from "./errorHandler.js";
import { sendProblem } from "./problemDetails.js";
import { createAuditRouter } from "./routes/auditRoutes.js";
import { createAuthRouter, createUsersRouter } from "./routes/authRoutes.js";
import { createContactsRouter } from "./routes/contactsRoutes.js";
import { createContentTemplatesRouter } from "./routes/contentTemplatesRoutes.js";
import { createCouncilBusinessRouter } from "./routes/councilBusinessRoutes.js";
import { createCouncilCommitteesRouter } from "./routes/councilCommitteesRoutes.js";
import { createCouncilDecisionsRouter } from "./routes/councilDecisionsRoutes.js";
import { createCouncilMeetingsRouter } from "./routes/councilMeetingsRoutes.js";
import { createCouncilMembersRouter } from "./routes/councilMembersRoutes.js";
import { createDocumentaryResourcesRouter } from "./routes/documentaryResourcesRoutes.js";
import { createSettingsRouter } from "./routes/settingsRoutes.js";
import { apiRootRepresentation, sirenResponses } from "./sirenRepresentation.js";

export const API_JSON_BODY_LIMIT_BYTES = 12 * 1024 * 1024;

export function createHttpApplication(container: AwilixContainer<Cradle>) {
  const app = express();
  const { authService, config, requestContext, securityRepository } = container.cradle;

  if (config.behindTlsProxy) app.set("trust proxy", 1);
  app.get("/api/health", (_request, response) => response.json({ status: "ok" }));
  app.use(
    "/api",
    requestContextMiddleware(requestContext),
    loadAuthentication(authService, requestContext, config),
    sirenResponses,
    auditApiRequest,
    prepareAudit(requestContext),
    persistFailedAudit(requestContext, securityRepository),
    enforceSameOrigin(config),
    express.json({ limit: API_JSON_BODY_LIMIT_BYTES }),
    prepareAudit(requestContext),
  );
  app.use("/api/auth", createAuthRouter(container.cradle));
  app.get("/api", (request, response) => response.json(apiRootRepresentation(request)));
  app.use("/api", requireAuthentication);
  app.use("/api/users", createUsersRouter(container.cradle));
  app.use("/api/audit-events", createAuditRouter(container.cradle));
  app.use("/api/contacts", createContactsRouter(container.cradle));
  app.use("/api/council-members", createCouncilMembersRouter(container.cradle));
  app.use("/api/council-committees", createCouncilCommitteesRouter(container.cradle));
  app.use("/api/council-meetings", createCouncilMeetingsRouter(container.cradle));
  app.use("/api/council-decisions", createCouncilDecisionsRouter(container.cradle));
  if (config.database.kind === "postgres") {
    app.use("/api/resources", createDocumentaryResourcesRouter(container.cradle));
  }
  app.use("/api/council-business", createCouncilBusinessRouter(container.cradle));
  app.use("/api/settings", createSettingsRouter(container.cradle));
  app.use("/api/templates", createContentTemplatesRouter(container.cradle));
  app.use("/api", (request, response) => sendProblem(request, response, 404, "route_not_found"));

  if (config.clientDirectory && existsSync(join(config.clientDirectory, "index.html"))) {
    app.use("/app", express.static(config.clientDirectory));
    app.get("/app/{*path}", (_request, response) => response.sendFile(join(config.clientDirectory!, "index.html")));
    app.get("/", (_request, response) => response.redirect("/app/"));
  }

  app.use(errorHandler);
  return app;
}
