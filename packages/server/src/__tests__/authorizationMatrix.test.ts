import { type ApiPermission, type ApiRole, apiPermissions } from "@mairie/api-contract";
import { describe, expect, it } from "vitest";
import { permissionsForRoles } from "../security/authorization.js";

const expected: Record<ApiRole, readonly ApiPermission[]> = {
  administrator: apiPermissions,
  clerk: ["members.manage", "workspace.read", "workspace.write", "meetings.read", "meetings.prepare"],
  contributor: ["workspace.read", "workspace.write", "meetings.read"],
  meetingConductor: ["workspace.read", "meetings.read", "meetings.conduct"],
  reader: ["workspace.read", "meetings.read"],
};

describe("RBAC permission matrix", () => {
  it.each(Object.entries(expected) as Array<[ApiRole, readonly ApiPermission[]]>)(
    "%s exposes exactly its declared permissions",
    (role, permissions) => {
      const granted = permissionsForRoles([role]);
      expect(granted).toEqual(permissions);
      expect(
        Object.fromEntries(apiPermissions.map((permission) => [permission, granted.includes(permission)])),
      ).toEqual(Object.fromEntries(apiPermissions.map((permission) => [permission, permissions.includes(permission)])));
    },
  );
});
