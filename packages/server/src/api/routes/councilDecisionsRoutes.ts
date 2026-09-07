import { freezeCouncilDecisionSchema, updateCouncilDecisionDraftSchema } from "@hall/api-contract";
import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { DomainError } from "../../services/errors.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { routeParameter } from "../routeParameter.js";

export function createCouncilDecisionsRouter({ councilDecisionService }: Cradle): Router {
  const router = Router();
  router.get("/", requirePermission("meetings.read"), async (_request, response) => {
    response.json(await councilDecisionService.list());
  });
  router.get("/:id", requirePermission("meetings.read"), async (request, response) => {
    response.json(await councilDecisionService.open(routeParameter(request.params.id)));
  });
  router.put("/:id/draft", requireActionPermission("decision.update-draft"), async (request, response) => {
    response.json(
      await councilDecisionService.updateDraft(
        routeParameter(request.params.id),
        updateCouncilDecisionDraftSchema.parse(request.body),
      ),
    );
  });
  router.post("/:id/freeze", requireActionPermission("decision.freeze"), async (request, response) => {
    response.json(
      await councilDecisionService.freeze(
        routeParameter(request.params.id),
        freezeCouncilDecisionSchema.parse(request.body),
      ),
    );
  });
  router.get("/:id/preview.pdf", requirePermission("meetings.read"), async (request, response) => {
    response.set("Cache-Control", "private, no-store");
    response.type("application/pdf").send(await councilDecisionService.preview(routeParameter(request.params.id)));
  });
  router.get("/:id/content.pdf", requirePermission("meetings.read"), async (request, response) => {
    const id = routeParameter(request.params.id);
    const content = await councilDecisionService.content(id);
    if (!content) throw new DomainError("council_decision_document_unavailable", 409);
    response.set("Content-Disposition", `inline; filename="decision-${id}.pdf"`);
    response.set("Cache-Control", "private, no-store");
    response.type("application/pdf").send(content);
  });
  return router;
}
