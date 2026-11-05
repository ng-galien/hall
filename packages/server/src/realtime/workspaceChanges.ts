import type { NextFunction, Request, Response } from "express";
import type { RequestContextStore } from "../security/requestContext.js";
import type { LiveEventPublisher } from "./liveEvents.js";

const readingMethods = new Set(["GET", "HEAD", "OPTIONS"]);

function isPreview(body: unknown): boolean {
  return Boolean(body && typeof body === "object" && (body as { preview?: unknown }).preview === true);
}

/** Announces every successful write on resources and council businesses to the other sessions. */
// @implements-requirement HALL-TR-LIV-010
export function publishWorkspaceChanges({
  realtimeEvents,
  requestContext,
}: {
  realtimeEvents: LiveEventPublisher;
  requestContext: RequestContextStore;
}) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (readingMethods.has(request.method)) {
      next();
      return;
    }
    const context = requestContext.current();
    response.once("finish", () => {
      const principal = request.principal;
      if (response.statusCode >= 400 || !principal || isPreview(request.body)) return;
      const publish = () =>
        realtimeEvents.publish({
          type: "workspace.changed",
          actor: { id: principal.id, displayName: principal.displayName },
        });
      if (context) requestContext.run(context, publish);
      else publish();
    });
    next();
  };
}
