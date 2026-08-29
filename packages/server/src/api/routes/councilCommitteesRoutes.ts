import {
  addCommitteeMembershipSchema,
  createCouncilCommitteeSchema,
  endCommitteeMembershipSchema,
  updateCommitteeMembershipSchema,
  updateCouncilCommitteeSchema,
} from "@hall/domain";
import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { routeParameter } from "../routeParameter.js";

export function createCouncilCommitteesRouter({ councilCommitteeService }: Cradle): Router {
  const router = Router();
  router.get("/", requirePermission("meetings.read"), async (request, response) => {
    response.json(await councilCommitteeService.list(request.query.includeArchived === "true"));
  });
  router.post("/", requirePermission("meetings.prepare"), async (request, response) => {
    response.status(201).json(await councilCommitteeService.create(createCouncilCommitteeSchema.parse(request.body)));
  });
  router.get("/:committeeId", requirePermission("meetings.read"), async (request, response) => {
    response.json(await councilCommitteeService.get(routeParameter(request.params.committeeId)));
  });
  router.put("/:committeeId", requirePermission("meetings.prepare"), async (request, response) => {
    response.json(
      await councilCommitteeService.update(
        routeParameter(request.params.committeeId),
        updateCouncilCommitteeSchema.parse(request.body),
      ),
    );
  });
  router.post("/:committeeId/archive", requirePermission("meetings.prepare"), async (request, response) => {
    response.json(await councilCommitteeService.archive(routeParameter(request.params.committeeId)));
  });
  router.post("/:committeeId/memberships", requirePermission("meetings.prepare"), async (request, response) => {
    response
      .status(201)
      .json(
        await councilCommitteeService.addMembership(
          routeParameter(request.params.committeeId),
          addCommitteeMembershipSchema.parse(request.body),
        ),
      );
  });
  router.get(
    "/:committeeId/memberships/:membershipId",
    requirePermission("meetings.read"),
    async (request, response) => {
      response.json(
        await councilCommitteeService.getMembership(
          routeParameter(request.params.committeeId),
          routeParameter(request.params.membershipId),
        ),
      );
    },
  );
  router.put(
    "/:committeeId/memberships/:membershipId",
    requirePermission("meetings.prepare"),
    async (request, response) => {
      response.json(
        await councilCommitteeService.updateMembership(
          routeParameter(request.params.committeeId),
          routeParameter(request.params.membershipId),
          updateCommitteeMembershipSchema.parse(request.body),
        ),
      );
    },
  );
  router.post(
    "/:committeeId/memberships/:membershipId/end",
    requirePermission("meetings.prepare"),
    async (request, response) => {
      const input = endCommitteeMembershipSchema.parse(request.body);
      response.json(
        await councilCommitteeService.endMembership(
          routeParameter(request.params.committeeId),
          routeParameter(request.params.membershipId),
          input.endedOn,
        ),
      );
    },
  );
  return router;
}
