import { EventEmitter } from "node:events";
import type { LiveEventPublication } from "@hall/api-contract";
import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";
import { RequestContextStore } from "../security/requestContext.js";
import { publishWorkspaceChanges } from "./workspaceChanges.js";

const principal = { id: "user-id", displayName: "Secrétariat", roles: ["clerk"], contactId: null };

function exchange(method: string, statusCode: number, body: unknown = {}) {
  const published: { event: LiveEventPublication; origin: string | undefined }[] = [];
  const requestContext = new RequestContextStore();
  const middleware = publishWorkspaceChanges({
    requestContext,
    realtimeEvents: {
      publish: (event) => published.push({ event, origin: requestContext.current()?.liveOrigin }),
    },
  });
  const response = Object.assign(new EventEmitter(), { statusCode }) as unknown as Response;
  const request = { method, body, principal } as unknown as Request;
  let nextCalled = false;
  requestContext.run({ requestId: "request", liveOrigin: "origin-id" }, () =>
    middleware(request, response, () => {
      nextCalled = true;
    }),
  );
  (response as unknown as EventEmitter).emit("finish");
  return { published, nextCalled };
}

// @verifies-requirement HALL-TR-LIV-010
describe("workspace change publication", () => {
  it("announces a successful write with its author and the origin of the issuing session", () => {
    const { published, nextCalled } = exchange("POST", 200);
    expect(nextCalled).toBe(true);
    expect(published).toEqual([
      {
        event: { type: "workspace.changed", actor: { id: "user-id", displayName: "Secrétariat" } },
        origin: "origin-id",
      },
    ]);
  });

  it("announces nothing for a reading, a refusal or a preview", () => {
    expect(exchange("GET", 200).published).toEqual([]);
    expect(exchange("PATCH", 409).published).toEqual([]);
    expect(exchange("POST", 200, { targetCouncilBusinessId: "id", preview: true }).published).toEqual([]);
  });
});
