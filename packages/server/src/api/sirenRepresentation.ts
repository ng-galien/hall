import {
  type ApiActionName,
  type ApiPermission,
  SIREN_MEDIA_TYPE,
  type SirenAction,
  type SirenEmbeddedEntity,
  type SirenEntity,
  type SirenLink,
} from "@mairie/api-contract";
import { deriveBallotVoters, evaluateBallot, type MeetingAggregate } from "@mairie/domain";
import type { NextFunction, Request, Response } from "express";
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

function classFromPath(request: Request, value: unknown): string {
  const path = pathWithoutQuery(request);
  if (path.endsWith("/auth/status")) return "authentication-status";
  if (["/auth/session", "/auth/logout", "/auth/login", "/auth/bootstrap"].some((suffix) => path.endsWith(suffix))) {
    return "session";
  }
  if (path.includes("/auth/")) return "authentication";
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if ("meetingId" in object && "topic" in object && "position" in object) return "agenda-item";
    if ("meetingId" in object && "memberId" in object && "version" in object) return "attendance";
    if ("meetingId" in object && "method" in object && "result" in object) return "ballot";
  }
  if (path.startsWith("/api/users")) return "user";
  if (path.startsWith("/api/audit-events")) return "audit-event";
  if (path.startsWith("/api/council-members")) return "council-member";
  if (path.startsWith("/api/council-decisions")) return "council-decision";
  if (path.startsWith("/api/topics")) return "topic";
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
      },
    ];
  }
  if (entityClass === "topic" && permitted(request, "workspace.write")) {
    return [action("topic.create", "POST", "/api/topics", "Create a topic")];
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
  return [];
}

function objectId(value: unknown): string | null {
  return value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : null;
}

function primaryObject(entityClass: string, value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  if (entityClass === "topic" && object.topic && typeof object.topic === "object") {
    return object.topic as Record<string, unknown>;
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
  if (entityClass === "resource" && id && permitted(request, "workspace.write")) {
    const details = value as { topics?: unknown[]; snapshotted?: boolean; usedAsProxy?: boolean };
    const actions = [action("resource.update", "PUT", `/api/resources/${id}`, "Update the resource")];
    if (
      Array.isArray(details.topics) &&
      details.topics.length === 0 &&
      details.snapshotted === false &&
      details.usedAsProxy === false
    ) {
      actions.push(action("resource.delete", "DELETE", `/api/resources/${id}`, "Delete the resource"));
    }
    return actions;
  }
  if (entityClass === "topic" && id && permitted(request, "workspace.write")) {
    const topic = primary as { state?: string; kind?: string; councilDecisionId?: string | null };
    const actions = [action("topic.reclassify", "PUT", `/api/topics/${id}/classification`, "Reclassify the topic")];
    if (!["toSchedule", "scheduled"].includes(topic.state ?? "")) return actions;
    const details = value as {
      occurrences?: Array<{
        meeting?: { id?: string; status?: string; quorumFailure?: boolean; isReconvenedMeeting?: boolean };
        agendaItem?: { id?: string; addedDuringSession?: boolean };
      }>;
    };
    const occurrence = details.occurrences?.find(
      (candidate) => candidate.meeting?.id === (primary as { currentMeetingId?: string | null }).currentMeetingId,
    );
    if (topic.state === "scheduled" && !Array.isArray(details.occurrences)) return actions;
    if (occurrence?.meeting?.isReconvenedMeeting || occurrence?.meeting?.quorumFailure) return actions;
    actions.push(action("topic.update", "PUT", `/api/topics/${id}`, "Update the topic"));
    if (topic.state === "toSchedule" && permitted(request, "meetings.prepare")) {
      actions.push({
        ...action("topic.schedule", "POST", `/api/topics/${id}/schedule`, "Schedule the topic"),
        fields: [
          { name: "meetingId", type: "text" },
          { name: "position", type: "number" },
        ],
      });
    }
    if (
      topic.state === "scheduled" &&
      occurrence?.meeting?.id &&
      occurrence.agendaItem?.id &&
      ["draft", "scheduled"].includes(occurrence.meeting.status ?? "") &&
      !occurrence.meeting.quorumFailure &&
      !occurrence.meeting.isReconvenedMeeting &&
      permitted(request, "meetings.prepare")
    ) {
      actions.push(
        action(
          "agenda-item.remove",
          "DELETE",
          `/api/council-meetings/${occurrence.meeting.id}/agenda-items/${occurrence.agendaItem.id}`,
          "Remove from the agenda",
        ),
      );
    }
    if (topic.kind === "subject" && Array.isArray(details.occurrences) && !occurrence?.agendaItem?.addedDuringSession) {
      actions.push(
        topic.councilDecisionId
          ? action("topic.detach-decision", "DELETE", `/api/topics/${id}/decision`, "Detach the decision")
          : action("topic.attach-decision", "POST", `/api/topics/${id}/decision`, "Submit to a vote"),
      );
    }
    return actions;
  }
  if (entityClass === "council-decision" && id && permitted(request, "workspace.write")) {
    const status = primary && "status" in primary ? String(primary.status) : "";
    return ["draft", "ready", "scheduled"].includes(status) && primary?.contentEditable !== false
      ? [action("decision.update", "PUT", `/api/council-decisions/${id}`, "Update the decision")]
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
            `/api/council-meetings/${primary.meetingId}/agenda-items/${id}/notes`,
          ),
          action(
            "agenda-item.complete",
            "POST",
            `/api/council-meetings/${primary.meetingId}/agenda-items/${id}/complete`,
          ),
        ];
      }
      return [];
    }
    const meetingId = objectId(meeting);
    if (!meetingId) return [];
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
          `/api/council-meetings/${meetingId}/agenda-items/${id}`,
          "Remove from the agenda",
        ),
      ];
    }
    if (meetingStatus !== "inProgress" || !permitted(request, "meetings.conduct")) return [];
    const item = primary as Record<string, unknown>;
    if (item.completedAt) return [];
    if (item.startedAt) {
      return [
        action("agenda-item.save-notes", "PUT", `/api/council-meetings/${meetingId}/agenda-items/${id}/notes`),
        action("agenda-item.complete", "POST", `/api/council-meetings/${meetingId}/agenda-items/${id}/complete`),
      ];
    }
    const firstOpenItem = agendaItems.find(
      (candidate) => candidate && typeof candidate === "object" && !(candidate as Record<string, unknown>).completedAt,
    );
    return firstOpenItem && typeof firstOpenItem === "object" && objectId(firstOpenItem) === id
      ? [action("agenda-item.start", "POST", `/api/council-meetings/${meetingId}/agenda-items/${id}/start`)]
      : [];
  }
  if (entityClass === "council-meeting") {
    const payload = value as Record<string, unknown>;
    const aggregate = primary ?? payload;
    const meetingId = objectId(aggregate);
    if (!meetingId) return [];
    const status = "status" in aggregate ? String(aggregate.status) : "";
    const actions: SirenAction[] = [];
    const reconvened = Boolean(aggregate.isReconvenedMeeting);
    if (status === "draft" && permitted(request, "meetings.prepare")) {
      actions.push(action("meeting.update", "PUT", `/api/council-meetings/${meetingId}`, "Update the meeting"));
      if (typeof payload.activeMemberCount === "number" && payload.activeMemberCount > 0) {
        actions.push(
          statusAction(
            "meeting.schedule",
            `/api/council-meetings/${meetingId}/status`,
            "scheduled",
            "Schedule the meeting",
          ),
        );
      }
      actions.push(
        statusAction("meeting.cancel", `/api/council-meetings/${meetingId}/status`, "cancelled", "Cancel the meeting"),
      );
    }
    const quorumFailure = Boolean(aggregate.quorumFailure);
    if (status === "scheduled" && !quorumFailure && permitted(request, "meetings.prepare")) {
      actions.push(
        action("meeting.update", "PUT", `/api/council-meetings/${meetingId}`, "Update the meeting"),
        statusAction("meeting.cancel", `/api/council-meetings/${meetingId}/status`, "cancelled", "Cancel the meeting"),
      );
      if (!reconvened) {
        actions.push(action("meeting.reorder-agenda", "PUT", `/api/council-meetings/${meetingId}/agenda-order`));
      }
    }
    if (
      status === "scheduled" &&
      !quorumFailure &&
      (permitted(request, "meetings.prepare") || permitted(request, "meetings.conduct"))
    ) {
      actions.push(action("meeting.set-officers", "PUT", `/api/council-meetings/${meetingId}/officers`));
    }
    if (status === "scheduled" && quorumFailure && permitted(request, "meetings.conduct")) {
      actions.push(action("meeting.reconvene", "POST", `/api/council-meetings/${meetingId}/reconvene`));
    }
    if (status === "scheduled" && !quorumFailure && permitted(request, "meetings.conduct")) {
      actions.push(action("meeting.record-attendance", "PUT", `/api/council-meetings/${meetingId}/attendance`));
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
          action("meeting.record-quorum-failure", "POST", `/api/council-meetings/${meetingId}/quorum-failure`),
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
          statusAction("meeting.open", `/api/council-meetings/${meetingId}/status`, "inProgress", "Open the meeting"),
        );
      }
    }
    if (status === "inProgress" && permitted(request, "meetings.conduct")) {
      actions.push(action("meeting.record-attendance", "PUT", `/api/council-meetings/${meetingId}/attendance`));
      actions.push(action("meeting.add-late-topic", "POST", `/api/council-meetings/${meetingId}/late-topics`));
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
        activeItem && typeof activeItem === "object" && (activeItem as Record<string, unknown>).topic
          ? ((activeItem as Record<string, unknown>).topic as Record<string, unknown>)
          : null;
      const activeDecisionId =
        activeTopic?.kind === "subject" && typeof activeTopic.councilDecisionId === "string"
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
        actions.push(action("ballot.record", "POST", `/api/council-meetings/${meetingId}/ballots`));
      }
      actions.push(
        statusAction("meeting.close", `/api/council-meetings/${meetingId}/status`, "closed", "Close the meeting"),
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
    const matchingItem = agendaItems.find((candidate) => {
      if (!candidate || typeof candidate !== "object") return false;
      const item = candidate as Record<string, unknown>;
      if (typeof ballot.agendaItemId === "string") return objectId(item) === ballot.agendaItemId;
      const topic = item.topic;
      return (
        topic &&
        typeof topic === "object" &&
        (topic as Record<string, unknown>).councilDecisionId === ballot.councilDecisionId
      );
    });
    return matchingItem &&
      typeof matchingItem === "object" &&
      (matchingItem as Record<string, unknown>).startedAt &&
      !(matchingItem as Record<string, unknown>).completedAt
      ? [
          action(
            "ballot.cancel",
            "DELETE",
            `/api/council-meetings/${(meeting as Record<string, unknown>).id}/ballots/${id}`,
          ),
        ]
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
  if (
    entityClass === "attendance" &&
    primary &&
    typeof primary.meetingId === "string" &&
    typeof primary.memberId === "string"
  ) {
    return `/api/council-meetings/${primary.meetingId}/attendance/${primary.memberId}`;
  }
  if (entityClass === "agenda-item" && primary && typeof primary.meetingId === "string") {
    return `/api/council-meetings/${primary.meetingId}/agenda-items/${id}`;
  }
  if (entityClass === "ballot" && primary && typeof primary.meetingId === "string") {
    return `/api/council-meetings/${primary.meetingId}/ballots/${id}`;
  }
  const roots: Record<string, string> = {
    resource: "resources",
    topic: "topics",
    "council-decision": "council-decisions",
    "council-meeting": "council-meetings",
  };
  const root = roots[entityClass];
  return root ? `/api/${root}/${id}` : pathWithQuery(request);
}

function objectLinks(request: Request, entityClass: string, value: unknown): SirenLink[] {
  const links: SirenLink[] = [
    { rel: ["self"], href: canonicalHref(request, entityClass, value), type: SIREN_MEDIA_TYPE },
  ];
  const primary = primaryObject(entityClass, value);
  const id = objectId(primary);
  if (entityClass === "resource" && id && primary?.kind === "document") {
    links.push({ rel: ["content"], href: `/api/resources/${id}/content`, type: String(primary.mediaType) });
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
  if (!meetingId) return undefined;
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
          `/api/council-meetings/${meetingId}/agenda-items/${itemId}`,
          "Remove from the agenda",
        ),
      );
    }
    if (meetingStatus === "inProgress" && permitted(request, "meetings.conduct") && !item.completedAt) {
      if (item.startedAt) {
        actions.push(
          action("agenda-item.save-notes", "PUT", `/api/council-meetings/${meetingId}/agenda-items/${itemId}/notes`),
          action("agenda-item.complete", "POST", `/api/council-meetings/${meetingId}/agenda-items/${itemId}/complete`),
        );
      } else if (firstOpenItem === item) {
        actions.push(
          action("agenda-item.start", "POST", `/api/council-meetings/${meetingId}/agenda-items/${itemId}/start`),
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
            href: `/api/council-meetings/${meetingId}/agenda-items/${itemId}`,
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
          const topic = item.topic;
          return (
            topic &&
            typeof topic === "object" &&
            (topic as Record<string, unknown>).councilDecisionId === ballot.councilDecisionId
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
            ? [action("ballot.cancel", "DELETE", `/api/council-meetings/${meetingId}/ballots/${ballotId}`)]
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
                href: `/api/council-meetings/${meetingId}/ballots/${ballotId}`,
                type: SIREN_MEDIA_TYPE,
              },
            ],
          },
        ];
      })
    : [];
  return [...agendaEntities, ...attendanceEntities, ...ballotEntities];
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
        { rel: ["topics"], href: "/api/topics", type: SIREN_MEDIA_TYPE },
      );
    }
    if (permitted(request, "users.manage")) {
      links.push({ rel: ["users"], href: "/api/users", type: SIREN_MEDIA_TYPE });
    }
    if (permitted(request, "audit.read")) {
      links.push({ rel: ["audit-events"], href: "/api/audit-events", type: SIREN_MEDIA_TYPE });
    }
  }
  return { class: ["mairie-api"], properties: { authenticated: Boolean(request.principal) }, links };
}
