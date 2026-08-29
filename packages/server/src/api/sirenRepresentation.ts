import {
  type ApiActionName,
  type ApiPermission,
  SIREN_MEDIA_TYPE,
  type SirenAction,
  type SirenEmbeddedEntity,
  type SirenEntity,
  type SirenLink,
} from "@hall/api-contract";
import { deriveBallotVoters, evaluateBallot, type MeetingAggregate } from "@hall/domain";
import type { NextFunction, Request, Response } from "express";
import { acceptedDocumentExtensions } from "../domain/documentPolicy.js";
import { hasPermission } from "../security/authorization.js";

function isSirenEntity(value: unknown): value is SirenEntity {
  return Boolean(
    value && typeof value === "object" && "links" in value && Array.isArray((value as { links?: unknown }).links),
  );
}

function pathWithoutQuery(request: Request): string {
  return request.originalUrl.split("?", 1)[0] || request.path;
}

function pathWithQuery(request: Request): string {
  return request.originalUrl.split("#", 1)[0] || request.path;
}

function meetingReferenceFromRequest(request: Request): string | null {
  const contextualReference = request.res?.locals.meetingReference;
  if (typeof contextualReference === "string") return contextualReference;
  return pathWithoutQuery(request).match(/\/api\/council-meetings\/([^/]+)/)?.[1] ?? null;
}

function classFromPath(request: Request, value: unknown): string {
  const path = pathWithoutQuery(request);
  if (path.endsWith("/auth/status")) return "authentication-status";
  if (["/auth/session", "/auth/logout", "/auth/login", "/auth/bootstrap"].some((suffix) => path.endsWith(suffix))) {
    return "session";
  }
  if (path.includes("/auth/")) return "authentication";
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if ("meetingId" in object && "business" in object && "position" in object) return "agenda-item";
    if ("meetingId" in object && "memberId" in object && "version" in object) return "attendance";
    if ("meetingId" in object && "method" in object && "result" in object) return "ballot";
  }
  if (path.startsWith("/api/users")) return "user";
  if (path.startsWith("/api/audit-events")) return "audit-event";
  if (path.startsWith("/api/settings")) return "hall-settings";
  if (path.startsWith("/api/templates/references")) return "template-reference";
  if (path.startsWith("/api/templates/preview")) return "template-preview";
  if (path.startsWith("/api/templates")) return "template";
  if (path.startsWith("/api/council-members")) return "council-member";
  if (path.startsWith("/api/council-decisions")) return "council-decision";
  if (path.startsWith("/api/council-committees") && path.includes("/memberships/")) {
    return "committee-membership";
  }
  if (path.startsWith("/api/council-committees")) return "council-committee";
  if (path.startsWith("/api/council-business")) return "council-business";
  if (path.startsWith("/api/resources")) return "resource";
  if (path.startsWith("/api/council-meetings")) {
    if (path.includes("/ballots")) return "ballot";
    if (path.includes("/agenda-items")) return "agenda-item";
    if (path.includes("/attendance")) return "attendance";
    return "council-meeting";
  }
  if (value && typeof value === "object" && "permissions" in value) return "session";
  return "entity";
}

function action(name: ApiActionName, method: SirenAction["method"], href: string, title?: string): SirenAction {
  return { name, method, href, type: "application/json", title };
}

function statusAction(
  name: "meeting.schedule" | "meeting.open" | "meeting.close" | "meeting.cancel",
  href: string,
  status: "scheduled" | "inProgress" | "closed" | "cancelled",
  title: string,
): SirenAction {
  return { ...action(name, "PUT", href, title), fields: [{ name: "status", type: "text", value: status }] };
}

function permitted(request: Request, permission: ApiPermission): boolean {
  return hasPermission(request.principal, permission);
}

function collectionActions(request: Request, entityClass: string): SirenAction[] {
  if (entityClass === "resource" && permitted(request, "workspace.write")) {
    return [
      action("resource.create-text", "POST", "/api/resources/texts", "Create a text"),
      {
        ...action("resource.create-document", "POST", "/api/resources/documents", "Upload a document"),
        type: "multipart/form-data",
        fields: [
          {
            name: "file",
            type: "file",
            accept: acceptedDocumentExtensions.join(","),
          },
          { name: "title", type: "text" },
          { name: "folderPath", type: "text", value: "" },
          { name: "tags", type: "text", value: "" },
          { name: "meetingId", type: "text" },
          { name: "category", type: "text", value: "supporting" },
        ],
      },
    ];
  }
  if (entityClass === "council-business" && permitted(request, "workspace.write")) {
    return [action("council-business.create", "POST", "/api/council-business", "Create council business")];
  }
  if (entityClass === "council-committee" && permitted(request, "meetings.prepare")) {
    return [action("committee.create", "POST", "/api/council-committees", "Create a committee")];
  }
  if (entityClass === "council-meeting" && permitted(request, "meetings.prepare")) {
    return [action("meeting.create", "POST", "/api/council-meetings", "Create a meeting")];
  }
  if (entityClass === "council-decision" && permitted(request, "workspace.write")) {
    return [action("decision.create", "POST", "/api/council-decisions", "Create a council decision")];
  }
  if (entityClass === "council-member" && permitted(request, "members.manage")) {
    return [action("member.create", "POST", "/api/council-members", "Create a council member")];
  }
  if (entityClass === "user" && permitted(request, "users.manage")) {
    return [action("user.create", "POST", "/api/users", "Create a user")];
  }
  if (entityClass === "template") {
    const actions = permitted(request, "workspace.read")
      ? [action("template.preview", "POST", "/api/templates/preview", "Preview a template")]
      : [];
    if (permitted(request, "workspace.write")) {
      actions.unshift(action("template.create", "POST", "/api/templates", "Create a template"));
    }
    return actions;
  }
  return [];
}

function objectId(value: unknown): string | null {
  return value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : null;
}

function publicReference(entityClass: string, value: Record<string, unknown> | null): string | null {
  if (
    value &&
    ["resource", "council-business", "council-committee", "council-decision", "council-meeting"].includes(
      entityClass,
    ) &&
    typeof value.slug === "string"
  ) {
    return value.slug;
  }
  return objectId(value);
}

function primaryObject(entityClass: string, value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  if (entityClass === "council-business" && object.business && typeof object.business === "object") {
    return object.business as Record<string, unknown>;
  }
  if (entityClass === "council-committee" && object.committee && typeof object.committee === "object") {
    return object.committee as Record<string, unknown>;
  }
  if (entityClass === "resource" && object.resource && typeof object.resource === "object") {
    return object.resource as Record<string, unknown>;
  }
  if (entityClass === "agenda-item" && object.agendaItem && typeof object.agendaItem === "object") {
    return object.agendaItem as Record<string, unknown>;
  }
  if (entityClass === "ballot" && object.ballot && typeof object.ballot === "object") {
    return object.ballot as Record<string, unknown>;
  }
  if (entityClass === "council-meeting" && object.meeting && typeof object.meeting === "object") {
    return object.meeting as Record<string, unknown>;
  }
  return object;
}

function ballotPrerequisitesAreSatisfied(aggregate: MeetingAggregate): boolean {
  const submission = {
    type: "SUBMIT" as const,
    meetingStatus: aggregate.meeting.status,
    isReconvenedMeeting: aggregate.meeting.isReconvenedMeeting,
    chairMemberId: aggregate.meeting.chairMemberId,
    secretaryMemberId: aggregate.meeting.secretaryMemberId,
    participationEvidence: {
      rosterMemberIds: aggregate.rosterMemberIds,
      attendance: aggregate.attendance,
      quorum: aggregate.quorum,
    },
    recusedMemberIds: [],
    method: "secret" as const,
    totals: { votesFor: 0, votesAgainst: 0, abstentions: 0, notVoting: 0 },
  };
  const eligibleVoters = deriveBallotVoters(submission).length;
  return (
    evaluateBallot({ ...submission, totals: { ...submission.totals, notVoting: eligibleVoters } }) === "recordable"
  );
}

function objectActions(request: Request, entityClass: string, value: unknown): SirenAction[] {
  if (!value || typeof value !== "object") return [];
  const primary = primaryObject(entityClass, value);
  const id = objectId(primary);
  const reference = publicReference(entityClass, primary);
  if (entityClass === "hall-settings" && permitted(request, "settings.manage")) {
    return [action("settings.update", "PUT", "/api/settings", "Update Hall settings")];
  }
  if (entityClass === "resource" && id && reference && permitted(request, "workspace.write")) {
    const details = value as { councilBusiness?: unknown[]; snapshotted?: boolean; usedAsProxy?: boolean };
    const actions = [action("resource.update", "PUT", `/api/resources/${reference}`, "Update the resource")];
    if (
      Array.isArray(details.councilBusiness) &&
      details.councilBusiness.length === 0 &&
      details.snapshotted === false &&
      details.usedAsProxy === false
    ) {
      actions.push(action("resource.delete", "DELETE", `/api/resources/${reference}`, "Delete the resource"));
    }
    return actions;
  }
  if (entityClass === "template" && id) {
    const actions = permitted(request, "workspace.write")
      ? [
          action("template.update", "PUT", `/api/templates/${id}`, "Update the template"),
          action("template.delete", "DELETE", `/api/templates/${id}`, "Delete the template"),
        ]
      : [];
    if (permitted(request, "workspace.read")) {
      actions.push(action("template.generate", "POST", `/api/templates/${id}/generate`, "Generate the output"));
    }
    return actions;
  }
  if (entityClass === "council-business" && id && reference && permitted(request, "workspace.write")) {
    const business = primary as { kind?: string; councilDecisionId?: string | null };
    const actions = [
      action(
        "council-business.reclassify",
        "PUT",
        `/api/council-business/${reference}/classification`,
        "Reclassify council business",
      ),
      action("council-business.update", "PUT", `/api/council-business/${reference}`, "Update council business"),
    ];
    const details = value as {
      occurrences?: Array<{
        meeting?: {
          id?: string;
          slug?: string;
          status?: string;
          quorumFailure?: boolean;
          isReconvenedMeeting?: boolean;
        };
        agendaItem?: { id?: string; status?: string; addedDuringSession?: boolean };
      }>;
    };
    const openOccurrence = details.occurrences?.find((candidate) =>
      ["scheduled", "inProgress"].includes(candidate.agendaItem?.status ?? ""),
    );
    const occurrencesKnown = Array.isArray(details.occurrences);
    const decisionBindingFrozen =
      openOccurrence?.agendaItem?.status === "inProgress" ||
      Boolean(openOccurrence?.meeting?.isReconvenedMeeting) ||
      Boolean(openOccurrence?.meeting?.quorumFailure);
    if (occurrencesKnown && !openOccurrence && permitted(request, "meetings.prepare")) {
      actions.push({
        ...action(
          "council-business.schedule",
          "POST",
          `/api/council-business/${reference}/schedule`,
          "Add to an agenda",
        ),
        fields: [
          { name: "meetingId", type: "text" },
          { name: "position", type: "number" },
        ],
      });
    }
    if (
      openOccurrence?.agendaItem?.status === "scheduled" &&
      openOccurrence.meeting?.id &&
      openOccurrence.agendaItem.id &&
      ["draft", "scheduled"].includes(openOccurrence.meeting.status ?? "") &&
      !openOccurrence.meeting.quorumFailure &&
      !openOccurrence.meeting.isReconvenedMeeting &&
      permitted(request, "meetings.prepare")
    ) {
      actions.push(
        action(
          "agenda-item.remove",
          "DELETE",
          `/api/council-meetings/${openOccurrence.meeting.slug ?? openOccurrence.meeting.id}/agenda-items/${openOccurrence.agendaItem.id}`,
          "Remove from the agenda",
        ),
      );
    }
    if (
      business.kind === "matter" &&
      occurrencesKnown &&
      !decisionBindingFrozen &&
      !openOccurrence?.agendaItem?.addedDuringSession
    ) {
      actions.push(
        business.councilDecisionId
          ? action(
              "council-business.detach-decision",
              "DELETE",
              `/api/council-business/${reference}/decision`,
              "Detach the decision",
            )
          : action(
              "council-business.attach-decision",
              "POST",
              `/api/council-business/${reference}/decision`,
              "Submit to a vote",
            ),
      );
    }
    return actions;
  }
  if (entityClass === "council-member" && id && permitted(request, "members.manage")) {
    return [action("member.update", "PUT", `/api/council-members/${id}`, "Update the council member")];
  }
  if (entityClass === "council-committee" && id && reference && permitted(request, "meetings.prepare")) {
    if (primary?.archivedAt) return [];
    return [
      action("committee.update", "PUT", `/api/council-committees/${reference}`, "Update the committee"),
      action("committee.archive", "POST", `/api/council-committees/${reference}/archive`, "Archive the committee"),
      action(
        "committee.add-membership",
        "POST",
        `/api/council-committees/${reference}/memberships`,
        "Add a committee member",
      ),
    ];
  }
  if (entityClass === "council-decision" && id && reference && permitted(request, "workspace.write")) {
    const status = primary && "status" in primary ? String(primary.status) : "";
    return ["draft", "ready", "scheduled"].includes(status) && primary?.contentEditable !== false
      ? [action("decision.update", "PUT", `/api/council-decisions/${reference}`, "Update the decision")]
      : [];
  }
  if (entityClass === "agenda-item" && id) {
    const payload = value as Record<string, unknown>;
    const meeting = payload.meeting;
    const agendaItems = Array.isArray(payload.agendaItems) ? payload.agendaItems : [];
    if (!meeting || typeof meeting !== "object") {
      if (
        permitted(request, "meetings.conduct") &&
        typeof primary?.meetingId === "string" &&
        primary.startedAt &&
        !primary.completedAt
      ) {
        return [
          action(
            "agenda-item.save-notes",
            "PUT",
            `/api/council-meetings/${meetingReferenceFromRequest(request) ?? primary.meetingId}/agenda-items/${id}/notes`,
          ),
          action(
            "agenda-item.complete",
            "POST",
            `/api/council-meetings/${meetingReferenceFromRequest(request) ?? primary.meetingId}/agenda-items/${id}/complete`,
          ),
        ];
      }
      return [];
    }
    const meetingId = objectId(meeting);
    const meetingReference = publicReference("council-meeting", meeting as Record<string, unknown>);
    if (!meetingId || !meetingReference) return [];
    const meetingStatus = "status" in meeting ? String(meeting.status) : "";
    const meetingComposable =
      ["draft", "scheduled"].includes(meetingStatus) &&
      !(meeting as Record<string, unknown>).quorumFailure &&
      !(meeting as Record<string, unknown>).isReconvenedMeeting;
    if (meetingComposable && permitted(request, "meetings.prepare")) {
      return [
        action(
          "agenda-item.remove",
          "DELETE",
          `/api/council-meetings/${meetingReference}/agenda-items/${id}`,
          "Remove from the agenda",
        ),
      ];
    }
    if (meetingStatus !== "inProgress" || !permitted(request, "meetings.conduct")) return [];
    const item = primary as Record<string, unknown>;
    if (item.completedAt) return [];
    if (item.startedAt) {
      return [
        action("agenda-item.save-notes", "PUT", `/api/council-meetings/${meetingReference}/agenda-items/${id}/notes`),
        action("agenda-item.complete", "POST", `/api/council-meetings/${meetingReference}/agenda-items/${id}/complete`),
      ];
    }
    const firstOpenItem = agendaItems.find(
      (candidate) => candidate && typeof candidate === "object" && !(candidate as Record<string, unknown>).completedAt,
    );
    return firstOpenItem && typeof firstOpenItem === "object" && objectId(firstOpenItem) === id
      ? [action("agenda-item.start", "POST", `/api/council-meetings/${meetingReference}/agenda-items/${id}/start`)]
      : [];
  }
  if (entityClass === "council-meeting") {
    const payload = value as Record<string, unknown>;
    const aggregate = primary ?? payload;
    const meetingId = objectId(aggregate);
    const meetingReference = publicReference("council-meeting", aggregate);
    if (!meetingId || !meetingReference) return [];
    const status = "status" in aggregate ? String(aggregate.status) : "";
    const actions: SirenAction[] = [];
    const reconvened = Boolean(aggregate.isReconvenedMeeting);
    if (status === "draft" && permitted(request, "meetings.prepare")) {
      actions.push(action("meeting.update", "PUT", `/api/council-meetings/${meetingReference}`, "Update the meeting"));
      if (
        typeof payload.activeMemberCount === "number" &&
        payload.activeMemberCount > 0 &&
        payload.agendaReady === true
      ) {
        actions.push(
          statusAction(
            "meeting.schedule",
            `/api/council-meetings/${meetingReference}/status`,
            "scheduled",
            "Schedule the meeting",
          ),
        );
      }
      actions.push(action("meeting.reorder-agenda", "PUT", `/api/council-meetings/${meetingReference}/agenda-order`));
      actions.push(
        statusAction(
          "meeting.cancel",
          `/api/council-meetings/${meetingReference}/status`,
          "cancelled",
          "Cancel the meeting",
        ),
      );
    }
    const quorumFailure = Boolean(aggregate.quorumFailure);
    if (status === "scheduled" && !quorumFailure && permitted(request, "meetings.prepare")) {
      actions.push(
        action("meeting.update", "PUT", `/api/council-meetings/${meetingReference}`, "Update the meeting"),
        statusAction(
          "meeting.cancel",
          `/api/council-meetings/${meetingReference}/status`,
          "cancelled",
          "Cancel the meeting",
        ),
      );
      if (!reconvened) {
        actions.push(action("meeting.reorder-agenda", "PUT", `/api/council-meetings/${meetingReference}/agenda-order`));
      }
    }
    if (
      status === "scheduled" &&
      !quorumFailure &&
      (permitted(request, "meetings.prepare") || permitted(request, "meetings.conduct"))
    ) {
      actions.push(action("meeting.set-officers", "PUT", `/api/council-meetings/${meetingReference}/officers`));
    }
    if (status === "scheduled" && quorumFailure && permitted(request, "meetings.conduct")) {
      actions.push(action("meeting.reconvene", "POST", `/api/council-meetings/${meetingReference}/reconvene`));
    }
    if (status === "scheduled" && !quorumFailure && permitted(request, "meetings.conduct")) {
      actions.push(action("meeting.record-attendance", "PUT", `/api/council-meetings/${meetingReference}/attendance`));
      const roster = Array.isArray(payload.rosterMemberIds) ? payload.rosterMemberIds : [];
      const attendance = Array.isArray(payload.attendance) ? payload.attendance : [];
      const complete =
        roster.length > 0 &&
        roster.every((memberId) =>
          attendance.some(
            (item) => item && typeof item === "object" && (item as Record<string, unknown>).memberId === memberId,
          ),
        );
      const quorum =
        payload.quorum && typeof payload.quorum === "object" ? (payload.quorum as { reached?: unknown }) : null;
      if (complete && quorum?.reached === false) {
        actions.push(
          action("meeting.record-quorum-failure", "POST", `/api/council-meetings/${meetingReference}/quorum-failure`),
        );
      }
      const physicallyPresent = new Set(
        attendance.flatMap((item) =>
          item &&
          typeof item === "object" &&
          (item as Record<string, unknown>).status === "present" &&
          typeof (item as Record<string, unknown>).memberId === "string"
            ? [(item as Record<string, unknown>).memberId as string]
            : [],
        ),
      );
      if (
        complete &&
        quorum?.reached === true &&
        typeof aggregate.chairMemberId === "string" &&
        typeof aggregate.secretaryMemberId === "string" &&
        physicallyPresent.has(aggregate.chairMemberId) &&
        physicallyPresent.has(aggregate.secretaryMemberId)
      ) {
        actions.push(
          statusAction(
            "meeting.open",
            `/api/council-meetings/${meetingReference}/status`,
            "inProgress",
            "Open the meeting",
          ),
        );
      }
    }
    if (status === "inProgress" && permitted(request, "meetings.conduct")) {
      actions.push(action("meeting.record-attendance", "PUT", `/api/council-meetings/${meetingReference}/attendance`));
      actions.push(
        action("meeting.add-late-business", "POST", `/api/council-meetings/${meetingReference}/late-business`),
      );
      const agendaItems = Array.isArray(payload.agendaItems) ? payload.agendaItems : [];
      const activeItem = agendaItems.find(
        (item) =>
          item &&
          typeof item === "object" &&
          Boolean((item as Record<string, unknown>).startedAt) &&
          !(item as Record<string, unknown>).completedAt,
      );
      const ballots = Array.isArray(payload.ballots) ? payload.ballots : [];
      const activeTopic =
        activeItem && typeof activeItem === "object" && (activeItem as Record<string, unknown>).business
          ? ((activeItem as Record<string, unknown>).business as Record<string, unknown>)
          : null;
      const activeDecisionId =
        activeTopic?.kind === "matter" && typeof activeTopic.councilDecisionId === "string"
          ? activeTopic.councilDecisionId
          : null;
      const activeItemId = activeItem && typeof activeItem === "object" ? objectId(activeItem) : null;
      const finalBallotExists = ballots.some((candidate) => {
        if (!candidate || typeof candidate !== "object") return false;
        const ballot = candidate as Record<string, unknown>;
        if (ballot.cancelledAt) return false;
        return activeDecisionId
          ? ballot.councilDecisionId === activeDecisionId
          : activeItemId !== null && ballot.agendaItemId === activeItemId;
      });
      if (
        activeItem &&
        ballotPrerequisitesAreSatisfied(payload as unknown as MeetingAggregate) &&
        !(activeItem as Record<string, unknown>).addedDuringSession &&
        activeTopic?.kind !== "openQuestion" &&
        !finalBallotExists
      ) {
        actions.push(action("ballot.record", "POST", `/api/council-meetings/${meetingReference}/ballots`));
      }
      actions.push(
        statusAction(
          "meeting.close",
          `/api/council-meetings/${meetingReference}/status`,
          "closed",
          "Close the meeting",
        ),
      );
    }
    if (status === "closed" && aggregate.minutesStatus === "draft" && permitted(request, "meetings.prepare")) {
      actions.push(
        action(
          "meeting.finalize-minutes",
          "POST",
          `/api/council-meetings/${meetingReference}/minutes/finalize`,
          "Finalize the minutes draft",
        ),
      );
    }
    return actions;
  }
  if (entityClass === "user" && id && permitted(request, "users.manage")) {
    const actions = [action("user.assign-role", "PUT", `/api/users/${id}/roles`, "Assign roles")];
    if (!primary?.protectedFromDisable && primary?.status === "active") {
      actions.push(action("user.disable", "POST", `/api/users/${id}/disable`, "Disable the user"));
    }
    return actions;
  }
  if (entityClass === "ballot" && id && permitted(request, "meetings.conduct")) {
    const payload = value as Record<string, unknown>;
    const meeting = payload.meeting;
    const agendaItems = Array.isArray(payload.agendaItems) ? payload.agendaItems : [];
    if (
      !meeting ||
      typeof meeting !== "object" ||
      (meeting as Record<string, unknown>).status !== "inProgress" ||
      primary?.cancelledAt
    ) {
      return [];
    }
    const ballot = primary as Record<string, unknown>;
    const meetingReference = publicReference("council-meeting", meeting as Record<string, unknown>);
    if (!meetingReference) return [];
    const matchingItem = agendaItems.find((candidate) => {
      if (!candidate || typeof candidate !== "object") return false;
      const item = candidate as Record<string, unknown>;
      if (typeof ballot.agendaItemId === "string") return objectId(item) === ballot.agendaItemId;
      const business = item.business;
      return (
        business &&
        typeof business === "object" &&
        (business as Record<string, unknown>).councilDecisionId === ballot.councilDecisionId
      );
    });
    return matchingItem &&
      typeof matchingItem === "object" &&
      (matchingItem as Record<string, unknown>).startedAt &&
      !(matchingItem as Record<string, unknown>).completedAt
      ? [action("ballot.cancel", "DELETE", `/api/council-meetings/${meetingReference}/ballots/${id}`)]
      : [];
  }
  if (entityClass === "session") {
    return request.sessionId ? [action("session.logout", "POST", "/api/auth/logout", "Sign out")] : [];
  }
  return [];
}

function canonicalHref(request: Request, entityClass: string, value: unknown): string {
  const primary = primaryObject(entityClass, value);
  const id = objectId(primary);
  if (entityClass === "session") return "/api/auth/session";
  if (!id) return pathWithQuery(request);
  if (entityClass === "user") return `/api/users/${id}`;
  if (entityClass === "audit-event") return `/api/audit-events/${id}`;
  if (entityClass === "council-member") return `/api/council-members/${id}`;
  if (entityClass === "committee-membership") {
    const committeeReference = pathWithoutQuery(request).match(/\/api\/council-committees\/([^/]+)/)?.[1];
    if (committeeReference) return `/api/council-committees/${committeeReference}/memberships/${id}`;
  }
  if (entityClass === "template-reference" && primary && typeof primary.type === "string") {
    const roots: Record<string, string> = {
      member: "council-members",
      resource: "resources",
      councilBusiness: "council-business",
      decision: "council-decisions",
      meeting: "council-meetings",
    };
    const root = roots[primary.type];
    if (root) return `/api/${root}/${id}`;
  }
  if (
    entityClass === "attendance" &&
    primary &&
    typeof primary.meetingId === "string" &&
    typeof primary.memberId === "string"
  ) {
    return `/api/council-meetings/${meetingReferenceFromRequest(request) ?? primary.meetingId}/attendance/${primary.memberId}`;
  }
  const payloadMeeting =
    value && typeof value === "object" && "meeting" in value && value.meeting && typeof value.meeting === "object"
      ? (value.meeting as Record<string, unknown>)
      : null;
  const meetingReference =
    publicReference("council-meeting", payloadMeeting) ??
    meetingReferenceFromRequest(request) ??
    (primary && typeof primary.meetingId === "string" ? primary.meetingId : null);
  if (entityClass === "agenda-item" && meetingReference) {
    return `/api/council-meetings/${meetingReference}/agenda-items/${id}`;
  }
  if (entityClass === "ballot" && meetingReference) {
    return `/api/council-meetings/${meetingReference}/ballots/${id}`;
  }
  const roots: Record<string, string> = {
    resource: "resources",
    "council-business": "council-business",
    "council-committee": "council-committees",
    "council-decision": "council-decisions",
    "council-meeting": "council-meetings",
    template: "templates",
  };
  const root = roots[entityClass];
  const reference = publicReference(entityClass, primary);
  return root && reference ? `/api/${root}/${reference}` : pathWithQuery(request);
}

function objectLinks(request: Request, entityClass: string, value: unknown): SirenLink[] {
  const links: SirenLink[] = [
    { rel: ["self"], href: canonicalHref(request, entityClass, value), type: SIREN_MEDIA_TYPE },
  ];
  const primary = primaryObject(entityClass, value);
  const id = objectId(primary);
  const reference = publicReference(entityClass, primary);
  if (entityClass === "resource" && id && reference && primary?.kind === "document") {
    const contentHref = `/api/resources/${reference}/content`;
    links.push({ rel: ["content"], href: contentHref, type: String(primary.mediaType) });
    const format = String(primary.format);
    if (["pdf", "jpeg", "png"].includes(format)) {
      links.push({ rel: ["preview"], href: contentHref, type: String(primary.mediaType) });
    } else if (["docx", "odt", "xlsx", "pptx", "txt", "csv"].includes(format)) {
      links.push({ rel: ["preview"], href: `/api/resources/${reference}/preview`, type: "application/pdf" });
    }
  }
  return links;
}

function embeddedEntity(request: Request, entityClass: string, value: Record<string, unknown>): SirenEmbeddedEntity {
  const actions = objectActions(request, entityClass, value);
  return {
    rel: ["item"],
    class: [entityClass],
    properties: value,
    actions: actions.length > 0 ? actions : undefined,
    links: objectLinks(request, entityClass, value),
  };
}

function meetingEntities(request: Request, payload: Record<string, unknown>): SirenEmbeddedEntity[] | undefined {
  const meeting = payload.meeting;
  const agendaItems = payload.agendaItems;
  if (!meeting || typeof meeting !== "object" || !Array.isArray(agendaItems)) return undefined;
  const meetingId = objectId(meeting);
  const meetingReference = publicReference("council-meeting", meeting as Record<string, unknown>);
  if (!meetingId || !meetingReference) return undefined;
  const meetingStatus = "status" in meeting ? String(meeting.status) : "";
  const meetingComposable =
    ["draft", "scheduled"].includes(meetingStatus) &&
    !(meeting as Record<string, unknown>).quorumFailure &&
    !(meeting as Record<string, unknown>).isReconvenedMeeting;
  const firstOpenItem = agendaItems.find(
    (candidate) => candidate && typeof candidate === "object" && !(candidate as { completedAt?: unknown }).completedAt,
  ) as Record<string, unknown> | undefined;

  const agendaEntities = agendaItems.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Record<string, unknown>;
    const itemId = objectId(item);
    if (!itemId) return [];
    const actions: SirenAction[] = [];
    if (meetingComposable && permitted(request, "meetings.prepare")) {
      actions.push(
        action(
          "agenda-item.remove",
          "DELETE",
          `/api/council-meetings/${meetingReference}/agenda-items/${itemId}`,
          "Remove from the agenda",
        ),
      );
    }
    if (meetingStatus === "inProgress" && permitted(request, "meetings.conduct") && !item.completedAt) {
      if (item.startedAt) {
        actions.push(
          action(
            "agenda-item.save-notes",
            "PUT",
            `/api/council-meetings/${meetingReference}/agenda-items/${itemId}/notes`,
          ),
          action(
            "agenda-item.complete",
            "POST",
            `/api/council-meetings/${meetingReference}/agenda-items/${itemId}/complete`,
          ),
        );
      } else if (firstOpenItem === item) {
        actions.push(
          action("agenda-item.start", "POST", `/api/council-meetings/${meetingReference}/agenda-items/${itemId}/start`),
        );
      }
    }
    return [
      {
        rel: ["agenda-item"],
        class: ["agenda-item"],
        properties: item,
        actions: actions.length > 0 ? actions : undefined,
        links: [
          {
            rel: ["self"],
            href: `/api/council-meetings/${meetingReference}/agenda-items/${itemId}`,
            type: SIREN_MEDIA_TYPE,
          },
        ],
      },
    ];
  });
  const attendanceEntities = Array.isArray(payload.attendance)
    ? payload.attendance.flatMap((candidate) =>
        candidate && typeof candidate === "object"
          ? [embeddedEntity(request, "attendance", candidate as Record<string, unknown>)]
          : [],
      )
    : [];
  const ballotEntities = Array.isArray(payload.ballots)
    ? payload.ballots.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const ballot = candidate as Record<string, unknown>;
        const ballotId = objectId(ballot);
        if (!ballotId) return [];
        const matchingItem = agendaItems.find((agendaCandidate) => {
          if (!agendaCandidate || typeof agendaCandidate !== "object") return false;
          const item = agendaCandidate as Record<string, unknown>;
          if (typeof ballot.agendaItemId === "string") return objectId(item) === ballot.agendaItemId;
          const business = item.business;
          return (
            business &&
            typeof business === "object" &&
            (business as Record<string, unknown>).councilDecisionId === ballot.councilDecisionId
          );
        });
        const ballotActions =
          meetingStatus === "inProgress" &&
          !ballot.cancelledAt &&
          matchingItem &&
          typeof matchingItem === "object" &&
          (matchingItem as Record<string, unknown>).startedAt &&
          !(matchingItem as Record<string, unknown>).completedAt &&
          permitted(request, "meetings.conduct")
            ? [action("ballot.cancel", "DELETE", `/api/council-meetings/${meetingReference}/ballots/${ballotId}`)]
            : undefined;
        return [
          {
            rel: ["item"],
            class: ["ballot"],
            properties: ballot,
            actions: ballotActions,
            links: [
              {
                rel: ["self"],
                href: `/api/council-meetings/${meetingReference}/ballots/${ballotId}`,
                type: SIREN_MEDIA_TYPE,
              },
            ],
          },
        ];
      })
    : [];
  return [...agendaEntities, ...attendanceEntities, ...ballotEntities];
}

function committeeMembershipEntities(
  request: Request,
  payload: Record<string, unknown>,
): SirenEmbeddedEntity[] | undefined {
  const committee = payload.committee;
  const memberships = payload.memberships;
  if (!committee || typeof committee !== "object" || !Array.isArray(memberships)) return undefined;
  const committeeReference = publicReference("council-committee", committee as Record<string, unknown>);
  if (!committeeReference) return undefined;
  const mutable = !(committee as Record<string, unknown>).archivedAt && permitted(request, "meetings.prepare");
  return memberships.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const membership = candidate as Record<string, unknown>;
    const membershipId = objectId(membership);
    if (!membershipId) return [];
    const href = `/api/council-committees/${committeeReference}/memberships/${membershipId}`;
    const actions: SirenAction[] = mutable
      ? [action("committee.update-membership", "PUT", href, "Update the committee membership")]
      : [];
    if (mutable && !membership.endedOn) {
      actions.push(action("committee.end-membership", "POST", `${href}/end`, "End the committee membership"));
    }
    return [
      {
        rel: ["committee-membership"],
        class: ["committee-membership"],
        properties: membership,
        actions: actions.length > 0 ? actions : undefined,
        links: [{ rel: ["self"], href, type: SIREN_MEDIA_TYPE }],
      },
    ];
  });
}

export function toSirenRepresentation(request: Request, payload: unknown): SirenEntity {
  const entityClass = classFromPath(request, payload);
  const collection = Array.isArray(payload);
  const objectCollection = collection && payload.every((item) => item && typeof item === "object");
  const properties = collection
    ? objectCollection
      ? { count: payload.length }
      : { items: payload }
    : (payload as Record<string, unknown>);
  const links: SirenLink[] = objectLinks(request, entityClass, collection ? null : payload);
  const actions = collection ? collectionActions(request, entityClass) : objectActions(request, entityClass, payload);
  return {
    class: [collection ? `${entityClass}-collection` : entityClass],
    properties,
    entities: objectCollection
      ? payload.map((item) => embeddedEntity(request, entityClass, item as Record<string, unknown>))
      : !collection && entityClass === "council-meeting"
        ? meetingEntities(request, payload as Record<string, unknown>)
        : !collection && entityClass === "council-committee"
          ? committeeMembershipEntities(request, payload as Record<string, unknown>)
          : undefined,
    actions: actions.length > 0 ? actions : undefined,
    links,
  };
}

export function sirenResponses(request: Request, response: Response, next: NextFunction): void {
  const json = response.json.bind(response);
  response.json = ((payload: unknown) => {
    if (response.statusCode >= 400 || request.path === "/health") return json(payload);
    response.type(SIREN_MEDIA_TYPE);
    return json(isSirenEntity(payload) ? payload : toSirenRepresentation(request, payload));
  }) as Response["json"];
  next();
}

export function apiRootRepresentation(request: Request): SirenEntity<{ authenticated: boolean }> {
  const links: SirenLink[] = [
    { rel: ["self"], href: "/api", type: SIREN_MEDIA_TYPE },
    { rel: ["authentication-status"], href: "/api/auth/status", type: SIREN_MEDIA_TYPE },
  ];
  if (request.principal) {
    links.push({ rel: ["session"], href: "/api/auth/session", type: SIREN_MEDIA_TYPE });
    links.push({ rel: ["settings"], href: "/api/settings", type: SIREN_MEDIA_TYPE });
    if (permitted(request, "meetings.read")) {
      links.push(
        { rel: ["council-meetings"], href: "/api/council-meetings", type: SIREN_MEDIA_TYPE },
        { rel: ["council-decisions"], href: "/api/council-decisions", type: SIREN_MEDIA_TYPE },
        { rel: ["council-members"], href: "/api/council-members", type: SIREN_MEDIA_TYPE },
      );
    }
    if (permitted(request, "workspace.read")) {
      links.push(
        { rel: ["resources"], href: "/api/resources", type: SIREN_MEDIA_TYPE },
        { rel: ["council-business"], href: "/api/council-business", type: SIREN_MEDIA_TYPE },
        { rel: ["templates"], href: "/api/templates", type: SIREN_MEDIA_TYPE },
      );
    }
    if (permitted(request, "meetings.read")) {
      links.push({ rel: ["council-committees"], href: "/api/council-committees", type: SIREN_MEDIA_TYPE });
    }
    if (permitted(request, "users.manage")) {
      links.push({ rel: ["users"], href: "/api/users", type: SIREN_MEDIA_TYPE });
    }
    if (permitted(request, "audit.read")) {
      links.push({ rel: ["audit-events"], href: "/api/audit-events", type: SIREN_MEDIA_TYPE });
    }
  }
  return { class: ["hall-api"], properties: { authenticated: Boolean(request.principal) }, links };
}
