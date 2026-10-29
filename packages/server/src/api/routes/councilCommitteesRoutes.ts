import {
  addCommitteeMembershipSchema,
  endCommitteeMembershipSchema,
  saveCouncilCommitteeSchema,
  updateCommitteeMembershipSchema,
} from "@hall/api-contract";
import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { committeeLinkCollection } from "../councilBusinessCommitteeRepresentation.js";
import { routeParameter } from "../routeParameter.js";

export function createCouncilCommitteesRouter({ directoryService, councilBusinessWorkspaceService }: Cradle): Router {
  const router = Router();
  router.get("/", async (request, response) => {
    response.json(await directoryService.listCouncilCommittees(request.query.includeArchived === "true"));
  });
  router.post("/", requireActionPermission("committee.create"), async (request, response) => {
    response
      .status(201)
      .json(await directoryService.createCouncilCommittee(saveCouncilCommitteeSchema.parse(request.body)));
  });
  router.get("/:committeeId", async (request, response) => {
    response.json(await directoryService.getCouncilCommittee(routeParameter(request.params.committeeId)));
  });
  router.get("/:committeeId/businesses", async (request, response) => {
    const committeeId = routeParameter(request.params.committeeId);
    await directoryService.getCouncilCommittee(committeeId);
    response.json(
      committeeLinkCollection(
        `/api/council-committees/${committeeId}/businesses`,
        await councilBusinessWorkspaceService.listCommitteeBusinesses(committeeId),
      ),
    );
  });
  router.put("/:committeeId", requireActionPermission("committee.update"), async (request, response) => {
    response.json(
      await directoryService.updateCouncilCommittee(
        routeParameter(request.params.committeeId),
        saveCouncilCommitteeSchema.parse(request.body),
      ),
    );
  });
  router.post("/:committeeId/archive", requireActionPermission("committee.archive"), async (request, response) => {
    response.json(await directoryService.archiveCouncilCommittee(routeParameter(request.params.committeeId)));
  });
  router.get("/:committeeId/memberships", async (request, response) => {
    response.json(await directoryService.listCommitteeMemberships(routeParameter(request.params.committeeId)));
  });
  router.post(
    "/:committeeId/memberships",
    requireActionPermission("committee.add-membership"),
    async (request, response) => {
      response
        .status(201)
        .json(
          await directoryService.addCommitteeMembership(
            routeParameter(request.params.committeeId),
            addCommitteeMembershipSchema.parse(request.body),
          ),
        );
    },
  );
  router.get("/:committeeId/memberships/:membershipId", async (request, response) => {
    response.json(
      await directoryService.getCommitteeMembership(
        routeParameter(request.params.committeeId),
        routeParameter(request.params.membershipId),
      ),
    );
  });
  router.put(
    "/:committeeId/memberships/:membershipId",
    requireActionPermission("committee.update-membership"),
    async (request, response) => {
      response.json(
        await directoryService.updateCommitteeMembership(
          routeParameter(request.params.committeeId),
          routeParameter(request.params.membershipId),
          updateCommitteeMembershipSchema.parse(request.body),
        ),
      );
    },
  );
  router.post(
    "/:committeeId/memberships/:membershipId/end",
    requireActionPermission("committee.end-membership"),
    async (request, response) => {
      const input = endCommitteeMembershipSchema.parse(request.body);
      response.json(
        await directoryService.endCommitteeMembership(
          routeParameter(request.params.committeeId),
          routeParameter(request.params.membershipId),
          input.endedOn,
        ),
      );
    },
  );
  return router;
}
