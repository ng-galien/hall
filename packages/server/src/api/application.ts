import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AwilixContainer } from "awilix";
import express from "express";
import type { Cradle } from "../core/container.js";
import { auditApiRequest, authenticateApi } from "./accessControl.js";
import { errorHandler } from "./errorHandler.js";
import { createCouncilDecisionsRouter } from "./routes/councilDecisionsRoutes.js";
import { createCouncilMeetingsRouter } from "./routes/councilMeetingsRoutes.js";
import { createCouncilMembersRouter } from "./routes/councilMembersRoutes.js";
import { createResourcesRouter } from "./routes/resourcesRoutes.js";
import { createTopicsRouter } from "./routes/topicsRoutes.js";

export function createHttpApplication(container: AwilixContainer<Cradle>) {
  const app = express();
  const { config } = container.cradle;

  app.use(express.json({ limit: "2mb" }));
  app.get("/api/health", (_request, response) => response.json({ status: "ok" }));
  app.use("/api", authenticateApi(config.apiToken), auditApiRequest);
  app.use("/api/council-members", createCouncilMembersRouter(container.cradle));
  app.use("/api/council-meetings", createCouncilMeetingsRouter(container.cradle));
  app.use("/api/council-decisions", createCouncilDecisionsRouter(container.cradle));
  app.use("/api/resources", createResourcesRouter(container.cradle));
  app.use("/api/topics", createTopicsRouter(container.cradle));

  if (config.clientDirectory && existsSync(join(config.clientDirectory, "index.html"))) {
    app.use("/app", express.static(config.clientDirectory));
    app.get("/app/{*path}", (_request, response) => response.sendFile(join(config.clientDirectory!, "index.html")));
    app.get("/", (_request, response) => response.redirect("/app/"));
  }

  app.use(errorHandler);
  return app;
}
