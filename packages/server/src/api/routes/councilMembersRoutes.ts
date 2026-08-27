import { createCouncilMemberSchema } from "@mairie/domain";
import { Router } from "express";
import type { Cradle } from "../../core/container.js";

export function createCouncilMembersRouter({ councilMemberRepository }: Cradle): Router {
  const router = Router();
  router.get("/", async (_request, response) => response.json(await councilMemberRepository.list()));
  router.post("/", async (request, response) => {
    response.status(201).json(await councilMemberRepository.create(createCouncilMemberSchema.parse(request.body)));
  });
  return router;
}
