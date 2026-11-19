import { EventEmitter } from "node:events";
import type { LiveEventPublication } from "@hall/api-contract";
import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";
import { RequestContextStore } from "../security/requestContext.js";
import { publishWorkspaceChanges, type WorkspaceChangeScope } from "./workspaceChanges.js";

const principal = { id: "user-id", displayName: "Secrétariat", roles: ["clerk"], contactId: null };

function exchange(
  method: string,
  statusCode: number,
  body: unknown = {},
  scope?: WorkspaceChangeScope,
  location: { baseUrl: string; path: string } = { baseUrl: "/api/resources", path: "/" },
) {
  const published: { event: LiveEventPublication; origin: string | undefined }[] = [];
  const requestContext = new RequestContextStore();
  const middleware = publishWorkspaceChanges({
    requestContext,
    realtimeEvents: {
      publish: (event) => published.push({ event, origin: requestContext.current()?.liveOrigin }),
    },
  });
  const response = Object.assign(new EventEmitter(), {
    statusCode,
    locals: scope ? { workspaceChange: scope } : {},
  }) as unknown as Response;
  const request = { method, body, principal, ...location } as unknown as Request;
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

  it("announces a saved content with the resource it touched, and nothing for a command that changes no data", () => {
    const resource = { id: "22222222-2222-4222-8222-222222222222", path: "Affaires", kind: "text" as const };
    expect(exchange("PUT", 200, {}, { kind: "content", resource }).published).toEqual([
      {
        event: {
          type: "workspace.changed",
          actor: { id: "user-id", displayName: "Secrétariat" },
          change: { kind: "content", resource },
        },
        origin: "origin-id",
      },
    ]);
    expect(exchange("POST", 200, {}, { kind: "none" }).published).toEqual([]);
  });

  it("announces a command on one affair with that affair, and its deletion or a merge as a change of anything", () => {
    const affair = "33333333-3333-4333-8333-333333333333";
    const at = (method: string, path: string) =>
      exchange(method, 200, {}, undefined, { baseUrl: "/api/council-business", path }).published.map(({ event }) =>
        event.type === "workspace.changed" ? event.change : null,
      );
    expect(at("POST", `/${affair}/resources`)).toEqual([{ kind: "business", councilBusinessId: affair }]);
    expect(at("DELETE", `/${affair}`)).toEqual([undefined]);
    expect(at("POST", `/${affair}/merge`)).toEqual([undefined]);
    expect(at("POST", "/")).toEqual([undefined]);
  });

  it("announces nothing for a reading, a refusal or a preview", () => {
    expect(exchange("GET", 200).published).toEqual([]);
    expect(exchange("PATCH", 409).published).toEqual([]);
    expect(exchange("POST", 200, { targetCouncilBusinessId: "id", preview: true }).published).toEqual([]);
  });
});
