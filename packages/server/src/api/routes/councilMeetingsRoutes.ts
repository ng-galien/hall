import {
  type AgendaItem,
  addOpenQuestionSchema,
  adjournAgendaItemSchema,
  type CouncilMeeting,
  closeCouncilMeetingSchema,
  completeAgendaItemSchema,
  correctMeetingAuxiliaryAttendanceSchema,
  createAndScheduleCouncilBusinessSchema,
  declareMeetingAuxiliaryAttendanceSchema,
  prepareCouncilMeetingSchema,
  provisionInitialCouncilMeetingSchema,
  recordAgendaItemRecusalSchema,
  recordMeetingAttendanceEventsSchema,
  recordMeetingAttendanceSchema,
  recordMeetingClosedSessionSchema,
  recordMeetingOfficerChangeSchema,
  recordMeetingOpeningSchema,
  recordMeetingQuorumSchema,
  recordMeetingReconvocationSchema,
  reorderCouncilAgendaSchema,
  reprogramAgendaItemSchema,
  scheduleAgendaItemSchema,
  scheduleCouncilMeetingSchema,
  schedulePreparedCouncilSubjectSchema,
  setCouncilMeetingOfficersSchema,
  startAgendaItemSchema,
  updateAgendaItemNotesSchema,
} from "@hall/api-contract";
import { generateMeetingNoticeMessageSchema } from "@hall/contracts";
import { Router } from "express";
import { z } from "zod";
import type { CouncilClient } from "../../clients/councilClient.js";
import type { Cradle } from "../../core/container.js";
import { loadRequestAuthorization } from "../../security/authorization.js";
import { DomainError } from "../../services/errors.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import {
  meetingDocumentResourceRepresentation,
  meetingDocumentsRepresentation,
} from "../meetingDocumentsRepresentation.js";
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

// TODO REMOVE_STALE: remove this temporary API route and its registration below.
const staleMeetingRoutePath = "/:meetingReference/stale";

// @implements-requirement HALL-FR-MTG-320
// @implements-requirement HALL-FR-USR-030
/** Conduct actions are allowed per meeting: the database checks the officers in office of the meeting of the route. */
export function createCouncilMeetingsRouter({
  councilClient,
  deliberationListService,
  meetingAttendanceDocumentService,
  meetingDossierService,
  meetingNoticeService,
  realtimeEvents,
}: Cradle): Router {
  const router = Router();

  router.param("meetingReference", async (request, _response, next, reference: string) => {
    const meeting = await councilClient.openMeeting(reference);
    if (meeting) await loadRequestAuthorization(request, { meetingId: meeting.id });
    next();
  });

  async function changeMeeting<Result>(meetingId: string, action: () => Promise<Result>): Promise<Result> {
    const result = await action();
    realtimeEvents.publish({ type: "meeting.changed", meetingId });
    return result;
  }

  router.get("/", async (_request, response) => {
    const meetings = await councilClient.listMeetings();
    response.locals.councilMeetingProvisioningAvailable = meetings.length === 0;
    response.json(meetings);
  });

  router.post("/", requireActionPermission("meeting.provision-initial"), async (request, response) => {
    response
      .status(201)
      .json(await councilClient.provisionInitialMeeting(provisionInitialCouncilMeetingSchema.parse(request.body)));
  });

  router.get("/:meetingReference", async (request, response) => {
    response.json(await requireMeeting(councilClient, routeParameter(request.params.meetingReference)));
  });

  router.get("/:meetingReference/documents", async (request, response) => {
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    response.set("Cache-Control", "private, no-store");
    response.json(meetingDocumentsRepresentation(request, meeting, await councilClient.meetingDocuments(meeting.id)));
  });
  router.get("/:meetingReference/documents/resources/:resourceId", async (request, response) => {
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    const document = await councilClient.meetingDocumentResource(meeting.id, z.uuid().parse(request.params.resourceId));
    if (!document) throw new DomainError("resource_not_found", 404);
    response.set("Cache-Control", "private, no-store");
    response.json(meetingDocumentResourceRepresentation(meeting, document));
  });
  router.get(
    [
      "/:meetingReference/documents/resources/:resourceId/content",
      "/:meetingReference/documents/resources/:resourceId/editor-assets/:assetId/content",
    ],
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      const content = await councilClient.meetingDocumentContent(
        meeting.id,
        z.uuid().parse(request.params.resourceId),
        request.params.assetId ? z.uuid().parse(request.params.assetId) : null,
      );
      if (!content) throw new DomainError("resource_not_found", 404);
      response.set("Cache-Control", "private, no-store");
      response.set("Content-Security-Policy", "sandbox");
      response.set("X-Content-Type-Options", "nosniff");
      response.type(content.mediaType).send(content.content);
    },
  );

  router.post(
    "/:meetingReference/agenda-reopening",
    requireActionPermission("meeting.reopen-agenda"),
    async (request, response) => {
      z.object({}).strict().parse(request.body);
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response.json(await councilClient.reopenAgenda(meeting.id));
    },
  );
  router.post(
    "/:meetingReference/agenda-revision-reset",
    requireActionPermission("meeting.reset-agenda-revision"),
    async (request, response) => {
      z.object({}).strict().parse(request.body);
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response.json(await councilClient.resetAgendaRevision(meeting.id));
    },
  );
  router.get("/:meetingReference/agenda-freeze", async (request, response) => {
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    const freeze = await councilClient.openAgendaFreeze(meeting.id);
    if (!freeze) throw new DomainError("agenda_revision_unavailable", 404);
    response.json(freeze);
  });
  router.get("/:meetingReference/deliberation-list.pdf", async (request, response) => {
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    const content = await deliberationListService.content(meeting.id);
    response.set("Content-Disposition", `inline; filename="liste-des-deliberations-${meeting.number}.pdf"`);
    response.set("Cache-Control", "private, no-store");
    response.type("application/pdf").send(content);
  });
  // @implements-requirement HALL-FR-ATT-170
  router.get("/:meetingReference/attendance-sheet.pdf", async (request, response) => {
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    const content = await meetingAttendanceDocumentService.attendanceSheet(meeting.id);
    response.set("Content-Disposition", `inline; filename="feuille-d-emargement-${meeting.number}.pdf"`);
    response.set("Cache-Control", "private, no-store");
    response.type("application/pdf").send(content);
  });
  // @implements-requirement HALL-FR-ATT-180
  router.get("/:meetingReference/proxy-form.pdf", async (request, response) => {
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    const query = z
      .object({ grantorMemberId: z.string().min(1), holderMemberId: z.string().min(1).optional() })
      .strict()
      .parse(request.query);
    const content = await meetingAttendanceDocumentService.proxyForm(
      meeting.id,
      query.grantorMemberId,
      query.holderMemberId ?? null,
    );
    response.set("Content-Disposition", `inline; filename="pouvoir-${meeting.number}.pdf"`);
    response.set("Cache-Control", "private, no-store");
    response.type("application/pdf").send(content);
  });
  router.get("/:meetingReference/notices", async (request, response) => {
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    response.locals.currentCouncilMeeting = meeting;
    response.json(await meetingNoticeService.list(meeting.id));
  });
  router.post(
    "/:meetingReference/notices",
    requireActionPermission("meeting.generate-notice"),
    async (request, response) => {
      z.object({}).strict().parse(request.body);
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response.status(201).json(await meetingNoticeService.generate(meeting.id));
    },
  );

  router.get(
    "/:meetingReference/dossier",
    requireActionPermission("meeting.generate-dossier"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      const dossier = await meetingDossierService.dossier(meeting.id);
      response.set("Content-Disposition", `attachment; filename="${dossier.fileName}"`);
      response.set("Cache-Control", "private, no-store");
      response.type("application/pdf").send(dossier.content);
    },
  );
  router.get(
    "/:meetingReference/notice-message",
    requireActionPermission("meeting.generate-notice-message"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response.json(await meetingNoticeService.messagePreparation(meeting.id));
    },
  );
  router.post(
    "/:meetingReference/notice-message",
    requireActionPermission("meeting.generate-notice-message"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      const { noticeId } = generateMeetingNoticeMessageSchema.parse(request.body);
      const message = await meetingNoticeService.generateMessage(meeting.id, noticeId);
      response.set("Content-Disposition", `attachment; filename="${message.fileName}"`);
      response.set("Cache-Control", "private, no-store");
      response.type(message.mediaType).send(message.content);
    },
  );

  router.post(
    "/:meetingReference/agenda-items/from-prepared",
    requireActionPermission("agenda-item.schedule-prepared"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response.locals.currentCouncilMeeting = meeting;
      response
        .status(201)
        .json(
          await councilClient.schedulePreparedSubject(
            meeting.id,
            schedulePreparedCouncilSubjectSchema.parse(request.body),
          ),
        );
    },
  );

  router.post(
    "/:meetingReference/open-questions",
    requireActionPermission("meeting.add-open-question"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response.locals.currentCouncilMeeting = meeting;
      response
        .status(201)
        .json(
          await changeMeeting(meeting.id, () =>
            councilClient.addOpenQuestion(meeting.id, addOpenQuestionSchema.parse(request.body)),
          ),
        );
    },
  );
  router.get("/:meetingReference/conduct", async (request, response) => {
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    response.json(await councilClient.meetingConduct(meeting.id));
  });
  router.post(
    "/:meetingReference/attendance-events",
    requireActionPermission("meeting.record-attendance-events"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response
        .status(201)
        .json(
          await changeMeeting(meeting.id, () =>
            councilClient.recordMeetingAttendanceEvents(
              meeting.id,
              recordMeetingAttendanceEventsSchema.parse(request.body),
            ),
          ),
        );
    },
  );
  router.post(
    "/:meetingReference/officer-changes",
    requireActionPermission("meeting.record-officer-change"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response
        .status(201)
        .json(
          await changeMeeting(meeting.id, () =>
            councilClient.recordMeetingOfficerChange(meeting.id, recordMeetingOfficerChangeSchema.parse(request.body)),
          ),
        );
    },
  );
  router.post(
    "/:meetingReference/auxiliary-attendances",
    requireActionPermission("meeting.declare-auxiliary-attendance"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response
        .status(201)
        .json(
          await changeMeeting(meeting.id, () =>
            councilClient.declareMeetingAuxiliaryAttendance(
              meeting.id,
              declareMeetingAuxiliaryAttendanceSchema.parse(request.body),
            ),
          ),
        );
    },
  );
  router.post(
    "/:meetingReference/closed-sessions",
    requireActionPermission("meeting.record-closed-session"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response
        .status(201)
        .json(
          await changeMeeting(meeting.id, () =>
            councilClient.recordMeetingClosedSession(meeting.id, recordMeetingClosedSessionSchema.parse(request.body)),
          ),
        );
    },
  );
  router.patch(
    "/:meetingReference/auxiliary-attendances",
    requireActionPermission("meeting.correct-auxiliary-attendance"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response.json(
        await changeMeeting(meeting.id, () =>
          councilClient.correctMeetingAuxiliaryAttendance(
            meeting.id,
            correctMeetingAuxiliaryAttendanceSchema.parse(request.body),
          ),
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
        .json(
          await changeMeeting(meeting.id, () =>
            councilClient.recordMeetingQuorum(meeting.id, recordMeetingQuorumSchema.parse(request.body)),
          ),
        );
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
          await changeMeeting(meeting.id, () =>
            councilClient.recordMeetingReconvocation(meeting.id, recordMeetingReconvocationSchema.parse(request.body)),
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

  router.post(
    "/:meetingReference/record-opening",
    requireActionPermission("meeting.record-opening"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      response.json(
        await changeMeeting(meeting.id, () =>
          councilClient.recordMeetingOpening(meeting.id, recordMeetingOpeningSchema.parse(request.body)),
        ),
      );
    },
  );

  router.post(staleMeetingRoutePath, requireActionPermission("meeting.mark-stale"), async (request, response) => {
    z.object({}).strict().parse(request.body);
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    response.json(await councilClient.markMeetingStale(meeting.id));
  });

  router.post("/:meetingReference/close", requireActionPermission("meeting.close"), async (request, response) => {
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    // @implements-requirement HALL-FR-MTG-370
    // The body carries no instant: the server dates the closure at reception.
    closeCouncilMeetingSchema.parse(request.body);
    response.json(await changeMeeting(meeting.id, () => councilClient.closeMeeting(meeting.id)));
  });

  router.get("/:meetingReference/attendance", async (request, response) => {
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
        .json(
          await changeMeeting(meeting.id, () =>
            councilClient.recordAttendance(meeting.id, recordMeetingAttendanceSchema.parse(request.body)),
          ),
        );
    },
  );

  router.get("/:meetingReference/attendance/:councilMemberId", async (request, response) => {
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    const councilMemberId = routeParameter(request.params.councilMemberId);
    const attendance = (await councilClient.listAttendance(meeting.id)).find(
      (item) => item.councilMemberId === councilMemberId,
    );
    if (!attendance) throw new DomainError("attendance_not_found", 404);
    response.locals.currentCouncilMeeting = meeting;
    response.json(attendance);
  });

  router.get("/:meetingReference/agenda-items", async (request, response) => {
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

  router.get("/:meetingReference/agenda-items/:agendaItemId", async (request, response) => {
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    const agendaItem = await requireMeetingAgendaItem(
      councilClient,
      meeting,
      routeParameter(request.params.agendaItemId),
    );
    response.locals.currentCouncilMeeting = meeting;
    response.locals.currentCouncilAgenda = await councilClient.listAgenda(meeting.id);
    response.json(agendaItem);
  });

  router.get("/:meetingReference/agenda-items/:agendaItemId/recusals", async (request, response) => {
    const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
    const item = await requireMeetingAgendaItem(councilClient, meeting, routeParameter(request.params.agendaItemId));
    response.locals.currentCouncilMeeting = meeting;
    response.json(await councilClient.agendaItemRecusals(item.id));
  });
  router.post(
    "/:meetingReference/agenda-items/:agendaItemId/recusals",
    requireActionPermission("agenda-item.record-recusal"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      const item = await requireMeetingAgendaItem(councilClient, meeting, routeParameter(request.params.agendaItemId));
      response.locals.currentCouncilMeeting = meeting;
      response
        .status(201)
        .json(
          await changeMeeting(meeting.id, () =>
            councilClient.recordAgendaItemRecusal(item.id, recordAgendaItemRecusalSchema.parse(request.body)),
          ),
        );
    },
  );

  router.post(
    "/:meetingReference/agenda-items/:agendaItemId/adjourn",
    requireActionPermission("agenda-item.adjourn"),
    async (request, response) => {
      const meeting = await requireMeeting(councilClient, routeParameter(request.params.meetingReference));
      const item = await requireMeetingAgendaItem(councilClient, meeting, routeParameter(request.params.agendaItemId));
      adjournAgendaItemSchema.parse(request.body);
      response.json(await changeMeeting(meeting.id, () => councilClient.adjournAgendaItem(item.id)));
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
      startAgendaItemSchema.parse(request.body);
      response.json(await changeMeeting(meeting.id, () => councilClient.startAgendaItem(agendaItem.id)));
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
      completeAgendaItemSchema.parse(request.body);
      response.json(await changeMeeting(meeting.id, () => councilClient.completeAgendaItem(agendaItem.id)));
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
        await changeMeeting(meeting.id, () =>
          councilClient.updateAgendaItemNotes(agendaItem.id, updateAgendaItemNotesSchema.parse(request.body)),
        ),
      );
    },
  );

  return router;
}
