import type { ApiActionName, ApiPermission } from "@hall/api-contract";

export const auditTargetTypes = [
  "session",
  "contact",
  "council-member",
  "council-committee",
  "committee-membership",
  "council-decision",
  "resource",
  "workspace-folder",
  "council-business",
  "council-meeting",
  "agenda-item",
  "ballot",
  "user",
  "hall-settings",
  "template",
] as const;

export type AuditTargetType = (typeof auditTargetTypes)[number];

export interface ApiCommandPolicy {
  permissions: readonly ApiPermission[];
  auditTargetType: AuditTargetType | null;
}

const workspaceRead = ["workspace.read"] as const;
const workspaceWrite = ["workspace.write"] as const;
const meetingsPrepare = ["meetings.prepare"] as const;
const meetingsConduct = ["meetings.conduct"] as const;
const usersManage = ["users.manage"] as const;

export const apiCommandPolicies = {
  "session.bootstrap": { permissions: [], auditTargetType: "user" },
  "session.login": { permissions: [], auditTargetType: "session" },
  "session.logout": { permissions: [], auditTargetType: "session" },
  "contact.create": { permissions: ["contacts.manage"], auditTargetType: "contact" },
  "contact.update": { permissions: ["contacts.manage"], auditTargetType: "contact" },
  "contact.archive": { permissions: ["contacts.manage"], auditTargetType: "contact" },
  "member.create": { permissions: ["members.manage"], auditTargetType: "council-member" },
  "member.update": { permissions: ["members.manage"], auditTargetType: "council-member" },
  "committee.create": { permissions: meetingsPrepare, auditTargetType: "council-committee" },
  "committee.update": { permissions: meetingsPrepare, auditTargetType: "council-committee" },
  "committee.archive": { permissions: meetingsPrepare, auditTargetType: "council-committee" },
  "committee.add-membership": { permissions: meetingsPrepare, auditTargetType: "committee-membership" },
  "committee.update-membership": { permissions: meetingsPrepare, auditTargetType: "committee-membership" },
  "committee.end-membership": { permissions: meetingsPrepare, auditTargetType: "committee-membership" },
  "decision.create": { permissions: workspaceWrite, auditTargetType: "council-decision" },
  "decision.update": { permissions: workspaceWrite, auditTargetType: "council-decision" },
  "resource.create-text": { permissions: workspaceWrite, auditTargetType: "resource" },
  "resource.create-remote": { permissions: workspaceWrite, auditTargetType: "resource" },
  "resource.create-geographic": { permissions: workspaceWrite, auditTargetType: "resource" },
  "resource.create-spreadsheet": { permissions: workspaceWrite, auditTargetType: "resource" },
  "resource.import-spreadsheet": { permissions: workspaceWrite, auditTargetType: "resource" },
  "resource.update-geography": { permissions: workspaceWrite, auditTargetType: "resource" },
  "resource.update-spreadsheet": { permissions: workspaceWrite, auditTargetType: "resource" },
  "resource.search-legal-references": { permissions: workspaceRead, auditTargetType: null },
  "resource.create-legal-reference": { permissions: workspaceWrite, auditTargetType: "resource" },
  "resource.resolve-legal-reference": { permissions: workspaceWrite, auditTargetType: "resource" },
  "resource.refresh-legal-reference": { permissions: workspaceWrite, auditTargetType: "resource" },
  "resource.create-document": { permissions: workspaceWrite, auditTargetType: "resource" },
  "resource.create-editor-asset": { permissions: workspaceWrite, auditTargetType: "resource" },
  "resource.promote-editor-asset": { permissions: workspaceWrite, auditTargetType: "resource" },
  "resource.update": { permissions: workspaceWrite, auditTargetType: "resource" },
  "resource.delete": { permissions: workspaceWrite, auditTargetType: "resource" },
  "workspace.rename-folder": { permissions: workspaceWrite, auditTargetType: "workspace-folder" },
  "workspace.create-folder": { permissions: workspaceWrite, auditTargetType: "workspace-folder" },
  "council-business.create": { permissions: workspaceWrite, auditTargetType: "council-business" },
  "council-business.update": { permissions: workspaceWrite, auditTargetType: "council-business" },
  "council-business.reclassify": { permissions: workspaceWrite, auditTargetType: "council-business" },
  "council-business.schedule": { permissions: meetingsPrepare, auditTargetType: "council-business" },
  "council-business.attach-decision": { permissions: workspaceWrite, auditTargetType: "council-business" },
  "council-business.detach-decision": { permissions: workspaceWrite, auditTargetType: "council-business" },
  "meeting.create": { permissions: meetingsPrepare, auditTargetType: "council-meeting" },
  "meeting.update": { permissions: meetingsPrepare, auditTargetType: "council-meeting" },
  "meeting.change-status": {
    permissions: ["meetings.prepare", "meetings.conduct"],
    auditTargetType: "council-meeting",
  },
  "meeting.schedule": { permissions: meetingsPrepare, auditTargetType: "council-meeting" },
  "meeting.open": { permissions: meetingsConduct, auditTargetType: "council-meeting" },
  "meeting.close": { permissions: meetingsConduct, auditTargetType: "council-meeting" },
  "meeting.finalize-minutes": { permissions: meetingsPrepare, auditTargetType: "council-meeting" },
  "meeting.cancel": { permissions: meetingsPrepare, auditTargetType: "council-meeting" },
  "meeting.record-quorum-failure": { permissions: meetingsConduct, auditTargetType: "council-meeting" },
  "meeting.reconvene": { permissions: meetingsConduct, auditTargetType: "council-meeting" },
  "meeting.add-late-business": { permissions: meetingsConduct, auditTargetType: "council-meeting" },
  "meeting.set-officers": {
    permissions: ["meetings.prepare", "meetings.conduct"],
    auditTargetType: "council-meeting",
  },
  "meeting.record-attendance": { permissions: meetingsConduct, auditTargetType: "council-meeting" },
  "meeting.reorder-agenda": { permissions: meetingsPrepare, auditTargetType: "council-meeting" },
  "agenda-item.remove": { permissions: meetingsPrepare, auditTargetType: "agenda-item" },
  "agenda-item.start": { permissions: meetingsConduct, auditTargetType: "agenda-item" },
  "agenda-item.save-notes": { permissions: meetingsConduct, auditTargetType: "agenda-item" },
  "agenda-item.complete": { permissions: meetingsConduct, auditTargetType: "agenda-item" },
  "ballot.record": { permissions: meetingsConduct, auditTargetType: "ballot" },
  "ballot.cancel": { permissions: meetingsConduct, auditTargetType: "ballot" },
  "user.create": { permissions: usersManage, auditTargetType: "user" },
  "user.disable": { permissions: usersManage, auditTargetType: "user" },
  "user.assign-role": { permissions: usersManage, auditTargetType: "user" },
  "settings.update": { permissions: ["settings.manage"], auditTargetType: "hall-settings" },
  "template.create": { permissions: workspaceWrite, auditTargetType: "template" },
  "template.update": { permissions: workspaceWrite, auditTargetType: "template" },
  "template.delete": { permissions: workspaceWrite, auditTargetType: "template" },
  "template.preview": { permissions: workspaceRead, auditTargetType: "template" },
  "template.preview-pdf": { permissions: workspaceRead, auditTargetType: null },
  "template.generate": { permissions: workspaceRead, auditTargetType: "template" },
} as const satisfies Record<ApiActionName, ApiCommandPolicy>;
