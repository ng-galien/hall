import { type ApiActionName, type ApiPermission, type ApiPrincipal, apiActionNames } from "@hall/api-contract";
import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { actionIsPermitted, requireActionPermission } from "./apiCommandAuthorization.js";
import { apiCommandPolicies } from "./apiCommandPolicy.js";
import { resolveAuditIntent } from "./apiCommandResolution.js";

const admin: ApiPrincipal = {
  id: "admin",
  displayName: "Administration",
  roles: ["administrator"],
  permissions: [
    "users.manage",
    "settings.manage",
    "contacts.read",
    "contacts.manage",
    "members.manage",
    "workspace.read",
    "workspace.write",
    "meetings.read",
    "meetings.prepare",
    "meetings.conduct",
    "audit.read",
  ],
  councilMemberId: null,
};

const actionsByPermissions = [
  [[], ["session.bootstrap", "session.login", "session.logout"]],
  [["contacts.manage"], ["contact.create", "contact.update", "contact.archive"]],
  [["members.manage"], ["member.create", "member.update"]],
  [
    ["workspace.read"],
    ["resource.search-legal-references", "template.preview", "template.preview-pdf", "template.generate"],
  ],
  [
    ["workspace.write"],
    [
      "decision.create",
      "decision.update",
      "resource.create-text",
      "resource.create-remote",
      "resource.create-geographic",
      "resource.create-spreadsheet",
      "resource.import-spreadsheet",
      "resource.update-geography",
      "resource.update-spreadsheet",
      "resource.create-legal-reference",
      "resource.resolve-legal-reference",
      "resource.refresh-legal-reference",
      "resource.create-document",
      "resource.create-editor-asset",
      "resource.promote-editor-asset",
      "resource.update",
      "resource.delete",
      "workspace.rename-folder",
      "workspace.create-folder",
      "council-business.create",
      "council-business.update",
      "council-business.reclassify",
      "council-business.attach-decision",
      "council-business.detach-decision",
      "template.create",
      "template.update",
      "template.delete",
    ],
  ],
  [
    ["meetings.prepare"],
    [
      "committee.create",
      "committee.update",
      "committee.archive",
      "committee.add-membership",
      "committee.update-membership",
      "committee.end-membership",
      "council-business.schedule",
      "meeting.create",
      "meeting.update",
      "meeting.schedule",
      "meeting.finalize-minutes",
      "meeting.cancel",
      "meeting.reorder-agenda",
      "agenda-item.remove",
    ],
  ],
  [
    ["meetings.conduct"],
    [
      "meeting.open",
      "meeting.close",
      "meeting.record-quorum-failure",
      "meeting.reconvene",
      "meeting.add-late-business",
      "meeting.record-attendance",
      "agenda-item.start",
      "agenda-item.save-notes",
      "agenda-item.complete",
      "ballot.record",
      "ballot.cancel",
    ],
  ],
  [
    ["meetings.prepare", "meetings.conduct"],
    ["meeting.change-status", "meeting.set-officers"],
  ],
  [["users.manage"], ["user.create", "user.disable", "user.assign-role"]],
  [["settings.manage"], ["settings.update"]],
] as const satisfies readonly (readonly [readonly ApiPermission[], readonly ApiActionName[]])[];

const auditCases = [
  ["POST", "/api/auth/bootstrap", undefined, "session.bootstrap", "user", undefined],
  ["POST", "/api/auth/login", undefined, "session.login", "session", undefined],
  ["POST", "/api/auth/logout", undefined, "session.logout", "session", null],
  ["POST", "/api/contacts", undefined, "contact.create", "contact", null],
  ["PUT", "/api/contacts/contact-1", undefined, "contact.update", "contact", "contact-1"],
  ["POST", "/api/contacts/contact-1/archive", undefined, "contact.archive", "contact", "contact-1"],
  ["POST", "/api/council-members", undefined, "member.create", "council-member", null],
  ["PUT", "/api/council-members/member-1", undefined, "member.update", "council-member", "member-1"],
  ["POST", "/api/council-decisions", undefined, "decision.create", "council-decision", null],
  ["PUT", "/api/council-decisions/decision-1", undefined, "decision.update", "council-decision", "decision-1"],
  ["POST", "/api/council-committees", undefined, "committee.create", "council-committee", undefined],
  ["PUT", "/api/council-committees/committee-1", undefined, "committee.update", "council-committee", "committee-1"],
  [
    "POST",
    "/api/council-committees/committee-1/archive",
    undefined,
    "committee.archive",
    "council-committee",
    "committee-1",
  ],
  [
    "POST",
    "/api/council-committees/committee-1/memberships",
    undefined,
    "committee.add-membership",
    "committee-membership",
    null,
  ],
  [
    "PUT",
    "/api/council-committees/committee-1/memberships/member-1",
    undefined,
    "committee.update-membership",
    "committee-membership",
    "member-1",
  ],
  [
    "POST",
    "/api/council-committees/committee-1/memberships/member-1/end",
    undefined,
    "committee.end-membership",
    "committee-membership",
    "member-1",
  ],
  ["POST", "/api/council-business", undefined, "council-business.create", "council-business", undefined],
  ["PUT", "/api/council-business/business-1", undefined, "council-business.update", "council-business", "business-1"],
  [
    "PUT",
    "/api/council-business/business-1/classification",
    undefined,
    "council-business.reclassify",
    "council-business",
    "business-1",
  ],
  [
    "POST",
    "/api/council-business/business-1/schedule",
    undefined,
    "council-business.schedule",
    "council-business",
    "business-1",
  ],
  [
    "POST",
    "/api/council-business/business-1/decision",
    undefined,
    "council-business.attach-decision",
    "council-business",
    "business-1",
  ],
  [
    "DELETE",
    "/api/council-business/business-1/decision",
    undefined,
    "council-business.detach-decision",
    "council-business",
    "business-1",
  ],
  ["POST", "/api/council-meetings", undefined, "meeting.create", "council-meeting", undefined],
  ["PUT", "/api/council-meetings/meeting-1", undefined, "meeting.update", "council-meeting", "meeting-1"],
  [
    "PUT",
    "/api/council-meetings/meeting-1/status",
    { status: "scheduled" },
    "meeting.schedule",
    "council-meeting",
    "meeting-1",
  ],
  [
    "PUT",
    "/api/council-meetings/meeting-1/status",
    { status: "inProgress" },
    "meeting.open",
    "council-meeting",
    "meeting-1",
  ],
  [
    "PUT",
    "/api/council-meetings/meeting-1/status",
    { status: "closed" },
    "meeting.close",
    "council-meeting",
    "meeting-1",
  ],
  [
    "PUT",
    "/api/council-meetings/meeting-1/status",
    { status: "cancelled" },
    "meeting.cancel",
    "council-meeting",
    "meeting-1",
  ],
  [
    "PUT",
    "/api/council-meetings/meeting-1/status",
    { status: "invented" },
    "meeting.change-status",
    "council-meeting",
    "meeting-1",
  ],
  [
    "PUT",
    "/api/council-meetings/meeting-1/officers",
    undefined,
    "meeting.set-officers",
    "council-meeting",
    "meeting-1",
  ],
  [
    "PUT",
    "/api/council-meetings/meeting-1/attendance",
    { memberId: "member-1", status: "present" },
    "meeting.record-attendance",
    "council-meeting",
    "meeting-1",
  ],
  [
    "PUT",
    "/api/council-meetings/meeting-1/agenda-order",
    undefined,
    "meeting.reorder-agenda",
    "council-meeting",
    "meeting-1",
  ],
  [
    "POST",
    "/api/council-meetings/meeting-1/quorum-failure",
    undefined,
    "meeting.record-quorum-failure",
    "council-meeting",
    "meeting-1",
  ],
  ["POST", "/api/council-meetings/meeting-1/reconvene", undefined, "meeting.reconvene", "council-meeting", "meeting-1"],
  [
    "POST",
    "/api/council-meetings/meeting-1/late-business",
    undefined,
    "meeting.add-late-business",
    "council-meeting",
    "meeting-1",
  ],
  [
    "POST",
    "/api/council-meetings/meeting-1/minutes/finalize",
    undefined,
    "meeting.finalize-minutes",
    "council-meeting",
    "meeting-1",
  ],
  [
    "POST",
    "/api/council-meetings/meeting-1/agenda-items/item-1/start",
    undefined,
    "agenda-item.start",
    "agenda-item",
    "item-1",
  ],
  [
    "POST",
    "/api/council-meetings/meeting-1/agenda-items/item-1/complete",
    undefined,
    "agenda-item.complete",
    "agenda-item",
    "item-1",
  ],
  [
    "PUT",
    "/api/council-meetings/meeting-1/agenda-items/item-1/notes",
    undefined,
    "agenda-item.save-notes",
    "agenda-item",
    "item-1",
  ],
  [
    "DELETE",
    "/api/council-meetings/meeting-1/agenda-items/item-1",
    undefined,
    "agenda-item.remove",
    "agenda-item",
    "item-1",
  ],
  ["POST", "/api/council-meetings/meeting-1/ballots", undefined, "ballot.record", "ballot", null],
  ["DELETE", "/api/council-meetings/meeting-1/ballots/ballot-1", undefined, "ballot.cancel", "ballot", "ballot-1"],
  ["POST", "/api/resources/texts", undefined, "resource.create-text", "resource", undefined],
  ["POST", "/api/resources/remotes", undefined, "resource.create-remote", "resource", undefined],
  ["POST", "/api/resources/geographic", undefined, "resource.create-geographic", "resource", undefined],
  ["POST", "/api/resources/spreadsheets", undefined, "resource.create-spreadsheet", "resource", undefined],
  ["POST", "/api/resources/spreadsheets/import", undefined, "resource.import-spreadsheet", "resource", undefined],
  ["PUT", "/api/resources/resource-1/geography", undefined, "resource.update-geography", "resource", "resource-1"],
  ["PUT", "/api/resources/resource-1/spreadsheet", undefined, "resource.update-spreadsheet", "resource", "resource-1"],
  ["POST", "/api/resources/legal-references", undefined, "resource.create-legal-reference", "resource", undefined],
  [
    "POST",
    "/api/resources/resource-1/legal-reference/resolve",
    undefined,
    "resource.resolve-legal-reference",
    "resource",
    "resource-1",
  ],
  [
    "POST",
    "/api/resources/resource-1/legal-reference/refresh",
    undefined,
    "resource.refresh-legal-reference",
    "resource",
    "resource-1",
  ],
  ["POST", "/api/resources/documents", undefined, "resource.create-document", "resource", undefined],
  ["POST", "/api/resources/editor-assets", undefined, "resource.create-editor-asset", "resource", undefined],
  ["POST", "/api/resources/resource-1/promote", undefined, "resource.promote-editor-asset", "resource", "resource-1"],
  ["PUT", "/api/resources/resource-1", undefined, "resource.update", "resource", "resource-1"],
  ["DELETE", "/api/resources/resource-1", undefined, "resource.delete", "resource", "resource-1"],
  ["POST", "/api/resources/paths", undefined, "workspace.create-folder", "workspace-folder", null],
  [
    "PUT",
    "/api/resources/paths",
    { folderPath: "seed", name: "examples" },
    "workspace.rename-folder",
    "workspace-folder",
    "seed",
  ],
  ["POST", "/api/users", { roles: ["reader"], councilMemberId: "member-1" }, "user.create", "user", null],
  ["PUT", "/api/users/user-1/roles", { roles: ["reader"] }, "user.assign-role", "user", "user-1"],
  ["POST", "/api/users/user-1/disable", undefined, "user.disable", "user", "user-1"],
  ["PUT", "/api/settings", undefined, "settings.update", "hall-settings", "hall"],
  ["POST", "/api/templates", undefined, "template.create", "template", undefined],
  ["POST", "/api/templates/preview", undefined, "template.preview", "template", undefined],
  ["POST", "/api/templates/template-1/generate", undefined, "template.generate", "template", "template-1"],
  ["PUT", "/api/templates/template-1", undefined, "template.update", "template", "template-1"],
  ["DELETE", "/api/templates/template-1", undefined, "template.delete", "template", "template-1"],
] as const;

const nonAuditedCommandCases = [
  ["POST", "/api/resources/legal-references/search"],
  ["POST", "/api/templates/preview-pdf"],
] as const;

describe("API command policy", () => {
  it("is exhaustive over the shared action-name authority", () => {
    expect(Object.keys(apiCommandPolicies).sort()).toEqual([...apiActionNames].sort());
    const auditedActions = apiActionNames.filter((action) => apiCommandPolicies[action].auditTargetType !== null);
    expect(new Set(auditCases.map(([, , , action]) => action))).toEqual(new Set(auditedActions));
  });

  it("assigns the independently specified permission set to every command", () => {
    const expected = new Map<ApiActionName, readonly ApiPermission[]>();
    for (const [permissions, actions] of actionsByPermissions) {
      for (const action of actions) {
        expect(expected.has(action)).toBe(false);
        expected.set(action, permissions);
      }
    }
    expect(new Set(expected.keys())).toEqual(new Set(apiActionNames));
    for (const action of apiActionNames) expect(apiCommandPolicies[action].permissions).toEqual(expected.get(action));
  });

  it.each(auditCases)("classifies %s %s as %s", (method, path, body, action, targetType, targetId) => {
    expect(resolveAuditIntent({ method, path, body })).toMatchObject({ action, targetType, targetId });
  });

  it("does not invent an audit action for reads or unknown routes", () => {
    expect(resolveAuditIntent({ method: "GET", path: "/api/resources/resource-1" })).toBeNull();
    expect(resolveAuditIntent({ method: "HEAD", path: "/api/resources/resource-1" })).toBeNull();
    expect(resolveAuditIntent({ method: "OPTIONS", path: "/api/resources/resource-1" })).toBeNull();
    expect(resolveAuditIntent({ method: "POST", path: "/api/unknown-command" })).toBeNull();
    expect(resolveAuditIntent({ method: "POST", path: "/api/templates/preview-pdf" })).toBeNull();
    expect(resolveAuditIntent({ method: "POST", path: "/api/resources/legal-references/search" })).toBeNull();
    expect(resolveAuditIntent({ method: "POST", path: "/prefix/api/resources/texts" })).toBeNull();
    expect(resolveAuditIntent({ method: "POST", path: "/apiresources/texts" })).toBeNull();
    expect(resolveAuditIntent({ method: "POST", path: "/resources/texts" })).toMatchObject({
      action: "resource.create-text",
    });
    expect(resolveAuditIntent({ method: "POST", path: "/api//resources//texts" })).toMatchObject({
      action: "resource.create-text",
    });
    expect(resolveAuditIntent({ method: "POST", path: "/api/resources" })).toBeNull();
    expect(resolveAuditIntent({ method: "POST", path: "/api/resources/resource-1/resolve" })).toBeNull();
    expect(resolveAuditIntent({ method: "POST", path: "/api/resources/resource-1/other/resolve" })).toBeNull();
    expect(resolveAuditIntent({ method: "POST", path: "/api/resources/resource-1/other/refresh" })).toBeNull();
    expect(resolveAuditIntent({ method: "POST", path: "/api/resources/resource-1/legal-reference/other" })).toBeNull();
    expect(resolveAuditIntent({ method: "POST", path: "/api/resources/other/search" })).toBeNull();
    expect(resolveAuditIntent({ method: "PATCH", path: "/api/resources/resource-1" })).toBeNull();
    expect(resolveAuditIntent({ method: "POST", path: "/api/council-business/business-1" })).toBeNull();
    expect(resolveAuditIntent({ method: "DELETE", path: "/api/users/user-1/roles" })).toBeNull();
    expect(
      resolveAuditIntent({
        method: "POST",
        path: "/api/council-meetings/meeting-1/agenda-items/item-1/unexpected",
      }),
    ).toBeNull();
    expect(
      resolveAuditIntent({ method: "PUT", path: "/api/council-meetings/meeting-1/agenda-items/item-1/unexpected" }),
    ).toBeNull();
    expect(resolveAuditIntent({ method: "POST", path: "/api/council-meetings/meeting-1/other/finalize" })).toBeNull();
    expect(resolveAuditIntent({ method: "POST", path: "/api/council-meetings/meeting-1/minutes/other" })).toBeNull();
    expect(resolveAuditIntent({ method: "DELETE", path: "/api/council-business/business-1/other" })).toBeNull();
    expect(
      resolveAuditIntent({ method: "PUT", path: "/api/council-committees/committee-1/other/member-1" }),
    ).toBeNull();
    expect(
      resolveAuditIntent({ method: "POST", path: "/api/council-committees/committee-1/other/member-1/end" }),
    ).toBeNull();
    expect(resolveAuditIntent({ method: "POST", path: "/api/resources/other/import" })).toBeNull();
    expect(resolveAuditIntent({ method: "PUT", path: "/api/users/user-1/other" })).toBeNull();
    expect(resolveAuditIntent({ method: "POST", path: "/api/auth/unknown" })).toBeNull();
    expect(
      resolveAuditIntent({ method: "PUT", path: "/api/council-meetings/meeting-1/status", body: undefined }),
    ).toMatchObject({ action: "meeting.change-status" });
  });

  it("targets logout audit at the authenticated session being deleted", () => {
    expect(resolveAuditIntent({ method: "POST", path: "/api/auth/logout", sessionId: "session-1" })).toMatchObject({
      action: "session.logout",
      targetType: "session",
      targetId: "session-1",
    });
  });

  it("rejects every unsupported method and malformed variant of a command route", () => {
    const commandRoutes = [...auditCases.map(([method, path]) => [method, path] as const), ...nonAuditedCommandCases];
    const methods = ["GET", "HEAD", "OPTIONS", "PATCH"] as const;
    for (const [expectedMethod, path] of commandRoutes) {
      for (const method of methods) {
        expect(resolveAuditIntent({ method, path })).toBeNull();
      }
      expect(resolveAuditIntent({ method: expectedMethod, path: `${path}/unexpected` })).toBeNull();
    }
  });

  it("preserves the command details that make an audit event useful", () => {
    expect(
      resolveAuditIntent({
        method: "PUT",
        path: "/api/council-meetings/meeting-1/attendance",
        body: {
          memberId: "member-1",
          status: "represented",
          proxyHolderMemberId: "member-2",
          proxyDocumentId: "document-1",
          expectedVersion: 3,
        },
      }),
    ).toEqual({
      action: "meeting.record-attendance",
      targetType: "council-meeting",
      targetId: "meeting-1",
      details: {
        memberId: "member-1",
        status: "represented",
        proxyHolderMemberId: "member-2",
        proxyDocumentId: "document-1",
        expectedVersion: 3,
      },
    });
    expect(
      resolveAuditIntent({
        method: "POST",
        path: "/api/users",
        body: { roles: ["reader"], councilMemberId: "member-1" },
      }),
    ).toMatchObject({ details: { roles: ["reader"], councilMemberId: "member-1" } });
    expect(
      resolveAuditIntent({ method: "PUT", path: "/api/users/user-1/roles", body: { roles: ["reader"] } }),
    ).toMatchObject({ details: { roles: ["reader"] } });
    expect(
      resolveAuditIntent({ method: "POST", path: "/api/resources/paths", body: { parentPath: "seed", name: "tests" } }),
    ).toMatchObject({ details: { parentPath: "seed", name: "tests" } });
    expect(resolveAuditIntent({ method: "PUT", path: "/api/resources/paths", body: null })).toMatchObject({
      targetId: null,
      details: { name: undefined },
    });
    expect(resolveAuditIntent({ method: "POST", path: "/api/users", body: [] })).toMatchObject({
      details: undefined,
    });
    expect(resolveAuditIntent({ method: "POST", path: "/api/users", body: "not-an-object" })).toMatchObject({
      details: undefined,
    });
    expect(
      resolveAuditIntent({ method: "PUT", path: "/api/council-meetings/meeting-1/attendance", body: null }),
    ).toMatchObject({ details: undefined });
  });

  it("allows every command to an administrator and only unauthenticated session commands without a principal", () => {
    for (const action of apiActionNames) {
      expect(actionIsPermitted(admin, action)).toBe(true);
      expect(actionIsPermitted(undefined, action)).toBe(apiCommandPolicies[action].permissions.length === 0);
    }
  });

  it("applies the catalogued permission boundary to representative commands", () => {
    const principal = (permissions: ApiPrincipal["permissions"]): ApiPrincipal => ({ ...admin, permissions });
    expect(actionIsPermitted(principal(["workspace.read"]), "template.preview")).toBe(true);
    expect(actionIsPermitted(principal(["workspace.read"]), "resource.create-text")).toBe(false);
    expect(actionIsPermitted(principal(["workspace.write"]), "resource.create-spreadsheet")).toBe(true);
    expect(actionIsPermitted(principal(["meetings.prepare"]), "meeting.schedule")).toBe(true);
    expect(actionIsPermitted(principal(["meetings.prepare"]), "meeting.open")).toBe(false);
    expect(actionIsPermitted(principal(["meetings.conduct"]), "meeting.open")).toBe(true);
    expect(actionIsPermitted(principal(["users.manage"]), "user.create")).toBe(true);
    expect(actionIsPermitted(principal(["settings.manage"]), "settings.update")).toBe(true);
    expect(actionIsPermitted(principal(["contacts.manage"]), "contact.create")).toBe(true);
    expect(actionIsPermitted(principal(["members.manage"]), "member.create")).toBe(true);
    expect(actionIsPermitted(principal(["meetings.prepare"]), "meeting.change-status")).toBe(true);
    expect(actionIsPermitted(principal(["meetings.conduct"]), "meeting.change-status")).toBe(true);
    expect(actionIsPermitted(principal(["workspace.write"]), "meeting.change-status")).toBe(false);
  });

  it("fails closed at the HTTP boundary and continues only when the action is permitted", () => {
    const response = {
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;
    const request = (principal: ApiPrincipal | undefined) =>
      ({ principal, originalUrl: "/api/resources/texts", requestId: "request-1" }) as Request;
    const authorize = requireActionPermission("resource.create-text");

    authorize(request(undefined), response, next);
    expect(response.status).toHaveBeenLastCalledWith(401);
    expect(response.json).toHaveBeenLastCalledWith(expect.objectContaining({ code: "authentication_required" }));
    expect(next).not.toHaveBeenCalled();

    authorize(request({ ...admin, permissions: ["workspace.read"] }), response, next);
    expect(response.status).toHaveBeenLastCalledWith(403);
    expect(response.json).toHaveBeenLastCalledWith(expect.objectContaining({ code: "permission_denied" }));
    expect(next).not.toHaveBeenCalled();

    authorize(request({ ...admin, permissions: ["workspace.write"] }), response, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
