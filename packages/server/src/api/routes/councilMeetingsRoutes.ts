import {
  completeAgendaItemSchema,
  createCouncilBusinessSchema,
  createCouncilMeetingSchema,
  reconveneCouncilMeetingSchema,
  recordAttendanceSchema,
  recordBallotSchema,
  reorderAgendaSchema,
  saveAgendaItemNotesSchema,
  setMeetingOfficersSchema,
  updateCouncilMeetingSchema,
  updateMeetingStatusSchema,
} from "@hall/domain";
import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { DomainError } from "../../services/errors.js";
import { actionIsPermitted, requireActionPermission } from "../apiCommandAuthorization.js";
import { meetingStatusAction } from "../apiCommandResolution.js";
import { routeParameter } from "../routeParameter.js";

export function createCouncilMeetingsRouter({
  councilMeetingService,
  meetingLifecycleService,
  meetingPreparationService,
  meetingAgendaService,
  ballotService,
}: Cradle): Router {
  const router = Router();
  const createLateBusinessSchema = createCouncilBusinessSchema.refine(
    (input) => input.kind === "openQuestion" || (input.kind === "matter" && !input.councilDecisionId),
    { message: "Business added during a meeting must be informational" },
  );

  router.get("/", requirePermission("meetings.read"), async (_request, response) =>
    response.json(await councilMeetingService.listMeetings()),
  );
  router.post("/", requireActionPermission("meeting.create"), async (request, response) => {
    response
      .status(201)
      .json(await councilMeetingService.createMeeting(createCouncilMeetingSchema.parse(request.body)));
  });
  router.get("/:meetingId", requirePermission("meetings.read"), async (request, response) => {
    response.json(await councilMeetingService.getMeeting(routeParameter(request.params.meetingId)));
  });
  router.put("/:meetingId", requireActionPermission("meeting.update"), async (request, response) => {
    response.json(
      await councilMeetingService.updateMeeting(
        routeParameter(request.params.meetingId),
        updateCouncilMeetingSchema.parse(request.body),
      ),
    );
  });
  router.put("/:meetingId/status", requireActionPermission("meeting.change-status"), async (request, response) => {
    const { status } = updateMeetingStatusSchema.parse(request.body);
    if (!actionIsPermitted(request.principal, meetingStatusAction(status))) {
      throw new DomainError("permission_denied", 403);
    }
    response.json(await meetingLifecycleService.changeStatus(routeParameter(request.params.meetingId), status));
  });
  router.put("/:meetingId/officers", requireActionPermission("meeting.set-officers"), async (request, response) => {
    const officers = setMeetingOfficersSchema.parse(request.body);
    response.json(
      await meetingPreparationService.setOfficers(
        routeParameter(request.params.meetingId),
        officers.chairMemberId,
        officers.secretaryMemberId,
      ),
    );
  });
  router.post(
    "/:meetingId/quorum-failure",
    requireActionPermission("meeting.record-quorum-failure"),
    async (request, response) => {
      response
        .status(201)
        .json(await meetingLifecycleService.recordQuorumFailure(routeParameter(request.params.meetingId)));
    },
  );
  router.post("/:meetingId/reconvene", requireActionPermission("meeting.reconvene"), async (request, response) => {
    response
      .status(201)
      .json(
        await meetingLifecycleService.reconveneMeeting(
          routeParameter(request.params.meetingId),
          reconveneCouncilMeetingSchema.parse(request.body),
        ),
      );
  });
  router.post(
    "/:meetingId/minutes/finalize",
    requireActionPermission("meeting.finalize-minutes"),
    async (request, response) => {
      response.json(await meetingLifecycleService.finalizeMinutesDraft(routeParameter(request.params.meetingId)));
    },
  );
  router.put(
    "/:meetingId/attendance",
    requireActionPermission("meeting.record-attendance"),
    async (request, response) => {
      response.json(
        await meetingPreparationService.recordAttendance(
          routeParameter(request.params.meetingId),
          recordAttendanceSchema.parse(request.body),
        ),
      );
    },
  );
  router.post(
    "/:meetingId/late-business",
    requireActionPermission("meeting.add-late-business"),
    async (request, response) => {
      response
        .status(201)
        .json(
          await meetingPreparationService.createLateBusiness(
            routeParameter(request.params.meetingId),
            createLateBusinessSchema.parse(request.body),
          ),
        );
    },
  );
  router.get("/:meetingId/attendance/:memberId", requirePermission("meetings.read"), async (request, response) => {
    const meetingId = routeParameter(request.params.meetingId);
    const memberId = routeParameter(request.params.memberId);
    const attendance = (await councilMeetingService.getMeeting(meetingId)).attendance.find(
      (item) => item.memberId === memberId,
    );
    if (!attendance) throw new DomainError("attendance_not_found", 404);
    response.json(attendance);
  });
  router.get("/:meetingId/agenda-items/:itemId", requirePermission("meetings.read"), async (request, response) => {
    const meetingId = routeParameter(request.params.meetingId);
    const itemId = routeParameter(request.params.itemId);
    const aggregate = await councilMeetingService.getMeeting(meetingId);
    const item = aggregate.agendaItems.find((candidate) => candidate.id === itemId);
    if (!item) throw new DomainError("agenda_item_not_found", 404);
    response.json({ agendaItem: item, meeting: aggregate.meeting, agendaItems: aggregate.agendaItems });
  });
  router.get("/:meetingId/ballots/:ballotId", requirePermission("meetings.read"), async (request, response) => {
    const meetingId = routeParameter(request.params.meetingId);
    const ballotId = routeParameter(request.params.ballotId);
    const aggregate = await councilMeetingService.getMeeting(meetingId);
    const ballot = aggregate.ballots.find((candidate) => candidate.id === ballotId);
    if (!ballot) throw new DomainError("ballot_not_found", 404);
    response.json({ ballot, meeting: aggregate.meeting, agendaItems: aggregate.agendaItems });
  });
  router.delete(
    "/:meetingId/agenda-items/:itemId",
    requireActionPermission("agenda-item.remove"),
    async (request, response) => {
      await meetingPreparationService.removeAgendaItem(
        routeParameter(request.params.meetingId),
        routeParameter(request.params.itemId),
      );
      response.status(204).end();
    },
  );
  router.put(
    "/:meetingId/agenda-order",
    requireActionPermission("meeting.reorder-agenda"),
    async (request, response) => {
      const { itemIds } = reorderAgendaSchema.parse(request.body);
      await meetingPreparationService.reorderAgenda(routeParameter(request.params.meetingId), itemIds);
      response.status(204).end();
    },
  );
  router.post(
    "/:meetingId/agenda-items/:itemId/start",
    requireActionPermission("agenda-item.start"),
    async (request, response) => {
      response.json(
        await meetingAgendaService.startItem(
          routeParameter(request.params.meetingId),
          routeParameter(request.params.itemId),
        ),
      );
    },
  );
  router.put(
    "/:meetingId/agenda-items/:itemId/notes",
    requireActionPermission("agenda-item.save-notes"),
    async (request, response) => {
      const { discussionSummary } = saveAgendaItemNotesSchema.parse(request.body);
      response.json(
        await meetingAgendaService.saveNotes(
          routeParameter(request.params.meetingId),
          routeParameter(request.params.itemId),
          discussionSummary,
        ),
      );
    },
  );
  router.post(
    "/:meetingId/agenda-items/:itemId/complete",
    requireActionPermission("agenda-item.complete"),
    async (request, response) => {
      response.json(
        await meetingAgendaService.completeItem(
          routeParameter(request.params.meetingId),
          routeParameter(request.params.itemId),
          completeAgendaItemSchema.parse(request.body),
        ),
      );
    },
  );
  router.delete(
    "/:meetingId/ballots/:ballotId",
    requireActionPermission("ballot.cancel"),
    async (request, response) => {
      await ballotService.cancelBallot(
        routeParameter(request.params.meetingId),
        routeParameter(request.params.ballotId),
      );
      response.status(204).end();
    },
  );
  router.post("/:meetingId/ballots", requireActionPermission("ballot.record"), async (request, response) => {
    response
      .status(201)
      .json(
        await ballotService.recordBallot(
          routeParameter(request.params.meetingId),
          recordBallotSchema.parse(request.body),
        ),
      );
  });
  return router;
}
