import { type ApiRole, apiRoles, assignUserRolesSchema, createUserSchema } from "@hall/api-contract";
import type { NextFunction, Request, Response } from "express";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { type AuthorizationClient, canExecute, requireAction } from "../security/authorization.js";

const roleArbitrary = fc.constantFrom(...apiRoles);

describe("action guard", () => {
  it("asks the database for the action and maps the answer to 401, 403 or the next handler", async () => {
    const response = {
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;
    const asked: Array<[string, unknown]> = [];
    const authorization: AuthorizationClient = {
      allows: async (action, target) => {
        asked.push([action, target]);
        return action === "council-business.create";
      },
      allowedActions: async () => new Set(["council-business.create"]),
    };
    const anonymous = { originalUrl: "/api/protected", requestId: "request-id" } as Request;
    const contributor = {
      ...anonymous,
      principal: { id: "contributor-id", displayName: "Contributor", roles: ["contributor"], contactId: null },
      authorization,
      authorizationTarget: { meetingId: "meeting-id" },
    } as unknown as Request;

    await requireAction("council-business.create")(anonymous, response, next);
    expect(response.status).toHaveBeenLastCalledWith(401);
    expect(response.json).toHaveBeenLastCalledWith(expect.objectContaining({ code: "authentication_required" }));
    await requireAction("council-business.delete")(contributor, response, next);
    expect(response.status).toHaveBeenLastCalledWith(403);
    expect(response.json).toHaveBeenLastCalledWith(expect.objectContaining({ code: "permission_denied" }));
    await requireAction("council-business.create")(contributor, response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(asked).toEqual([
      ["council-business.delete", { meetingId: "meeting-id" }],
      ["council-business.create", { meetingId: "meeting-id" }],
    ]);
  });

  it("offers in Siren only the actions loaded from the database for the request", () => {
    const request = { allowedActions: new Set(["template.generate"]) } as unknown as Request;
    expect(canExecute(request, "template.generate")).toBe(true);
    expect(canExecute(request, "template.delete")).toBe(false);
    expect(canExecute({} as Request, "template.generate")).toBe(false);
  });
});

describe("role command schema properties", () => {
  it("accepts exactly the non-empty role collections without duplicates", () => {
    fc.assert(
      fc.property(fc.array(roleArbitrary, { minLength: 1, maxLength: 20 }), (roles) => {
        const expectedToSucceed = new Set<ApiRole>(roles).size === roles.length;
        const user = {
          email: "clerk@example.test",
          displayName: "Clerk",
          password: "a-secure-password",
          roles,
          contactId: null,
        };

        expect(assignUserRolesSchema.safeParse({ roles }).success).toBe(expectedToSucceed);
        expect(createUserSchema.safeParse(user).success).toBe(expectedToSucceed);
      }),
      { numRuns: 1_000 },
    );
  });
});
