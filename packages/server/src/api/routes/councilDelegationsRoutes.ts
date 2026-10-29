import {
  addDelegationMembershipSchema,
  endDelegationMembershipSchema,
  saveCouncilDelegationSchema,
  updateDelegationMembershipSchema,
} from "@hall/api-contract";
import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { routeParameter } from "../routeParameter.js";

export function createCouncilDelegationsRouter({ directoryService }: Cradle): Router {
  const router = Router();
  router.get("/", async (request, response) => {
    response.json(await directoryService.listCouncilDelegations(request.query.includeArchived === "true"));
  });
  router.post("/", requireActionPermission("delegation.create"), async (request, response) => {
    response
      .status(201)
      .json(await directoryService.createCouncilDelegation(saveCouncilDelegationSchema.parse(request.body)));
  });
  router.get("/:delegationId", async (request, response) => {
    response.json(await directoryService.getCouncilDelegation(routeParameter(request.params.delegationId)));
  });
  router.put("/:delegationId", requireActionPermission("delegation.update"), async (request, response) => {
    response.json(
      await directoryService.updateCouncilDelegation(
        routeParameter(request.params.delegationId),
        saveCouncilDelegationSchema.parse(request.body),
      ),
    );
  });
  router.post("/:delegationId/archive", requireActionPermission("delegation.archive"), async (request, response) => {
    response.json(await directoryService.archiveCouncilDelegation(routeParameter(request.params.delegationId)));
  });
  router.get("/:delegationId/memberships", async (request, response) => {
    response.json(await directoryService.listDelegationMemberships(routeParameter(request.params.delegationId)));
  });
  router.post(
    "/:delegationId/memberships",
    requireActionPermission("delegation.add-membership"),
    async (request, response) => {
      response
        .status(201)
        .json(
          await directoryService.addDelegationMembership(
            routeParameter(request.params.delegationId),
            addDelegationMembershipSchema.parse(request.body),
          ),
        );
    },
  );
  router.get("/:delegationId/memberships/:membershipId", async (request, response) => {
    response.json(
      await directoryService.getDelegationMembership(
        routeParameter(request.params.delegationId),
        routeParameter(request.params.membershipId),
      ),
    );
  });
  router.put(
    "/:delegationId/memberships/:membershipId",
    requireActionPermission("delegation.update-membership"),
    async (request, response) => {
      response.json(
        await directoryService.updateDelegationMembership(
          routeParameter(request.params.delegationId),
          routeParameter(request.params.membershipId),
          updateDelegationMembershipSchema.parse(request.body),
        ),
      );
    },
  );
  router.post(
    "/:delegationId/memberships/:membershipId/end",
    requireActionPermission("delegation.end-membership"),
    async (request, response) => {
      const input = endDelegationMembershipSchema.parse(request.body);
      response.json(
        await directoryService.endDelegationMembership(
          routeParameter(request.params.delegationId),
          routeParameter(request.params.membershipId),
          input.endedOn,
        ),
      );
    },
  );
  return router;
}
