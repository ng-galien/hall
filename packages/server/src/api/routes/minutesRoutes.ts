import { generateMinutesSchema, updateMinutesDraftSchema } from "@hall/api-contract";
import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { DomainError } from "../../services/errors.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import { routeParameter } from "../routeParameter.js";

export function createMinutesRouter({ minutesService }: Cradle): Router {
  const router = Router();
  router.get("/", requirePermission("meetings.read"), async (_request, response) => {
    response.json(await minutesService.list());
  });
  router.get("/:id", requirePermission("meetings.read"), async (request, response) => {
    response.json(await minutesService.open(routeParameter(request.params.id)));
  });
  router.get("/:id/preview", requirePermission("meetings.read"), async (request, response) => {
    response.set("Cache-Control", "private, no-store");
    response.type("application/pdf").send(await minutesService.preview(routeParameter(request.params.id)));
  });
  router.patch("/:id/draft", requireActionPermission("minutes.update-draft"), async (request, response) => {
    response.json(
      await minutesService.updateDraft(routeParameter(request.params.id), updateMinutesDraftSchema.parse(request.body)),
    );
  });
  router.post("/:id/generate", requireActionPermission("minutes.generate"), async (request, response) => {
    response.json(
      await minutesService.generate(routeParameter(request.params.id), generateMinutesSchema.parse(request.body)),
    );
  });
  router.get("/:id/content", requirePermission("meetings.read"), async (request, response) => {
    const id = routeParameter(request.params.id);
    const content = await minutesService.content(id);
    if (!content) throw new DomainError("minutes_not_generated", 409);
    response.set("Content-Disposition", `inline; filename="minutes-${id}.pdf"`);
    response.set("Cache-Control", "private, no-store");
    response.type("application/pdf").send(content);
  });
  return router;
}
