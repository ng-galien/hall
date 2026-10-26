// TODO REMOVE_STALE: temporary action permission and audit coverage.
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
    "council-business.update",
    "meetings.read",
    "meetings.prepare",
    "meetings.conduct",
    "audit.read",
  ],
  contactId: null,
};

const actionsByPermissions = [
  [[], ["session.bootstrap", "session.login", "session.logout", "session.change-password"]],
  [["contacts.manage"], ["contact.create", "contact.update", "contact.archive"]],
  [["members.manage"], ["member.create", "member.update"]],
  [
    ["workspace.read"],
    [
      "council-business.export-bundle",
      "resource.search-legal-references",
      "resource.generate-event-invitation",
      "template.preview",
      "template.preview-pdf",
      "template.generate",
    ],
  ],
  [
    ["workspace.write", "personal-workspace.write"],
    [
      "resource.create",
      "resource.relocate",
      "resource.update-metadata",
      "resource.update-content",
      "resource.replace-document-content",
      "resource.import-spreadsheet",
      "resource.convert-spreadsheet-table",
      "resource.import-geographic-layer",
      "resource.link-geographic-layer",
      "resource.unlink-geographic-layer",
      "resource.create-geographic-feature-note",
      "resource.resolve-legal-reference",
      "resource.refresh-legal-reference",
      "resource.create-document",
      "resource.create-editor-asset",
      "resource.delete",
    ],
  ],
  [
    ["workspace.write"],
    [
      "resource.import-municipal-property",
      "council-business.create",
      "council-business.import-bundle",
      "council-business.delete",
      "council-business.create-prepared-subject",
      "template.create",
      "template.update",
      "template.delete",
    ],
  ],
  [
    ["council-business.update"],
    [
      "council-business.associate-committee",
      "council-business.dissociate-committee",
      "council-business.associate-resource",
      "council-business.dissociate-resource",
      "council-business.reorder-resources",
    ],
  ],
  [
    ["meetings.prepare"],
    [
      "delegation.create",
      "delegation.update",
      "delegation.archive",
      "delegation.add-membership",
      "delegation.update-membership",
      "delegation.end-membership",
      "committee.create",
      "committee.update",
      "committee.archive",
      "committee.add-membership",
      "committee.update-membership",
      "committee.end-membership",
      "meeting.provision-initial",
      "meeting.schedule",
      "meeting.prepare",
      "meeting.set-officers",
      "meeting.create-and-schedule-business",
      "meeting.reorder-agenda",
      "meeting.freeze-agenda",
      "meeting.reopen-agenda",
      "meeting.generate-notice",
      "meeting.generate-notice-message",
      "agenda-item.schedule-prepared",
      "decision.update-draft",
      "decision.freeze",
      "minutes.update-draft",
      "minutes.generate",
      "agenda-item.schedule",
      "agenda-item.deprogram",
      "agenda-item.reprogram",
      "council-business.schedule-decision-proposal",
      "council-business.schedule-open-question",
    ],
  ],
  [
    ["meetings.conduct"],
    [
      "meeting.record-opening",
      "meeting.add-open-question",
      "meeting.close",
      "meeting.mark-stale",
      "meeting.record-attendance",
      "agenda-item.start",
      "agenda-item.complete",
      "agenda-item.update-notes",
      "agenda-item.adjourn",
      "agenda-item.record-recusal",
      "meeting.record-attendance-events",
      "meeting.record-quorum",
      "meeting.record-reconvocation",
      "meeting.record-officer-change",
      "meeting.declare-auxiliary-attendance",
      "meeting.correct-auxiliary-attendance",
      "ballot.preview",
      "ballot.confirm",
    ],
  ],
  [["users.manage"], ["user.create", "user.disable", "user.assign-role", "user.update", "user.reset-password"]],
  [["settings.manage"], ["council-term.configure", "settings.update"]],
] as const satisfies readonly (readonly [readonly ApiPermission[], readonly ApiActionName[]])[];

const auditCases = [
  [
    "POST",
    "/api/council-business/business-1/prepared-subjects",
    undefined,
    "council-business.create-prepared-subject",
    "council-business",
    "business-1",
  ],
  [
    "POST",
    "/api/council-meetings/meeting-1/agenda-items/from-prepared",
    undefined,
    "agenda-item.schedule-prepared",
    "agenda-item",
    null,
  ],
  [
    "POST",
    "/api/council-meetings/meeting-1/agenda-freeze",
    undefined,
    "meeting.freeze-agenda",
    "council-meeting",
    "meeting-1",
  ],
  [
    "POST",
    "/api/council-meetings/meeting-1/agenda-reopening",
    undefined,
    "meeting.reopen-agenda",
    "council-meeting",
    "meeting-1",
  ],
  [
    "POST",
    "/api/council-meetings/meeting-1/notices",
    undefined,
    "meeting.generate-notice",
    "council-meeting",
    "meeting-1",
  ],
  [
    "POST",
    "/api/council-meetings/meeting-1/notice-message",
    undefined,
    "meeting.generate-notice-message",
    "council-meeting",
    "meeting-1",
  ],
  [
    "POST",
    "/api/council-meetings/meeting-1/agenda-items/item-1/recusals",
    undefined,
    "agenda-item.record-recusal",
    "agenda-item",
    "item-1",
  ],
  ["PATCH", "/api/minutes/minutes-1/draft", undefined, "minutes.update-draft", "minutes", "minutes-1"],
  ["POST", "/api/minutes/minutes-1/generate", undefined, "minutes.generate", "minutes", "minutes-1"],
  [
    "PATCH",
    "/api/council-meetings/meeting-1/agenda-items/item-1/notes",
    undefined,
    "agenda-item.update-notes",
    "agenda-item",
    "item-1",
  ],
  ["PUT", "/api/council-meetings/meeting-1/prepare", undefined, "meeting.prepare", "council-meeting", "meeting-1"],
  [
    "PUT",
    "/api/council-meetings/meeting-1/officers",
    undefined,
    "meeting.set-officers",
    "council-meeting",
    "meeting-1",
  ],
  [
    "POST",
    "/api/council-meetings/meeting-1/council-business",
    undefined,
    "meeting.create-and-schedule-business",
    "council-business",
    null,
  ],
  [
    "POST",
    "/api/council-meetings/meeting-1/agenda-items/item-1/adjourn",
    undefined,
    "agenda-item.adjourn",
    "agenda-item",
    "item-1",
  ],
  ["POST", "/api/auth/bootstrap", undefined, "session.bootstrap", "user", undefined],
  ["POST", "/api/auth/login", undefined, "session.login", "session", undefined],
  ["POST", "/api/auth/change-password", undefined, "session.change-password", "user", null],
  ["PUT", "/api/users/user-1", {}, "user.update", "user", "user-1"],
  ["POST", "/api/users/user-1/reset-password", {}, "user.reset-password", "user", "user-1"],
  ["POST", "/api/auth/logout", undefined, "session.logout", "session", null],
  ["POST", "/api/contacts", undefined, "contact.create", "contact", null],
  ["PUT", "/api/contacts/contact-1", undefined, "contact.update", "contact", "contact-1"],
  ["POST", "/api/contacts/contact-1/archive", undefined, "contact.archive", "contact", "contact-1"],
  ["POST", "/api/council-members", undefined, "member.create", "council-member", null],
  ["PUT", "/api/council-members/member-1", undefined, "member.update", "council-member", "member-1"],
  ["PUT", "/api/council-terms", undefined, "council-term.configure", "council-term", "active"],
  [
    "PUT",
    "/api/council-decisions/decision-1/draft",
    undefined,
    "decision.update-draft",
    "council-decision",
    "decision-1",
  ],
  ["POST", "/api/council-decisions/decision-1/freeze", undefined, "decision.freeze", "council-decision", "decision-1"],
  ["POST", "/api/council-delegations", undefined, "delegation.create", "council-delegation", undefined],
  ["PUT", "/api/council-delegations/committee-1", undefined, "delegation.update", "council-delegation", "committee-1"],
  [
    "POST",
    "/api/council-delegations/committee-1/archive",
    undefined,
    "delegation.archive",
    "council-delegation",
    "committee-1",
  ],
  [
    "POST",
    "/api/council-delegations/committee-1/memberships",
    undefined,
    "delegation.add-membership",
    "delegation-membership",
    null,
  ],
  [
    "PUT",
    "/api/council-delegations/committee-1/memberships/member-1",
    undefined,
    "delegation.update-membership",
    "delegation-membership",
    "member-1",
  ],
  [
    "POST",
    "/api/council-delegations/committee-1/memberships/member-1/end",
    undefined,
    "delegation.end-membership",
    "delegation-membership",
    "member-1",
  ],
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
  [
    "DELETE",
    "/api/council-business/business-1",
    undefined,
    "council-business.delete",
    "council-business",
    "business-1",
  ],
  ["POST", "/api/council-business", undefined, "council-business.create", "council-business", undefined],
  [
    "POST",
    "/api/council-business/import-bundle",
    undefined,
    "council-business.import-bundle",
    "council-business",
    undefined,
  ],
  [
    "POST",
    "/api/council-business/business-1/resources",
    { resourceId: "resource-1" },
    "council-business.associate-resource",
    "council-business",
    "business-1",
  ],
  [
    "POST",
    "/api/council-business/business-1/committees",
    { committeeId: "committee-1" },
    "council-business.associate-committee",
    "council-business",
    "business-1",
  ],
  [
    "POST",
    "/api/council-business/business-1/committees/dissociate",
    { committeeId: "committee-1" },
    "council-business.dissociate-committee",
    "council-business",
    "business-1",
  ],
  [
    "POST",
    "/api/council-business/business-1/resources/dissociate",
    { resourceId: "resource-1" },
    "council-business.dissociate-resource",
    "council-business",
    "business-1",
  ],
  [
    "PUT",
    "/api/council-business/business-1/resource-order",
    { resourceIds: ["resource-1"] },
    "council-business.reorder-resources",
    "council-business",
    "business-1",
  ],
  [
    "POST",
    "/api/council-business/business-1/agenda-items/council-decision-proposals",
    { councilMeetingId: "meeting-1", position: 2 },
    "council-business.schedule-decision-proposal",
    "agenda-item",
    null,
  ],
  [
    "POST",
    "/api/council-business/business-1/agenda-items/open-questions",
    { councilMeetingId: "meeting-1", position: 3 },
    "council-business.schedule-open-question",
    "agenda-item",
    null,
  ],
  ["POST", "/api/council-meetings", undefined, "meeting.provision-initial", "council-meeting", undefined],
  ["POST", "/api/council-meetings/meeting-1/agenda-items", undefined, "agenda-item.schedule", "agenda-item", null],
  ["PUT", "/api/council-meetings/meeting-1/schedule", undefined, "meeting.schedule", "council-meeting", "meeting-1"],
  [
    "POST",
    "/api/council-meetings/meeting-1/record-opening",
    undefined,
    "meeting.record-opening",
    "council-meeting",
    "meeting-1",
  ],
  [
    "POST",
    "/api/council-meetings/meeting-1/open-questions",
    undefined,
    "meeting.add-open-question",
    "council-meeting",
    "meeting-1",
  ],
  ["POST", "/api/council-meetings/meeting-1/close", undefined, "meeting.close", "council-meeting", "meeting-1"],
  ["POST", "/api/council-meetings/meeting-1/stale", undefined, "meeting.mark-stale", "council-meeting", "meeting-1"],
  [
    "POST",
    "/api/council-meetings/meeting-1/attendance",
    { attendance: [{ councilMemberId: "member-1", status: "present" }] },
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
    "POST",
    "/api/council-meetings/meeting-1/agenda-items/item-1/reprogram",
    undefined,
    "agenda-item.reprogram",
    "agenda-item",
    "item-1",
  ],
  [
    "DELETE",
    "/api/council-meetings/meeting-1/agenda-items/item-1",
    undefined,
    "agenda-item.deprogram",
    "agenda-item",
    "item-1",
  ],
  [
    "POST",
    "/api/council-meetings/meeting-1/attendance-events",
    undefined,
    "meeting.record-attendance-events",
    "council-meeting",
    "meeting-1",
  ],
  [
    "POST",
    "/api/council-meetings/meeting-1/quorum-observations",
    undefined,
    "meeting.record-quorum",
    "council-meeting",
    "meeting-1",
  ],
  [
    "POST",
    "/api/council-meetings/meeting-1/reconvocations",
    undefined,
    "meeting.record-reconvocation",
    "council-meeting",
    "meeting-1",
  ],
  [
    "POST",
    "/api/council-meetings/meeting-1/officer-changes",
    undefined,
    "meeting.record-officer-change",
    "council-meeting",
    "meeting-1",
  ],
  [
    "POST",
    "/api/council-meetings/meeting-1/auxiliary-attendances",
    undefined,
    "meeting.declare-auxiliary-attendance",
    "council-meeting",
    "meeting-1",
  ],
  [
    "PATCH",
    "/api/council-meetings/meeting-1/auxiliary-attendances",
    undefined,
    "meeting.correct-auxiliary-attendance",
    "council-meeting",
    "meeting-1",
  ],
  ["POST", "/api/ballot-previews", undefined, "ballot.preview", "ballot-preview", null],
  ["POST", "/api/ballot-previews/preview-1/confirm", undefined, "ballot.confirm", "ballot-preview", "preview-1"],
  ["POST", "/api/resources", undefined, "resource.create", "resource", undefined],
  ["PATCH", "/api/resources/resource-1/location", undefined, "resource.relocate", "resource", "resource-1"],
  ["PATCH", "/api/resources/resource-1/metadata", undefined, "resource.update-metadata", "resource", "resource-1"],
  ["PUT", "/api/resources/resource-1/content", undefined, "resource.update-content", "resource", "resource-1"],
  [
    "POST",
    "/api/resources/resource-1/event-invitation",
    { method: "request" },
    "resource.generate-event-invitation",
    "resource",
    "resource-1",
  ],
  ["PUT", "/api/resources/resource-1/binary", undefined, "resource.replace-document-content", "resource", "resource-1"],
  ["POST", "/api/resources/spreadsheets/import", undefined, "resource.import-spreadsheet", "resource", undefined],
  [
    "POST",
    "/api/resources/geographic-layers/import",
    undefined,
    "resource.import-geographic-layer",
    "resource",
    undefined,
  ],
  ["PUT", "/api/resources/map-1/overlays", undefined, "resource.link-geographic-layer", "resource", "map-1"],
  ["POST", "/api/resources/map-1/overlays/unlink", undefined, "resource.unlink-geographic-layer", "resource", "map-1"],
  [
    "POST",
    "/api/resources/layer-1/feature-notes",
    undefined,
    "resource.create-geographic-feature-note",
    "resource",
    "layer-1",
  ],
  [
    "POST",
    "/api/resources/geographic-layers/municipal-property/import",
    undefined,
    "resource.import-municipal-property",
    "resource",
    undefined,
  ],
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
  ["DELETE", "/api/resources/resource-1", undefined, "resource.delete", "resource", "resource-1"],
  ["POST", "/api/users", { roles: ["reader"], contactId: "member-1" }, "user.create", "user", null],
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
  ["POST", "/api/resources/spreadsheets/table"],
  ["POST", "/api/templates/preview-pdf"],
] as const;

// @verifies-requirement HALL-FR-WSP-390
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
    expect(resolveAuditIntent({ method: "POST", path: "/resources/texts" })).toBeNull();
    expect(resolveAuditIntent({ method: "POST", path: "/api//resources//texts" })).toBeNull();
    expect(resolveAuditIntent({ method: "POST", path: "/api/resources" })).toMatchObject({
      action: "resource.create",
    });
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
    expect(resolveAuditIntent({ method: "PUT", path: "/api/council-meetings/meeting-1/status" })).toBeNull();
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
    const supportedMethods = new Map<string, Set<string>>();
    for (const [method, path] of commandRoutes) {
      const supported = supportedMethods.get(path) ?? new Set<string>();
      supported.add(method);
      supportedMethods.set(path, supported);
    }
    for (const [expectedMethod, path] of commandRoutes) {
      for (const method of methods) {
        if (supportedMethods.get(path)?.has(method)) continue;
        expect(resolveAuditIntent({ method, path })).toBeNull();
      }
      expect(resolveAuditIntent({ method: expectedMethod, path: `${path}/unexpected` })).toBeNull();
    }
  });

  it("preserves the command details that make an audit event useful", () => {
    expect(
      resolveAuditIntent({
        method: "POST",
        path: "/api/council-meetings/meeting-1/attendance",
        body: {
          attendance: [
            { councilMemberId: "member-1", status: "present" },
            {
              councilMemberId: "member-2",
              status: "represented",
              proxyHolderCouncilMemberId: "member-1",
              proxyDocumentId: "document-1",
            },
          ],
        },
      }),
    ).toEqual({
      action: "meeting.record-attendance",
      targetType: "council-meeting",
      targetId: "meeting-1",
      details: { attendanceCount: 2 },
    });
    expect(
      resolveAuditIntent({
        method: "POST",
        path: "/api/users",
        body: { roles: ["reader"], contactId: "member-1" },
      }),
    ).toMatchObject({ details: { roles: ["reader"], contactId: "member-1" } });
    expect(
      resolveAuditIntent({ method: "PUT", path: "/api/users/user-1/roles", body: { roles: ["reader"] } }),
    ).toMatchObject({ details: { roles: ["reader"] } });
    expect(resolveAuditIntent({ method: "POST", path: "/api/users", body: [] })).toMatchObject({
      details: undefined,
    });
    expect(resolveAuditIntent({ method: "POST", path: "/api/users", body: "not-an-object" })).toMatchObject({
      details: undefined,
    });
    expect(
      resolveAuditIntent({ method: "POST", path: "/api/council-meetings/meeting-1/attendance", body: null }),
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
    expect(actionIsPermitted(principal(["workspace.read"]), "resource.create")).toBe(false);
    expect(actionIsPermitted(principal(["workspace.write"]), "resource.create")).toBe(true);
    expect(actionIsPermitted(principal(["meetings.prepare"]), "meeting.schedule")).toBe(true);
    expect(actionIsPermitted(principal(["meetings.prepare"]), "meeting.record-opening")).toBe(false);
    expect(actionIsPermitted(principal(["meetings.conduct"]), "meeting.record-opening")).toBe(true);
    expect(actionIsPermitted(principal(["users.manage"]), "user.create")).toBe(true);
    expect(actionIsPermitted(principal(["settings.manage"]), "settings.update")).toBe(true);
    expect(actionIsPermitted(principal(["contacts.manage"]), "contact.create")).toBe(true);
    expect(actionIsPermitted(principal(["members.manage"]), "member.create")).toBe(true);
    expect(actionIsPermitted(principal(["meetings.prepare"]), "agenda-item.reprogram")).toBe(true);
    expect(actionIsPermitted(principal(["workspace.write"]), "agenda-item.reprogram")).toBe(false);
  });

  it("fails closed at the HTTP boundary and continues only when the action is permitted", () => {
    const response = {
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;
    const request = (principal: ApiPrincipal | undefined) =>
      ({ principal, originalUrl: "/api/resources", requestId: "request-1" }) as Request;
    const authorize = requireActionPermission("resource.create");

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
