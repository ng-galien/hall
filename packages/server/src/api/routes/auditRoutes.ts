import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { requireAction } from "../../security/authorization.js";
import { DomainError } from "../../services/errors.js";
import { routeParameter } from "../routeParameter.js";

export function createAuditRouter({ securityRepository }: Cradle): Router {
  const router = Router();
  router.use(requireAction("audit-event.list"));
  router.get("/", async (_request, response) => response.json(await securityRepository.listAuditEvents()));
  router.get("/:eventId", async (request, response) => {
    const event = await securityRepository.findAuditEvent(routeParameter(request.params.eventId));
    if (!event) throw new DomainError("audit_event_not_found", 404);
    response.json(event);
  });
  return router;
}
