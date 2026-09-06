import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { routeParameter } from "../routeParameter.js";

export function createBallotsRouter({ councilBallotService }: Cradle): Router {
  const router = Router();

  router.get("/", requirePermission("meetings.read"), async (request, response) => {
    const meetingId = routeParameter(request.query.meetingId);
    response.json(await councilBallotService.listForMeeting(meetingId));
  });

  router.get("/:ballotId", requirePermission("meetings.read"), async (request, response) => {
    response.json(await councilBallotService.get(routeParameter(request.params.ballotId)));
  });

  router.get("/:ballotId/participations", requirePermission("meetings.read"), async (request, response) => {
    response.json(await councilBallotService.listParticipations(routeParameter(request.params.ballotId)));
  });

  router.get("/:ballotId/votes", requirePermission("meetings.read"), async (request, response) => {
    response.json(await councilBallotService.listVotes(routeParameter(request.params.ballotId)));
  });

  return router;
}
