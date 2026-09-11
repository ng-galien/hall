// TODO REMOVE_STALE: temporary action audit identity.
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
  principal?: { id: string };
};

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
    if (method === "POST" && !id) return auditIntent("meeting.provision-initial");
    if (method === "PUT" && id && child === "schedule" && !childId) return auditIntent("meeting.schedule", id);
    if (method === "POST" && id && child === "agenda-reopening" && !childId)
      return auditIntent("meeting.reopen-agenda", id);
    if (method === "POST" && id && child === "notice-message" && !childId)
      return auditIntent("meeting.generate-notice-message", id);
    if (method === "POST" && id && child === "agenda-freeze" && !childId)
      return auditIntent("meeting.freeze-agenda", id);
    if (method === "POST" && id && child === "notices" && !childId) return auditIntent("meeting.generate-notice", id);
    if (method === "PUT" && id && child === "prepare" && !childId) return auditIntent("meeting.prepare", id);
    if (method === "POST" && id && child === "attendance-events" && !childId)
      return auditIntent("meeting.record-attendance-events", id);
    if (method === "POST" && id && child === "quorum-observations" && !childId)
      return auditIntent("meeting.record-quorum", id);
    if (method === "POST" && id && child === "reconvocations" && !childId)
      return auditIntent("meeting.record-reconvocation", id);
    if (method === "PUT" && id && child === "officers" && !childId) return auditIntent("meeting.set-officers", id);
    if (method === "POST" && id && child === "council-business" && !childId) {
      return auditIntent(
        "meeting.create-and-schedule-business",
        null,
        body && { councilMeetingId: id, kind: body.kind },
      );
    }
    if (method === "POST" && id && child === "open-questions" && !childId)
      return auditIntent("meeting.add-open-question", id);
    if (method === "POST" && id && child === "record-opening" && !childId)
      return auditIntent("meeting.record-opening", id);
    if (method === "POST" && id && child === "stale" && !childId) return auditIntent("meeting.mark-stale", id);
    if (method === "POST" && id && child === "close" && !childId) return auditIntent("meeting.close", id);
    if (method === "POST" && id && child === "agenda-items" && !childId) {
      return auditIntent("agenda-item.schedule", null);
    }
    if (method === "POST" && id && child === "agenda-items" && childId === "from-prepared" && !operation)
      return auditIntent("agenda-item.schedule-prepared", null, { councilMeetingId: id });
    if (id && child === "agenda-items" && childId) {
      if (method === "PATCH" && operation === "notes") return auditIntent("agenda-item.update-notes", childId);
      if (method === "POST" && operation === "recusals") return auditIntent("agenda-item.record-recusal", childId);
      if (method === "POST" && operation === "adjourn") return auditIntent("agenda-item.adjourn", childId);
      if (method === "POST" && operation === "start") return auditIntent("agenda-item.start", childId);
      if (method === "POST" && operation === "complete") return auditIntent("agenda-item.complete", childId);
      if (method === "POST" && operation === "reprogram") return auditIntent("agenda-item.reprogram", childId);
      if (method === "DELETE" && !operation) return auditIntent("agenda-item.deprogram", childId);
      return null;
    }
    if (method === "POST" && id && child === "attendance" && !childId) {
      return auditIntent(
        "meeting.record-attendance",
        id,
        body && { attendanceCount: Array.isArray(body.attendance) ? body.attendance.length : undefined },
      );
    }
    if (method === "PUT" && id && child === "agenda-order" && !childId)
      return auditIntent("meeting.reorder-agenda", id);
    return null;
  }

  if (root === "minutes" && id && !childId) {
    if (method === "PATCH" && child === "draft") return auditIntent("minutes.update-draft", id);
    if (method === "POST" && child === "generate") return auditIntent("minutes.generate", id);
  }
  if (root === "council-business") {
    if (method === "DELETE" && id && !child) return auditIntent("council-business.delete", id);
    if (method === "POST" && id && child === "prepared-subjects" && !childId)
      return auditIntent("council-business.create-prepared-subject", id);
    if (method === "POST" && id === "import-bundle" && !child) return auditIntent("council-business.import-bundle");
    if (method === "POST" && !id) return auditIntent("council-business.create");
    if (method === "POST" && id && child === "resources" && !childId) {
      return auditIntent("council-business.associate-resource", id, body && { resourceId: body.resourceId });
    }
    if (method === "POST" && id && child === "resources" && childId === "dissociate" && !operation) {
      return auditIntent("council-business.dissociate-resource", id, body && { resourceId: body.resourceId });
    }
    if (method === "PUT" && id && child === "resource-order" && !childId) {
      return auditIntent(
        "council-business.reorder-resources",
        id,
        body && {
          resourceCount: Array.isArray(body.resourceIds) ? body.resourceIds.length : undefined,
        },
      );
    }
    if (method === "POST" && id && child === "agenda-items" && childId === "council-decision-proposals" && !operation) {
      return auditIntent(
        "council-business.schedule-decision-proposal",
        null,
        body && {
          councilBusinessId: id,
          councilMeetingId: body.councilMeetingId,
        },
      );
    }
    if (method === "POST" && id && child === "agenda-items" && childId === "open-questions" && !operation) {
      return auditIntent(
        "council-business.schedule-open-question",
        null,
        body && {
          councilBusinessId: id,
          councilMeetingId: body.councilMeetingId,
        },
      );
    }
    return null;
  }

  if (root === "ballot-previews") {
    if (method === "POST" && !id) return auditIntent("ballot.preview", null);
    if (method === "POST" && id && child === "confirm" && !childId) return auditIntent("ballot.confirm", id);
    return null;
  }

  if (root === "council-delegations") {
    if (method === "POST" && !id) return auditIntent("delegation.create");
    if (method === "PUT" && id && !child) return auditIntent("delegation.update", id);
    if (method === "POST" && id && child === "archive" && !childId) return auditIntent("delegation.archive", id);
    if (method === "POST" && id && child === "memberships" && !childId)
      return auditIntent("delegation.add-membership", null);
    if (method === "PUT" && id && child === "memberships" && childId && !operation)
      return auditIntent("delegation.update-membership", childId);
    if (method === "POST" && id && child === "memberships" && childId && operation === "end")
      return auditIntent("delegation.end-membership", childId);
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
    if (method === "POST" && !id) return auditIntent("resource.create");
    if (method === "PATCH" && id && child === "location" && !childId) return auditIntent("resource.relocate", id);
    if (method === "PATCH" && id && child === "metadata" && !childId)
      return auditIntent("resource.update-metadata", id);
    if (method === "PUT" && id && child === "content" && !childId) return auditIntent("resource.update-content", id);
    if (method === "PUT" && id && child === "binary" && !childId)
      return auditIntent("resource.replace-document-content", id);
    if (method === "POST" && id === "spreadsheets" && child === "import" && !childId)
      return auditIntent("resource.import-spreadsheet");
    if (method === "POST" && id === "documents" && !child) return auditIntent("resource.create-document");
    if (method === "POST" && id === "editor-assets" && !child) return auditIntent("resource.create-editor-asset");
    if (method === "POST" && id && child === "legal-reference" && childId === "resolve" && !operation)
      return auditIntent("resource.resolve-legal-reference", id);
    if (method === "POST" && id && child === "legal-reference" && childId === "refresh" && !operation)
      return auditIntent("resource.refresh-legal-reference", id);
    if (method === "DELETE" && id && !child) return auditIntent("resource.delete", id);
    return null;
  }

  if (root === "users") {
    if (method === "PUT" && id && !child) return auditIntent("user.update", id, body && { contactId: body.contactId });
    if (method === "POST" && id && child === "reset-password" && !childId)
      return auditIntent("user.reset-password", id);
    if (method === "POST" && !id)
      return auditIntent(
        "user.create",
        null,
        body && {
          roles: Array.isArray(body.roles) ? body.roles : undefined,
          contactId: body.contactId ?? null,
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
    if (id === "change-password") return auditIntent("session.change-password", request.principal?.id ?? null);
    if (id === "logout") return auditIntent("session.logout", request.sessionId ?? null);
    return null;
  }
  if (root === "council-members") {
    if (method === "POST" && !id) return auditIntent("member.create", null);
    if (method === "PUT" && id && !child) return auditIntent("member.update", id);
    return null;
  }
  if (root === "council-terms") {
    return method === "PUT" && !id ? auditIntent("council-term.configure", "active") : null;
  }
  if (root === "contacts") {
    if (method === "POST" && !id) return auditIntent("contact.create", null);
    if (method === "PUT" && id && !child) return auditIntent("contact.update", id);
    if (method === "POST" && id && child === "archive" && !childId) return auditIntent("contact.archive", id);
    return null;
  }
  if (root === "council-decisions") {
    if (method === "PUT" && id && child === "draft" && !childId) return auditIntent("decision.update-draft", id);
    if (method === "POST" && id && child === "freeze" && !childId) return auditIntent("decision.freeze", id);
    return null;
  }
  return null;
}
