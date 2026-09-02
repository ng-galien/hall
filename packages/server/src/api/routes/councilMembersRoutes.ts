import { createCouncilMemberSchema, updateCouncilMemberSchema } from "@hall/domain";
import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { routeParameter } from "../routeParameter.js";

export function createCouncilMembersRouter({ councilMemberService }: Cradle): Router {
  const router = Router();
  router.get("/", requirePermission("meetings.read"), async (_request, response) => {
    const [members, canCreate] = await Promise.all([councilMemberService.list(), councilMemberService.canCreate()]);
    response.locals.councilMemberCreationAvailable = canCreate;
    response.json(members);
  });
  router.get("/:memberId", requirePermission("meetings.read"), async (request, response) => {
    response.json(await councilMemberService.get(routeParameter(request.params.memberId)));
  });
  router.post("/", requireActionPermission("member.create"), async (request, response) => {
    response.status(201).json(await councilMemberService.create(createCouncilMemberSchema.parse(request.body)));
  });
  router.put("/:memberId", requireActionPermission("member.update"), async (request, response) => {
    const memberId = routeParameter(request.params.memberId);
    response.json(await councilMemberService.update(memberId, updateCouncilMemberSchema.parse(request.body)));
  });
  return router;
}
