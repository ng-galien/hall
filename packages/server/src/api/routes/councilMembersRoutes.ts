import { createCouncilMemberSchema } from "@hall/domain";
import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { DomainError } from "../../services/errors.js";
import { routeParameter } from "../routeParameter.js";

export function createCouncilMembersRouter({ councilMemberRepository, unitOfWork }: Cradle): Router {
  const router = Router();
  router.get("/", requirePermission("meetings.read"), async (_request, response) =>
    response.json(await councilMemberRepository.list()),
  );
  router.get("/:memberId", requirePermission("meetings.read"), async (request, response) => {
    const member = await councilMemberRepository.find(routeParameter(request.params.memberId));
    if (!member) throw new DomainError("council_member_not_found", 404);
    response.json(member);
  });
  router.post("/", requirePermission("members.manage"), async (request, response) => {
    response
      .status(201)
      .json(
        await unitOfWork.execute(() => councilMemberRepository.create(createCouncilMemberSchema.parse(request.body))),
      );
  });
  return router;
}
