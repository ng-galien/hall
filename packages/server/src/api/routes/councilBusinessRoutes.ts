import {
  associateCouncilBusinessResourceSchema,
  councilBusinessAgendaHistoryQuerySchema,
  createCouncilBusinessSchema,
  createPreparedCouncilSubjectSchema,
  dissociateCouncilBusinessResourceSchema,
  preparedCouncilSubjectKindSchema,
  reorderCouncilBusinessResourcesSchema,
  scheduleCouncilBusinessSubjectSchema,
} from "@hall/api-contract";
import { Router } from "express";
import { z } from "zod";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { DomainError } from "../../services/errors.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { routeParameter } from "../routeParameter.js";

export function createCouncilBusinessRouter({ councilBusinessWorkspaceService, councilClient }: Cradle): Router {
  const router = Router();

  router.get("/prepared-subjects", requirePermission("workspace.read"), async (request, response) => {
    const meetingId = z.string().uuid().optional().parse(request.query.councilMeetingId);
    response.json(await councilClient.listPreparedSubjects(meetingId));
  });
  router.get("/prepared-subjects/:kind/:id", requirePermission("workspace.read"), async (request, response) => {
    const kind = preparedCouncilSubjectKindSchema.parse(request.params.kind);
    const subject = await councilClient.openPreparedSubject(routeParameter(request.params.id), kind);
    if (!subject) throw new DomainError("prepared_subject_not_found", 404);
    response.json(subject);
  });
  router.post(
    "/:businessId/prepared-subjects",
    requireActionPermission("council-business.create-prepared-subject"),
    async (request, response) => {
      response
        .status(201)
        .json(
          await councilClient.createPreparedSubject(
            routeParameter(request.params.businessId),
            createPreparedCouncilSubjectSchema.parse(request.body),
          ),
        );
    },
  );

  router.get("/", requirePermission("workspace.read"), async (_request, response) => {
    const businesses = await councilBusinessWorkspaceService.list();
    response.locals.currentCouncilBusinessAgendaItems =
      businesses.length === 0
        ? []
        : await councilBusinessWorkspaceService.listAgendaItems(businesses.map(({ id }) => id));
    response.json(businesses);
  });

  router.get("/workspace-items", requirePermission("workspace.read"), async (_request, response) => {
    response.json(await councilBusinessWorkspaceService.listWorkspaceItems());
  });

  router.get("/resource-items", requirePermission("workspace.read"), async (request, response) => {
    const rawIds = request.query.councilBusinessId;
    const councilBusinessIds = Array.isArray(rawIds) ? rawIds : rawIds === undefined ? [] : [rawIds];
    const query = councilBusinessAgendaHistoryQuerySchema.parse({ councilBusinessIds });
    response.json(await councilBusinessWorkspaceService.listResourceItems(query.councilBusinessIds));
  });

  router.post("/", requireActionPermission("council-business.create"), async (request, response) => {
    const created = await councilBusinessWorkspaceService.create(createCouncilBusinessSchema.parse(request.body));
    response.status(201).json(created);
  });

  router.get("/agenda-items", requirePermission("meetings.read"), async (request, response) => {
    const rawIds = request.query.councilBusinessId;
    const councilBusinessIds = Array.isArray(rawIds) ? rawIds : rawIds === undefined ? [] : [rawIds];
    const query = councilBusinessAgendaHistoryQuerySchema.parse({ councilBusinessIds });
    response.json(await councilBusinessWorkspaceService.listAgendaItems(query.councilBusinessIds));
  });

  router.get("/:businessId", requirePermission("workspace.read"), async (request, response) => {
    const business = await councilBusinessWorkspaceService.get(routeParameter(request.params.businessId));
    response.locals.currentCouncilBusinessAgendaItems = await councilBusinessWorkspaceService.listAgendaItems([
      business.id,
    ]);
    response.json(business);
  });

  router.get("/:businessId/resources", requirePermission("workspace.read"), async (request, response) => {
    const businessId = routeParameter(request.params.businessId);
    await councilBusinessWorkspaceService.get(businessId);
    response.json(await councilBusinessWorkspaceService.listResources(businessId));
  });

  router.post(
    "/:businessId/resources",
    requireActionPermission("council-business.associate-resource"),
    async (request, response) => {
      const businessId = routeParameter(request.params.businessId);
      await councilBusinessWorkspaceService.get(businessId);
      const input = associateCouncilBusinessResourceSchema.parse(request.body);
      response.status(201).json(await councilBusinessWorkspaceService.associateResource(businessId, input.resourceId));
    },
  );

  router.post(
    "/:businessId/resources/dissociate",
    requireActionPermission("council-business.dissociate-resource"),
    async (request, response) => {
      const businessId = routeParameter(request.params.businessId);
      await councilBusinessWorkspaceService.get(businessId);
      const input = dissociateCouncilBusinessResourceSchema.parse(request.body);
      response.json(await councilBusinessWorkspaceService.dissociateResource(businessId, input.resourceId));
    },
  );

  router.put(
    "/:businessId/resource-order",
    requireActionPermission("council-business.reorder-resources"),
    async (request, response) => {
      const businessId = routeParameter(request.params.businessId);
      await councilBusinessWorkspaceService.get(businessId);
      response.json(
        await councilBusinessWorkspaceService.reorderResources(
          businessId,
          reorderCouncilBusinessResourcesSchema.parse(request.body),
        ),
      );
    },
  );

  router.post(
    "/:businessId/agenda-items/council-decision-proposals",
    requireActionPermission("council-business.schedule-decision-proposal"),
    async (request, response) => {
      const businessId = routeParameter(request.params.businessId);
      await councilBusinessWorkspaceService.get(businessId);
      response
        .status(201)
        .json(
          await councilBusinessWorkspaceService.scheduleDecisionProposal(
            businessId,
            scheduleCouncilBusinessSubjectSchema.parse(request.body),
          ),
        );
    },
  );

  router.post(
    "/:businessId/agenda-items/open-questions",
    requireActionPermission("council-business.schedule-open-question"),
    async (request, response) => {
      const businessId = routeParameter(request.params.businessId);
      await councilBusinessWorkspaceService.get(businessId);
      response
        .status(201)
        .json(
          await councilBusinessWorkspaceService.scheduleOpenQuestion(
            businessId,
            scheduleCouncilBusinessSubjectSchema.parse(request.body),
          ),
        );
    },
  );

  return router;
}
