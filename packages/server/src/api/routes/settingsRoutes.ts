import { updateHallSettingsSchema } from "@hall/domain";
import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";

export function createSettingsRouter({ hallSettingsService }: Cradle): Router {
  const router = Router();
  router.get("/", async (_request, response) => response.json(await hallSettingsService.get()));
  router.put("/", requireActionPermission("settings.update"), async (request, response) => {
    response.json(await hallSettingsService.update(updateHallSettingsSchema.parse(request.body)));
  });
  return router;
}
