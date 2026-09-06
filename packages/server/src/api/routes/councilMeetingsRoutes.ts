import {
  type AgendaItem,
  adjournAgendaItemSchema,
  type CouncilMeeting,
  closeCouncilMeetingSchema,
  completeOpenQuestionSchema,
  createAndScheduleCouncilBusinessSchema,
  prepareCouncilMeetingSchema,
  provisionInitialCouncilMeetingSchema,
  recordAgendaItemRecusalSchema,
  recordMeetingAttendanceEventsSchema,
  recordMeetingAttendanceSchema,
  recordMeetingMembershipSchema,
  recordMeetingQuorumSchema,
  recordMeetingReconvocationSchema,
  reorderCouncilAgendaSchema,
  reprogramAgendaItemSchema,
  scheduleAgendaItemSchema,
  scheduleCouncilMeetingSchema,
  setCouncilMeetingOfficersSchema,
  startAgendaItemSchema,
  startCouncilMeetingSchema,
  updateAgendaItemNotesSchema,
} from "@hall/api-contract";
import { Router } from "express";
import type { CouncilClient } from "../../clients/councilClient.js";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { DomainError } from "../../services/errors.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { routeParameter } from "../routeParameter.js";

async function requireMeeting(councilClient: CouncilClient, reference: string): Promise<CouncilMeeting> {
  const meeting = await councilClient.openMeeting(reference);
  if (!meeting) throw new DomainError("meeting_not_found", 404);
  return meeting;
}

async function requireMeetingAgendaItem(
  councilClient: CouncilClient,
  meeting: CouncilMeeting,
  agendaItemId: string,
): Promise<AgendaItem> {
  const agendaItem = await councilClient.openAgendaItem(agendaItemId);
  if (!agendaItem || agendaItem.councilMeetingId !== meeting.id) {
    throw new DomainError("agenda_item_not_found", 404);
  }
  return agendaItem;
}

export function createCouncilMeetingsRouter({ councilClient }: Cradle): Router {
  const router = Router();

  router.get("/", requirePermission("meetings.read"), async (_request, response) => {
    const meetings = await councilClient.listMeetings();
    response.locals.councilMeetingProvisioningAvailable = meetings.length === 0;
    response.json(meetings);
  });

  router.post("/", requireActionPermission("meeting.provision-initial"), async (request, response) => {
    response
      .status(201)
      .json(await councilClient.provisionInitialMeeting(provisionInitialCouncilMeetingSchema.parse(request.body)));
  });

  router.get("/:meetingReference", requirePermission("meetings.read"), async (request, response) => {
    response.json(await requireMeeting(councilClient, routeParameter(request.params.meetingReference)));
  });

  router.get("/:meetingReference/conduct", requirePermission("meetings.read"), async (request, response) => {
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    response.json(await councilClient.meetingConduct(meeting.id));
  });
  router.post(
    "/:meetingReference/membership-records",
    requireActionPermission("meeting.record-membership"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response
        .status(201)
        .json(
          await councilClient.recordMeetingMembership(meeting.id, recordMeetingMembershipSchema.parse(request.body)),
        );
    },
  );
  router.post(
    "/:meetingReference/attendance-events",
    requireActionPermission("meeting.record-attendance-events"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response
        .status(201)
        .json(
          await councilClient.recordMeetingAttendanceEvents(
            meeting.id,
            recordMeetingAttendanceEventsSchema.parse(request.body),
          ),
        );
    },
  );
  router.post(
    "/:meetingReference/quorum-observations",
    requireActionPermission("meeting.record-quorum"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response
        .status(201)
        .json(await councilClient.recordMeetingQuorum(meeting.id, recordMeetingQuorumSchema.parse(request.body)));
    },
  );
  router.post(
    "/:meetingReference/reconvocations",
    requireActionPermission("meeting.record-reconvocation"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response
        .status(201)
        .json(
          await councilClient.recordMeetingReconvocation(
            meeting.id,
            recordMeetingReconvocationSchema.parse(request.body),
          ),
        );
    },
  );
  router.put("/:meetingReference/schedule", requireActionPermission("meeting.schedule"), async (request, response) => {
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    response.json(await councilClient.scheduleMeeting(meeting.id, scheduleCouncilMeetingSchema.parse(request.body)));
  });

  router.put(
    "/:meetingReference/officers",
    requireActionPermission("meeting.set-officers"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response.json(
        await councilClient.setMeetingOfficers(meeting.id, setCouncilMeetingOfficersSchema.parse(request.body)),
      );
    },
  );

  router.put("/:meetingReference/prepare", requireActionPermission("meeting.prepare"), async (request, response) => {
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    response.json(await councilClient.prepareMeeting(meeting.id, prepareCouncilMeetingSchema.parse(request.body)));
  });

  router.post(
    "/:meetingReference/council-business",
    requireActionPermission("meeting.create-and-schedule-business"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response
        .status(201)
        .json(
          await councilClient.createAndScheduleBusiness(
            meeting.id,
            createAndScheduleCouncilBusinessSchema.parse(request.body),
          ),
        );
    },
  );

  router.post("/:meetingReference/start", requireActionPermission("meeting.start"), async (request, response) => {
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    response.json(await councilClient.startMeeting(meeting.id, startCouncilMeetingSchema.parse(request.body)));
  });

  router.post("/:meetingReference/close", requireActionPermission("meeting.close"), async (request, response) => {
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    response.json(await councilClient.closeMeeting(meeting.id, closeCouncilMeetingSchema.parse(request.body)));
  });

  router.get("/:meetingReference/attendance", requirePermission("meetings.read"), async (request, response) => {
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    response.locals.currentCouncilMeeting = meeting;
    response.json(await councilClient.listAttendance(meeting.id));
  });

  router.post(
    "/:meetingReference/attendance",
    requireActionPermission("meeting.record-attendance"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response
        .status(201)
        .json(await councilClient.recordAttendance(meeting.id, recordMeetingAttendanceSchema.parse(request.body)));
    },
  );

  router.get(
    "/:meetingReference/attendance/:councilMemberId",
    requirePermission("meetings.read"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      const councilMemberId = routeParameter(request.params.councilMemberId);
      const attendance = (await councilClient.listAttendance(meeting.id)).find(
        (item) => item.councilMemberId === councilMemberId,
      );
      if (!attendance) throw new DomainError("attendance_not_found", 404);
      response.locals.currentCouncilMeeting = meeting;
      response.json(attendance);
    },
  );

  router.get("/:meetingReference/agenda-items", requirePermission("meetings.read"), async (request, response) => {
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    const agendaItems = await councilClient.listAgenda(meeting.id);
    response.locals.currentCouncilMeeting = meeting;
    response.locals.currentCouncilAgenda = agendaItems;
    response.json(agendaItems);
  });

  router.post(
    "/:meetingReference/agenda-items",
    requireActionPermission("agenda-item.schedule"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response
        .status(201)
        .json(await councilClient.scheduleAgendaItem(meeting.id, scheduleAgendaItemSchema.parse(request.body)));
    },
  );

  router.get(
    "/:meetingReference/agenda-items/:agendaItemId",
    requirePermission("meetings.read"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      const agendaItem = await requireMeetingAgendaItem(
        councilClient,
        meeting,
        routeParameter(request.params.agendaItemId),
      );
      response.locals.currentCouncilMeeting = meeting;
      response.locals.currentCouncilAgenda = await councilClient.listAgenda(meeting.id);
      response.json(agendaItem);
    },
  );

  router.get(
    "/:meetingReference/agenda-items/:agendaItemId/recusals",
    requirePermission("meetings.read"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      const item = await requireMeetingAgendaItem(councilClient, meeting, routeParameter(request.params.agendaItemId));
      response.locals.currentCouncilMeeting = meeting;
      response.json(await councilClient.agendaItemRecusals(item.id));
    },
  );
  router.post(
    "/:meetingReference/agenda-items/:agendaItemId/recusals",
    requireActionPermission("agenda-item.record-recusal"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      const item = await requireMeetingAgendaItem(councilClient, meeting, routeParameter(request.params.agendaItemId));
      response.locals.currentCouncilMeeting = meeting;
      response
        .status(201)
        .json(await councilClient.recordAgendaItemRecusal(item.id, recordAgendaItemRecusalSchema.parse(request.body)));
    },
  );

  router.post(
    "/:meetingReference/agenda-items/:agendaItemId/adjourn",
    requireActionPermission("agenda-item.adjourn"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      const item = await requireMeetingAgendaItem(councilClient, meeting, routeParameter(request.params.agendaItemId));
      response.json(await councilClient.adjournAgendaItem(item.id, adjournAgendaItemSchema.parse(request.body)));
    },
  );

  router.delete(
    "/:meetingReference/agenda-items/:agendaItemId",
    requireActionPermission("agenda-item.deprogram"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      const agendaItem = await requireMeetingAgendaItem(
        councilClient,
        meeting,
        routeParameter(request.params.agendaItemId),
      );
      response.json(await councilClient.deprogramAgendaItem(agendaItem.id));
    },
  );

  router.post(
    "/:meetingReference/agenda-items/:agendaItemId/reprogram",
    requireActionPermission("agenda-item.reprogram"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      const agendaItem = await requireMeetingAgendaItem(
        councilClient,
        meeting,
        routeParameter(request.params.agendaItemId),
      );
      response.json(
        await councilClient.reprogramAgendaItem(agendaItem.id, reprogramAgendaItemSchema.parse(request.body)),
      );
    },
  );

  router.put(
    "/:meetingReference/agenda-order",
    requireActionPermission("meeting.reorder-agenda"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response.json(await councilClient.reorderAgenda(meeting.id, reorderCouncilAgendaSchema.parse(request.body)));
    },
  );

  router.post(
    "/:meetingReference/agenda-items/:agendaItemId/start",
    requireActionPermission("agenda-item.start"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      const agendaItem = await requireMeetingAgendaItem(
        councilClient,
        meeting,
        routeParameter(request.params.agendaItemId),
      );
      response.locals.currentCouncilMeeting = meeting;
      response.json(await councilClient.startAgendaItem(agendaItem.id, startAgendaItemSchema.parse(request.body)));
    },
  );

  router.post(
    "/:meetingReference/agenda-items/:agendaItemId/complete",
    requireActionPermission("agenda-item.complete"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      const agendaItem = await requireMeetingAgendaItem(
        councilClient,
        meeting,
        routeParameter(request.params.agendaItemId),
      );
      response.json(
        await councilClient.completeOpenQuestion(agendaItem.id, completeOpenQuestionSchema.parse(request.body)),
      );
    },
  );

  router.patch(
    "/:meetingReference/agenda-items/:agendaItemId/notes",
    requireActionPermission("agenda-item.update-notes"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      const agendaItem = await requireMeetingAgendaItem(
        councilClient,
        meeting,
        routeParameter(request.params.agendaItemId),
      );
      response.locals.currentCouncilMeeting = meeting;
      response.json(
        await councilClient.updateAgendaItemNotes(agendaItem.id, updateAgendaItemNotesSchema.parse(request.body)),
      );
    },
  );

  return router;
}
