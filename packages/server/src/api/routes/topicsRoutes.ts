import {
  attachTopicDecisionSchema,
  createTopicSchema,
  folderPathSchema,
  reclassifyTopicSchema,
  scheduleTopicSchema,
  topicStateSchema,
  updateTopicSchema,
} from "@hall/domain";
import { Router } from "express";
import { z } from "zod";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { routeParameter } from "../routeParameter.js";

export function createTopicsRouter({ topicService, meetingPreparationService }: Cradle): Router {
  const router = Router();
  router.get("/", requirePermission("workspace.read"), async (request, response) => {
    const state = typeof request.query.state === "string" ? topicStateSchema.parse(request.query.state) : undefined;
    const folderPath =
      typeof request.query.folderPath === "string" ? folderPathSchema.parse(request.query.folderPath) : undefined;
    const resourceId =
      typeof request.query.resourceId === "string" ? z.string().uuid().parse(request.query.resourceId) : undefined;
    response.json(await topicService.list({ state, folderPath, resourceId }));
  });
  router.post("/", requirePermission("workspace.write"), async (request, response) => {
    response.status(201).json(await topicService.create(createTopicSchema.parse(request.body)));
  });
  router.put("/:topicId", requirePermission("workspace.write"), async (request, response) => {
    response.json(
      await topicService.update(routeParameter(request.params.topicId), updateTopicSchema.parse(request.body)),
    );
  });
  router.put("/:topicId/classification", requirePermission("workspace.write"), async (request, response) => {
    const { folderPath } = reclassifyTopicSchema.parse(request.body);
    response.json(await topicService.reclassify(routeParameter(request.params.topicId), folderPath));
  });
  router.get("/:topicId", requirePermission("workspace.read"), async (request, response) => {
    response.json(await topicService.get(routeParameter(request.params.topicId)));
  });
  router.post("/:topicId/schedule", requirePermission("meetings.prepare"), async (request, response) => {
    const input = scheduleTopicSchema.parse(request.body);
    response
      .status(201)
      .json(
        await meetingPreparationService.scheduleTopic(
          input.meetingId,
          routeParameter(request.params.topicId),
          input.position,
        ),
      );
  });
  router.post("/:topicId/decision", requirePermission("workspace.write"), async (request, response) => {
    const input = attachTopicDecisionSchema.parse(request.body ?? {});
    response.status(201).json(await topicService.attachDecision(routeParameter(request.params.topicId), input));
  });
  router.delete("/:topicId/decision", requirePermission("workspace.write"), async (request, response) => {
    response.json(await topicService.detachDecision(routeParameter(request.params.topicId)));
  });
  return router;
}
