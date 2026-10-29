import { createCouncilMemberSchema, updateCouncilMemberSchema } from "@hall/api-contract";
import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { routeParameter } from "../routeParameter.js";

export function createCouncilMembersRouter({ directoryService }: Cradle): Router {
  const router = Router();
  router.get("/", async (_request, response) => {
    const [members, canCreate] = await Promise.all([
      directoryService.listCouncilMembers(),
      directoryService.councilMemberCreationAvailable(),
    ]);
    response.locals.councilMemberCreationAvailable = canCreate;
    response.json(members);
  });
  router.get("/:memberId", async (request, response) => {
    response.json(await directoryService.getCouncilMember(routeParameter(request.params.memberId)));
  });
  router.post("/", requireActionPermission("member.create"), async (request, response) => {
    response
      .status(201)
      .json(await directoryService.createCouncilMember(createCouncilMemberSchema.parse(request.body)));
  });
  router.put("/:memberId", requireActionPermission("member.update"), async (request, response) => {
    const memberId = routeParameter(request.params.memberId);
    response.json(await directoryService.updateCouncilMember(memberId, updateCouncilMemberSchema.parse(request.body)));
  });
  return router;
}
