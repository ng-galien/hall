import {
  attachCouncilBusinessDecisionSchema,
  createCouncilBusinessSchema,
  folderPathSchema,
  reclassifyCouncilBusinessSchema,
  scheduleCouncilBusinessSchema,
  updateCouncilBusinessSchema,
} from "@hall/domain";
import { Router } from "express";
import { z } from "zod";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { routeParameter } from "../routeParameter.js";

export function createCouncilBusinessRouter({
  councilBusinessService,
  meetingPreparationService,
  councilMeetingRepository,
}: Cradle): Router {
  const router = Router();
  router.get("/", requirePermission("workspace.read"), async (request, response) => {
    const folderPath =
      typeof request.query.folderPath === "string" ? folderPathSchema.parse(request.query.folderPath) : undefined;
    const resourceId =
      typeof request.query.resourceId === "string" ? z.string().uuid().parse(request.query.resourceId) : undefined;
    response.json(await councilBusinessService.list({ folderPath, resourceId }));
  });
  router.post("/", requireActionPermission("council-business.create"), async (request, response) => {
    response.status(201).json(await councilBusinessService.create(createCouncilBusinessSchema.parse(request.body)));
  });
  router.put("/:businessId", requireActionPermission("council-business.update"), async (request, response) => {
    response.json(
      await councilBusinessService.update(
        routeParameter(request.params.businessId),
        updateCouncilBusinessSchema.parse(request.body),
      ),
    );
  });
  router.put(
    "/:businessId/classification",
    requireActionPermission("council-business.reclassify"),
    async (request, response) => {
      const { folderPath } = reclassifyCouncilBusinessSchema.parse(request.body);
      response.json(await councilBusinessService.reclassify(routeParameter(request.params.businessId), folderPath));
    },
  );
  router.get("/:businessId", requirePermission("workspace.read"), async (request, response) => {
    response.json(await councilBusinessService.get(routeParameter(request.params.businessId)));
  });
  router.post(
    "/:businessId/schedule",
    requireActionPermission("council-business.schedule"),
    async (request, response) => {
      const input = scheduleCouncilBusinessSchema.parse(request.body);
      const item = await meetingPreparationService.scheduleBusiness(
        input.meetingId,
        routeParameter(request.params.businessId),
        input.position,
      );
      const meeting = await councilMeetingRepository.find(item.meetingId);
      response.locals.meetingReference = meeting?.slug;
      response.status(201).json(item);
    },
  );
  router.post(
    "/:businessId/decision",
    requireActionPermission("council-business.attach-decision"),
    async (request, response) => {
      const input = attachCouncilBusinessDecisionSchema.parse(request.body ?? {});
      response
        .status(201)
        .json(await councilBusinessService.attachDecision(routeParameter(request.params.businessId), input));
    },
  );
  router.delete(
    "/:businessId/decision",
    requireActionPermission("council-business.detach-decision"),
    async (request, response) => {
      response.json(await councilBusinessService.detachDecision(routeParameter(request.params.businessId)));
    },
  );
  return router;
}
