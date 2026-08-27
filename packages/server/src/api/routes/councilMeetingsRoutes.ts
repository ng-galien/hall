import {
  completeAgendaItemSchema,
  createCouncilMeetingSchema,
  reconveneCouncilMeetingSchema,
  recordAttendanceSchema,
  recordBallotSchema,
  reorderAgendaSchema,
  saveAgendaItemNotesSchema,
  setMeetingOfficersSchema,
  updateCouncilMeetingSchema,
  updateMeetingStatusSchema,
} from "@mairie/domain";
import { Router } from "express";
import type { Cradle } from "../../core/container.js";

export function createCouncilMeetingsRouter({
  councilMeetingService,
  meetingLifecycleService,
  meetingPreparationService,
  meetingAgendaService,
  ballotService,
}: Cradle): Router {
  const router = Router();

  router.get("/", async (_request, response) => response.json(await councilMeetingService.listMeetings()));
  router.post("/", async (request, response) => {
    response
      .status(201)
      .json(await councilMeetingService.createMeeting(createCouncilMeetingSchema.parse(request.body)));
  });
  router.get("/:meetingId", async (request, response) => {
    response.json(await councilMeetingService.getMeeting(request.params.meetingId));
  });
  router.put("/:meetingId", async (request, response) => {
    response.json(
      await councilMeetingService.updateMeeting(
        request.params.meetingId,
        updateCouncilMeetingSchema.parse(request.body),
      ),
    );
  });
  router.put("/:meetingId/status", async (request, response) => {
    const { status } = updateMeetingStatusSchema.parse(request.body);
    response.json(await meetingLifecycleService.changeStatus(request.params.meetingId, status));
  });
  router.put("/:meetingId/officers", async (request, response) => {
    const officers = setMeetingOfficersSchema.parse(request.body);
    response.json(
      await meetingPreparationService.setOfficers(
        request.params.meetingId,
        officers.chairMemberId,
        officers.secretaryMemberId,
      ),
    );
  });
  router.post("/:meetingId/quorum-failure", async (request, response) => {
    response.status(201).json(await meetingLifecycleService.recordQuorumFailure(request.params.meetingId));
  });
  router.post("/:meetingId/reconvene", async (request, response) => {
    response
      .status(201)
      .json(
        await meetingLifecycleService.reconveneMeeting(
          request.params.meetingId,
          reconveneCouncilMeetingSchema.parse(request.body),
        ),
      );
  });
  router.put("/:meetingId/attendance", async (request, response) => {
    response.json(
      await meetingPreparationService.recordAttendance(
        request.params.meetingId,
        recordAttendanceSchema.parse(request.body),
      ),
    );
  });
  router.delete("/:meetingId/agenda-items/:itemId", async (request, response) => {
    await meetingPreparationService.removeAgendaItem(request.params.meetingId, request.params.itemId);
    response.status(204).end();
  });
  router.put("/:meetingId/agenda-order", async (request, response) => {
    const { itemIds } = reorderAgendaSchema.parse(request.body);
    await meetingPreparationService.reorderAgenda(request.params.meetingId, itemIds);
    response.status(204).end();
  });
  router.post("/:meetingId/agenda-items/:itemId/start", async (request, response) => {
    response.json(await meetingAgendaService.startItem(request.params.meetingId, request.params.itemId));
  });
  router.put("/:meetingId/agenda-items/:itemId/notes", async (request, response) => {
    const { discussionSummary } = saveAgendaItemNotesSchema.parse(request.body);
    response.json(
      await meetingAgendaService.saveNotes(request.params.meetingId, request.params.itemId, discussionSummary),
    );
  });
  router.post("/:meetingId/agenda-items/:itemId/complete", async (request, response) => {
    response.json(
      await meetingAgendaService.completeItem(
        request.params.meetingId,
        request.params.itemId,
        completeAgendaItemSchema.parse(request.body),
      ),
    );
  });
  router.delete("/:meetingId/ballots/:ballotId", async (request, response) => {
    await ballotService.cancelBallot(request.params.meetingId, request.params.ballotId);
    response.status(204).end();
  });
  router.post("/:meetingId/ballots", async (request, response) => {
    response
      .status(201)
      .json(await ballotService.recordBallot(request.params.meetingId, recordBallotSchema.parse(request.body)));
  });
  return router;
}
