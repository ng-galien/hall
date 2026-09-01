import type { ApiActionName } from "@hall/api-contract";
import { type AuditTargetType, apiCommandPolicies } from "./apiCommandPolicy.js";

export interface AuditIntent {
  action: ApiActionName;
  targetType: AuditTargetType;
  targetId?: string | null;
  details?: Record<string, unknown>;
}

type AuditRequest = {
  method: string;
  path: string;
  body?: unknown;
  sessionId?: string;
};

const meetingStatusActions = {
  scheduled: "meeting.schedule",
  inProgress: "meeting.open",
  closed: "meeting.close",
  cancelled: "meeting.cancel",
} as const satisfies Record<string, ApiActionName>;

export function meetingStatusAction(status: keyof typeof meetingStatusActions): ApiActionName {
  return meetingStatusActions[status];
}

function requestBody(value: unknown): Record<string, unknown> | undefined {
  if (value === null || Array.isArray(value) || typeof value !== "object") return undefined;
  return value as Record<string, unknown>;
}

function auditIntent(
  action: ApiActionName,
  targetId?: string | null,
  details?: Record<string, unknown>,
): AuditIntent | null {
  const targetType = apiCommandPolicies[action].auditTargetType;
  return targetType === null ? null : { action, targetType, targetId, details };
}

export function resolveAuditIntent(request: AuditRequest): AuditIntent | null {
  const path = request.path.startsWith("/api/") ? request.path.slice("/api/".length) : request.path.replace(/^\/+/, "");
  const [root, id, child, childId, operation, ...extra] = path.split("/").filter(Boolean);
  if (extra.length > 0) return null;
  const body = requestBody(request.body);
  const method = request.method;

  if (root === "council-meetings") {
    if (method === "POST" && !id) return auditIntent("meeting.create");
    if (method === "PUT" && id && !child) return auditIntent("meeting.update", id);
    if (method === "PUT" && id && child === "status" && !childId) {
      const status = String(body?.status);
      return auditIntent(
        status in meetingStatusActions
          ? meetingStatusAction(status as keyof typeof meetingStatusActions)
          : "meeting.change-status",
        id,
      );
    }
    if (id && child === "agenda-items" && childId) {
      if (method === "POST" && operation === "start") return auditIntent("agenda-item.start", childId);
      if (method === "POST" && operation === "complete") return auditIntent("agenda-item.complete", childId);
      if (method === "PUT" && operation === "notes") return auditIntent("agenda-item.save-notes", childId);
      if (method === "DELETE" && !operation) return auditIntent("agenda-item.remove", childId);
      return null;
    }
    if (id && child === "ballots") {
      if (method === "POST" && !childId) return auditIntent("ballot.record", null);
      if (method === "DELETE" && childId && !operation) return auditIntent("ballot.cancel", childId);
      return null;
    }
    if (method === "POST" && id && child === "late-business" && !childId)
      return auditIntent("meeting.add-late-business", id);
    if (method === "PUT" && id && child === "attendance" && !childId) {
      return auditIntent(
        "meeting.record-attendance",
        id,
        body && {
          memberId: body.memberId,
          status: body.status,
          proxyHolderMemberId: body.proxyHolderMemberId ?? null,
          proxyDocumentId: body.proxyDocumentId ?? null,
          expectedVersion: body.expectedVersion ?? null,
        },
      );
    }
    if (method === "PUT" && id && child === "officers" && !childId) return auditIntent("meeting.set-officers", id);
    if (method === "PUT" && id && child === "agenda-order" && !childId)
      return auditIntent("meeting.reorder-agenda", id);
    if (method === "POST" && id && child === "quorum-failure" && !childId)
      return auditIntent("meeting.record-quorum-failure", id);
    if (method === "POST" && id && child === "reconvene" && !childId) return auditIntent("meeting.reconvene", id);
    if (method === "POST" && id && child === "minutes" && childId === "finalize" && !operation)
      return auditIntent("meeting.finalize-minutes", id);
    return null;
  }

  if (root === "council-business") {
    if (method === "POST" && !id) return auditIntent("council-business.create");
    if (method === "PUT" && id && !child) return auditIntent("council-business.update", id);
    if (method === "PUT" && id && child === "classification" && !childId)
      return auditIntent("council-business.reclassify", id);
    if (method === "POST" && id && child === "schedule" && !childId)
      return auditIntent("council-business.schedule", id);
    if (method === "POST" && id && child === "decision" && !childId)
      return auditIntent("council-business.attach-decision", id);
    if (method === "DELETE" && id && child === "decision" && !childId)
      return auditIntent("council-business.detach-decision", id);
    return null;
  }

  if (root === "council-committees") {
    if (method === "POST" && !id) return auditIntent("committee.create");
    if (method === "PUT" && id && !child) return auditIntent("committee.update", id);
    if (method === "POST" && id && child === "archive" && !childId) return auditIntent("committee.archive", id);
    if (method === "POST" && id && child === "memberships" && !childId)
      return auditIntent("committee.add-membership", null);
    if (method === "PUT" && id && child === "memberships" && childId && !operation)
      return auditIntent("committee.update-membership", childId);
    if (method === "POST" && id && child === "memberships" && childId && operation === "end")
      return auditIntent("committee.end-membership", childId);
    return null;
  }

  if (root === "resources") {
    if (id === "paths" && method === "POST" && !child)
      return auditIntent("workspace.create-folder", null, { parentPath: body?.parentPath, name: body?.name });
    if (id === "paths" && method === "PUT" && !child)
      return auditIntent("workspace.rename-folder", typeof body?.folderPath === "string" ? body.folderPath : null, {
        name: body?.name,
      });
    if (method === "POST" && id === "texts" && !child) return auditIntent("resource.create-text");
    if (method === "POST" && id === "remotes" && !child) return auditIntent("resource.create-remote");
    if (method === "POST" && id === "spreadsheets" && !child) return auditIntent("resource.create-spreadsheet");
    if (method === "POST" && id === "spreadsheets" && child === "import" && !childId)
      return auditIntent("resource.import-spreadsheet");
    if (method === "POST" && id === "geographic" && !child) return auditIntent("resource.create-geographic");
    if (method === "POST" && id === "legal-references" && !child) return auditIntent("resource.create-legal-reference");
    if (method === "POST" && id === "documents" && !child) return auditIntent("resource.create-document");
    if (method === "POST" && id === "editor-assets" && !child) return auditIntent("resource.create-editor-asset");
    if (method === "POST" && id && child === "promote" && !childId)
      return auditIntent("resource.promote-editor-asset", id);
    if (method === "PUT" && id && child === "geography" && !childId)
      return auditIntent("resource.update-geography", id);
    if (method === "PUT" && id && child === "spreadsheet" && !childId)
      return auditIntent("resource.update-spreadsheet", id);
    if (method === "POST" && id && child === "legal-reference" && childId === "resolve" && !operation)
      return auditIntent("resource.resolve-legal-reference", id);
    if (method === "POST" && id && child === "legal-reference" && childId === "refresh" && !operation)
      return auditIntent("resource.refresh-legal-reference", id);
    if (method === "PUT" && id && !child) return auditIntent("resource.update", id);
    if (method === "DELETE" && id && !child) return auditIntent("resource.delete", id);
    return null;
  }

  if (root === "users") {
    if (method === "POST" && !id)
      return auditIntent(
        "user.create",
        null,
        body && {
          roles: Array.isArray(body.roles) ? body.roles : undefined,
          councilMemberId: body.councilMemberId ?? null,
        },
      );
    if (method === "PUT" && id && child === "roles" && !childId)
      return auditIntent("user.assign-role", id, body && { roles: Array.isArray(body.roles) ? body.roles : undefined });
    if (method === "POST" && id && child === "disable" && !childId) return auditIntent("user.disable", id);
    return null;
  }
  if (root === "settings") return method === "PUT" && !id ? auditIntent("settings.update", "hall") : null;
  if (root === "templates") {
    if (method === "POST" && id === "preview" && !child) return auditIntent("template.preview");
    if (method === "POST" && !id) return auditIntent("template.create");
    if (method === "POST" && id && child === "generate" && !childId) return auditIntent("template.generate", id);
    if (method === "PUT" && id && !child) return auditIntent("template.update", id);
    if (method === "DELETE" && id && !child) return auditIntent("template.delete", id);
    return null;
  }
  if (root === "auth") {
    if (method !== "POST" || child) return null;
    if (id === "bootstrap") return auditIntent("session.bootstrap");
    if (id === "login") return auditIntent("session.login");
    if (id === "logout") return auditIntent("session.logout", request.sessionId ?? null);
    return null;
  }
  if (root === "council-members") {
    if (method === "POST" && !id) return auditIntent("member.create", null);
    if (method === "PUT" && id && !child) return auditIntent("member.update", id);
    return null;
  }
  if (root === "council-decisions") {
    if (method === "POST" && !id) return auditIntent("decision.create", null);
    if (method === "PUT" && id && !child) return auditIntent("decision.update", id);
    return null;
  }
  return null;
}
