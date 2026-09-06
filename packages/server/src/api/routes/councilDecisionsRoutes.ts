import {
  councilDecisionContentCanChange,
  createCouncilDecisionSchema,
  updateCouncilDecisionSchema,
} from "@hall/domain";
import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { requireAnyPermission } from "../../security/authorization.js";
import { decisionContentIsFrozen } from "../../services/councilDecisionContentPolicy.js";
import { DomainError } from "../../services/errors.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { routeParameter } from "../routeParameter.js";

export function createCouncilDecisionsRouter({
  councilDecisionRepository,
  councilMeetingRepository,
  councilBusinessRepository,
  agendaItemRepository,
  unitOfWork,
}: Cradle): Router {
  const router = Router();
  const withEditability = async <T extends { id: string }>(decision: T) => ({
    ...decision,
    contentEditable: !(await decisionContentIsFrozen(
      decision.id,
      councilBusinessRepository,
      agendaItemRepository,
      councilMeetingRepository,
    )),
  });
  router.get("/", requireAnyPermission("workspace.read", "meetings.read"), async (_request, response) => {
    response.json(await Promise.all((await councilDecisionRepository.list()).map(withEditability)));
  });
  router.get("/:decisionId", requireAnyPermission("workspace.read", "meetings.read"), async (request, response) => {
    const decision = await councilDecisionRepository.find(routeParameter(request.params.decisionId));
    if (!decision) throw new DomainError("council_decision_not_found", 404);
    response.json(await withEditability(decision));
  });
  router.post("/", requireActionPermission("decision.create"), async (request, response) => {
    const input = createCouncilDecisionSchema.parse(request.body);
    response.status(201).json(
      await unitOfWork.execute(async () => {
        return councilDecisionRepository.create(input);
      }),
    );
  });
  router.put("/:decisionId", requireActionPermission("decision.update"), async (request, response) => {
    const decisionId = routeParameter(request.params.decisionId);
    const input = updateCouncilDecisionSchema.parse(request.body);
    response.json(
      await unitOfWork.execute(async () => {
        const decision = await councilDecisionRepository.find(decisionId);
        if (!decision) throw new DomainError("council_decision_not_found", 404);
        if (!councilDecisionContentCanChange(decision.status)) {
          throw new DomainError("ballot_already_recorded", 409);
        }
        if (
          await decisionContentIsFrozen(
            decision.id,
            councilBusinessRepository,
            agendaItemRepository,
            councilMeetingRepository,
          )
        ) {
          throw new DomainError("agenda_inconsistent", 409);
        }
        return withEditability(await councilDecisionRepository.update(decision.id, input));
      }),
    );
  });
  return router;
}
