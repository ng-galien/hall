import { createBallotResultPreviewSchema } from "@hall/api-contract";
import { Router } from "express";
import { z } from "zod";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { routeParameter } from "../routeParameter.js";

export function createBallotPreviewsRouter({ councilBallotService }: Cradle): Router {
  const router = Router();
  router.post("/", requireActionPermission("ballot.preview"), async (request, response) => {
    response.status(201).json(await councilBallotService.preview(createBallotResultPreviewSchema.parse(request.body)));
  });
  router.get("/:previewId", requirePermission("meetings.read"), async (request, response) => {
    response.json(await councilBallotService.getPreview(routeParameter(request.params.previewId)));
  });
  router.post("/:previewId/confirm", requireActionPermission("ballot.confirm"), async (request, response) => {
    z.object({}).strict().parse(request.body);
    response.json(await councilBallotService.confirmPreview(routeParameter(request.params.previewId)));
  });
  return router;
}
