// TODO REMOVE_STALE: temporary action audit coverage.
import { apiActionNames } from "@hall/api-contract";
import { describe, expect, it } from "vitest";
import { apiCommandPolicies } from "./apiCommandPolicy.js";
import { resolveAuditIntent } from "./apiCommandResolution.js";

const auditCases = [
  ["POST", "/api/mail", undefined, "mail.create", "mail-message", undefined],
  ["POST", "/api/mail/prepare", undefined, "mail.prepare", "mail-message", undefined],
  ["POST", "/api/mail/mail-1/copy", undefined, "mail.copy", "mail-message", "mail-1"],
  ["PUT", "/api/mail/mail-1", undefined, "mail.update", "mail-message", "mail-1"],
  ["POST", "/api/mail/mail-1/delete", undefined, "mail.delete", "mail-message", "mail-1"],
  ["POST", "/api/mail/mail-1/attachments", undefined, "mail.attach", "mail-message", "mail-1"],
  ["POST", "/api/mail/mail-1/attachments/upload", undefined, "mail.upload-attachment", "mail-message", "mail-1"],
  ["POST", "/api/mail/mail-1/attachments/remove", undefined, "mail.remove-attachment", "mail-message", "mail-1"],
  ["POST", "/api/mail/mail-1/send", undefined, "mail.send", "mail-message", "mail-1"],
  [
    "POST",
    "/api/mail/mail-1/submissions/submission-1/verification",
    undefined,
    "mail.verify-submission",
    "mail-message",
    "mail-1",
  ],
  ["POST", "/api/mail-recipient-groups", undefined, "mail-group.create", "mail-recipient-group", undefined],
  ["PUT", "/api/mail-recipient-groups/group-1", undefined, "mail-group.update", "mail-recipient-group", "group-1"],
  [
    "POST",
    "/api/mail-recipient-groups/group-1/delete",
    undefined,
    "mail-group.delete",
    "mail-recipient-group",
    "group-1",
  ],
  ["POST", "/api/roles", undefined, "role.create", "authorization-role", undefined],
  ["PUT", "/api/roles/role-1", undefined, "role.update", "authorization-role", "role-1"],
  ["DELETE", "/api/roles/role-1", undefined, "role.delete", "authorization-role", "role-1"],
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
    "/api/council-meetings/meeting-1/agenda-revision-reset",
    undefined,
    "meeting.reset-agenda-revision",
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
    "POST",
    "/api/council-meetings/meeting-1/agenda-revision",
    undefined,
    "meeting.establish-agenda-revision",
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
    "/api/council-business/prepared-subjects/councilDecisionProposal/subject-1/move",
    { targetCouncilBusinessId: "business-2", preview: true },
    "council-business.move-subject",
    "council-business",
    null,
  ],
  [
    "POST",
    "/api/council-business/business-1/merge",
    { targetCouncilBusinessId: "business-2", preview: false },
    "council-business.merge",
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
  [
    "POST",
    "/api/council-meetings/meeting-1/closed-sessions",
    undefined,
    "meeting.record-closed-session",
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
  ["POST", "/api/users", { roles: ["councillor"], contactId: "member-1" }, "user.create", "user", null],
  ["PUT", "/api/users/user-1/roles", { roles: ["councillor"] }, "user.assign-role", "user", "user-1"],
  ["POST", "/api/users/user-1/disable", undefined, "user.disable", "user", "user-1"],
  ["POST", "/api/users/user-1/revoke-access", undefined, "user.revoke-access", "user", "user-1"],
  ["POST", "/api/users/user-1/reactivate", undefined, "user.reactivate", "user", "user-1"],
  ["POST", "/api/users/passphrases", undefined, "user.generate-passphrase", "user", undefined],
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
        body: { roles: ["councillor"], contactId: "member-1" },
      }),
    ).toMatchObject({ details: { roles: ["councillor"], contactId: "member-1" } });
    expect(
      resolveAuditIntent({ method: "PUT", path: "/api/users/user-1/roles", body: { roles: ["councillor"] } }),
    ).toMatchObject({ details: { roles: ["councillor"] } });
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
});
