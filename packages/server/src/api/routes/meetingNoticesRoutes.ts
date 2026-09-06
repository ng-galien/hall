import { Router } from "express";
import type { Cradle } from "../../core/container.js";
import { requirePermission } from "../../security/authorization.js";
import { routeParameter } from "../routeParameter.js";

export function createMeetingNoticesRouter({ meetingNoticeService }: Cradle): Router {
  const router = Router();
  router.get("/:id", requirePermission("meetings.read"), async (request, response) => {
    response.json(await meetingNoticeService.open(routeParameter(request.params.id)));
  });
  router.get("/:id/content", requirePermission("meetings.read"), async (request, response) => {
    const id = routeParameter(request.params.id);
    response.set("Content-Disposition", `inline; filename="meeting-notice-${id}.pdf"`);
    response.set("Cache-Control", "private, no-store");
    response.type("application/pdf").send(await meetingNoticeService.content(id));
  });
  return router;
}
