import { confirmBallotResultPreviewSchema, createBallotResultPreviewSchema } from "@hall/api-contract";
import { type Request, Router } from "express";
import type { Cradle } from "../../core/container.js";
import { loadRequestAuthorization } from "../../security/authorization.js";
import { DomainError } from "../../services/errors.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { routeParameter } from "../routeParameter.js";

// @implements-requirement HALL-FR-MTG-320
// @implements-requirement HALL-FR-USR-030
/** A ballot is recorded by the officers in office of the meeting of its agenda item. */
export function createBallotPreviewsRouter({ councilBallotService, councilClient, realtimeEvents }: Cradle): Router {
  const router = Router();
  const authorizeForAgendaItem = async (request: Request, agendaItemId: string) => {
    const item = await councilClient.openAgendaItem(agendaItemId);
    if (item) await loadRequestAuthorization(request, { meetingId: item.councilMeetingId });
  };
  router.use(async (request, _response, next) => {
    const agendaItemId = request.method === "POST" && request.path === "/" ? request.body?.agendaItemId : null;
    if (typeof agendaItemId === "string") await authorizeForAgendaItem(request, agendaItemId);
    next();
  });
  router.param("previewId", async (request, _response, next, previewId: string) => {
    const preview = await councilBallotService.getPreview(previewId).catch(() => null);
    if (preview) await authorizeForAgendaItem(request, preview.agendaItemId);
    next();
  });
  router.post("/", requireActionPermission("ballot.preview"), async (request, response) => {
    response.status(201).json(await councilBallotService.preview(createBallotResultPreviewSchema.parse(request.body)));
  });
  router.get("/:previewId", async (request, response) => {
    response.json(await councilBallotService.getPreview(routeParameter(request.params.previewId)));
  });
  router.post("/:previewId/confirm", requireActionPermission("ballot.confirm"), async (request, response) => {
    // @implements-requirement HALL-FR-MTG-370
    confirmBallotResultPreviewSchema.parse(request.body);
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
