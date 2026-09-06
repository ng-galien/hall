import { completeBallotSchema, createBallotSchema, recordBallotVotesSchema } from "@hall/api-contract";
import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { routeParameter } from "../routeParameter.js";

export function createBallotsRouter({ councilBallotService }: Cradle): Router {
  const router = Router();

  router.get("/", requirePermission("meetings.read"), async (request, response) => {
    const meetingId = routeParameter(request.query.meetingId);
    response.json(await councilBallotService.listForMeeting(meetingId));
  });

  router.post("/", requireActionPermission("ballot.create"), async (request, response) => {
    response.status(201).json(await councilBallotService.create(createBallotSchema.parse(request.body)));
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

  router.post("/:ballotId/votes", requireActionPermission("ballot.record-votes"), async (request, response) => {
    response
      .status(201)
      .json(
        await councilBallotService.recordVotes(
          routeParameter(request.params.ballotId),
          recordBallotVotesSchema.parse(request.body),
        ),
      );
  });

  router.post("/:ballotId/complete", requireActionPermission("ballot.complete"), async (request, response) => {
    response.json(
      await councilBallotService.complete(
        routeParameter(request.params.ballotId),
        completeBallotSchema.parse(request.body),
      ),
    );
  });

  return router;
}
