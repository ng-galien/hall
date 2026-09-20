import { type ApiPermission, type ApiRole, apiPermissions } from "@hall/api-contract";
import { describe, expect, it } from "vitest";
import { permissionsForRoles } from "../security/authorization.js";

const expected: Record<ApiRole, readonly ApiPermission[]> = {
  administrator: apiPermissions,
  clerk: [
    "contacts.read",
    "contacts.manage",
    "members.manage",
    "workspace.read",
    "workspace.write",
    "council-business.update",
    "meetings.read",
    "meetings.prepare",
  ],
  contributor: ["contacts.read", "workspace.read", "workspace.write", "council-business.update", "meetings.read"],
  meetingConductor: ["contacts.read", "workspace.read", "meetings.read", "meetings.conduct"],
  reader: ["contacts.read", "workspace.read", "meetings.read"],
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
