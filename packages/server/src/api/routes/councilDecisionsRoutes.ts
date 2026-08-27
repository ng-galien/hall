import { createCouncilDecisionSchema, updateCouncilDecisionSchema } from "@mairie/domain";
import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { DomainError } from "../../services/errors.js";

export function createCouncilDecisionsRouter({ councilDecisionRepository }: Cradle): Router {
  const router = Router();
  router.get("/", async (_request, response) => response.json(await councilDecisionRepository.list()));
  router.get("/:decisionId", async (request, response) => {
    const decision = await councilDecisionRepository.find(request.params.decisionId);
    if (!decision) throw new DomainError("council_decision_not_found", 404);
    response.json(decision);
  });
  router.post("/", async (request, response) => {
    const input = createCouncilDecisionSchema.parse(request.body);
    response.status(201).json(await councilDecisionRepository.create(input));
  });
  router.put("/:decisionId", async (request, response) => {
    const decision = await councilDecisionRepository.find(request.params.decisionId);
    if (!decision) throw new DomainError("council_decision_not_found", 404);
    if (!["draft", "ready", "scheduled"].includes(decision.status)) {
      throw new DomainError("ballot_already_recorded", 409);
    }
    response.json(
      await councilDecisionRepository.update(
        request.params.decisionId,
        updateCouncilDecisionSchema.parse(request.body),
      ),
    );
  });
  return router;
}
