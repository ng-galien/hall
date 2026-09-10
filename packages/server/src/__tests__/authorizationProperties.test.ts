import { type ApiRole, apiPermissions, apiRoles, assignUserRolesSchema, createUserSchema } from "@hall/api-contract";
import type { NextFunction, Request, Response } from "express";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import {
  hasPermission,
  permissionsForRoles,
  requireAnyPermission,
  requirePermission,
} from "../security/authorization.js";

const roleArbitrary = fc.constantFrom(...apiRoles);

describe("RBAC algebra properties", () => {
  it("never grants a permission without a principal", () => {
    for (const permission of apiPermissions) expect(hasPermission(undefined, permission)).toBe(false);
  });

  it("is invariant under role order and duplication", () => {
    fc.assert(
      fc.property(fc.array(roleArbitrary, { maxLength: 50 }), (roles) => {
        const granted = permissionsForRoles(roles);
        const reorderedAndDuplicated = permissionsForRoles([...roles].reverse().concat(roles, roles));

        expect(reorderedAndDuplicated).toEqual(granted);
        expect(new Set(granted).size).toBe(granted.length);
        expect(granted).toEqual(apiPermissions.filter((permission) => granted.includes(permission)));
      }),
      { numRuns: 1_000 },
    );
  });

  it("maps a union of roles to the canonical union of their permissions", () => {
    fc.assert(
      fc.property(
        fc.array(roleArbitrary, { maxLength: 25 }),
        fc.array(roleArbitrary, { maxLength: 25 }),
        (leftRoles, rightRoles) => {
          const leftPermissions = permissionsForRoles(leftRoles);
          const rightPermissions = permissionsForRoles(rightRoles);
          const expectedUnion = apiPermissions.filter(
            (permission) => leftPermissions.includes(permission) || rightPermissions.includes(permission),
          );

          expect(permissionsForRoles([...leftRoles, ...rightRoles])).toEqual(expectedUnion);
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it("enforces authentication and authorization in both permission middleware variants", () => {
    const response = {
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;
    const anonymous = { originalUrl: "/api/protected", requestId: "request-id" } as Request;
    const reader = {
      ...anonymous,
      principal: {
        id: "reader-id",
        displayName: "Reader",
        roles: ["reader"],
        permissions: permissionsForRoles(["reader"]),
        contactId: null,
      },
    } as Request;

    requirePermission("workspace.read")(anonymous, response, next);
    expect(response.status).toHaveBeenLastCalledWith(401);
    expect(response.json).toHaveBeenLastCalledWith(expect.objectContaining({ code: "authentication_required" }));
    requirePermission("workspace.write")(reader, response, next);
    expect(response.status).toHaveBeenLastCalledWith(403);
    expect(response.json).toHaveBeenLastCalledWith(expect.objectContaining({ code: "permission_denied" }));
    requirePermission("workspace.read")(reader, response, next);
    expect(next).toHaveBeenCalledTimes(1);

    requireAnyPermission("workspace.read", "meetings.read")(anonymous, response, next);
    expect(response.status).toHaveBeenLastCalledWith(401);
    expect(response.json).toHaveBeenLastCalledWith(expect.objectContaining({ code: "authentication_required" }));
    requireAnyPermission("users.manage", "audit.read")(reader, response, next);
    expect(response.status).toHaveBeenLastCalledWith(403);
    expect(response.json).toHaveBeenLastCalledWith(expect.objectContaining({ code: "permission_denied" }));
    requireAnyPermission("users.manage", "meetings.read")(reader, response, next);
    expect(next).toHaveBeenCalledTimes(2);
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
