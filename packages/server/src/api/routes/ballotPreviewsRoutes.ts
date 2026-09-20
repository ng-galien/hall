import { createBallotResultPreviewSchema } from "@hall/api-contract";
import { Router } from "express";
import { z } from "zod";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { DomainError } from "../../services/errors.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { routeParameter } from "../routeParameter.js";

// @implements-requirement HALL-FR-MTG-320
export function createBallotPreviewsRouter({ councilBallotService, councilClient, realtimeEvents }: Cradle): Router {
  const router = Router();
  router.post("/", requireActionPermission("ballot.preview"), async (request, response) => {
    response.status(201).json(await councilBallotService.preview(createBallotResultPreviewSchema.parse(request.body)));
  });
  router.get("/:previewId", requirePermission("meetings.read"), async (request, response) => {
    response.json(await councilBallotService.getPreview(routeParameter(request.params.previewId)));
  });
  router.post("/:previewId/confirm", requireActionPermission("ballot.confirm"), async (request, response) => {
    z.object({}).strict().parse(request.body);
    const previewId = routeParameter(request.params.previewId);
    const preview = await councilBallotService.getPreview(previewId);
    const item = await councilClient.openAgendaItem(preview.agendaItemId);
    if (!item) throw new DomainError("agenda_item_not_found", 404);
    const ballot = await councilBallotService.confirmPreview(previewId);
    realtimeEvents.publish({ type: "meeting.changed", meetingId: item.councilMeetingId });
    response.json(ballot);
  });
  return router;
}
