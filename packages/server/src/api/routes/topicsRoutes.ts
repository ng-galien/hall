import {
  createTopicSchema,
  folderPathSchema,
  scheduleTopicSchema,
  topicStateSchema,
  updateTopicSchema,
} from "@mairie/domain";
import { Router } from "express";
import { z } from "zod";
import type { Cradle } from "../../core/container.js";

export function createTopicsRouter({ topicService, meetingPreparationService }: Cradle): Router {
  const router = Router();
  router.get("/", async (request, response) => {
    const state = typeof request.query.state === "string" ? topicStateSchema.parse(request.query.state) : undefined;
    const folderPath =
      typeof request.query.folderPath === "string" ? folderPathSchema.parse(request.query.folderPath) : undefined;
    const resourceId =
      typeof request.query.resourceId === "string" ? z.string().uuid().parse(request.query.resourceId) : undefined;
    response.json(await topicService.list({ state, folderPath, resourceId }));
  });
  router.post("/", async (request, response) => {
    response.status(201).json(await topicService.create(createTopicSchema.parse(request.body)));
  });
  router.put("/:topicId", async (request, response) => {
    response.json(await topicService.update(request.params.topicId, updateTopicSchema.parse(request.body)));
  });
  router.get("/:topicId", async (request, response) => {
    response.json(await topicService.get(request.params.topicId));
  });
  router.post("/:topicId/schedule", async (request, response) => {
    const input = scheduleTopicSchema.parse(request.body);
    response
      .status(201)
      .json(await meetingPreparationService.scheduleTopic(input.meetingId, request.params.topicId, input.position));
  });
  return router;
}
