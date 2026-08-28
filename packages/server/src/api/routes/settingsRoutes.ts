import { updateHallSettingsSchema } from "@hall/domain";
import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";

export function createSettingsRouter({ hallSettingsService }: Cradle): Router {
  const router = Router();
  router.get("/", async (_request, response) => response.json(await hallSettingsService.get()));
  router.put("/", requirePermission("settings.manage"), async (request, response) => {
    response.json(await hallSettingsService.update(updateHallSettingsSchema.parse(request.body)));
  });
  return router;
}
