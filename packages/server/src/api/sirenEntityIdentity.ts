import { matchLiteral, type ReferenceEntityKind, referenceEntityKinds } from "@hall/domain";
import type { Request } from "express";
import { z } from "zod";

export const sirenEntityClasses = [
  "agenda-item",
  "attendance",
  "audit-event",
  "authentication",
  "authentication-status",
  "ballot",
  "ballot-preview",
  "committee-membership",
  "contact",
  "council-business",
  "council-delegation",
  "delegation-membership",
  "council-committee",
  "council-decision",
  "council-meeting",
  "council-member",
  "council-term",
  "entity",
  "hall-settings",
  "prepared-subject",
  "meeting-notice",
  "agenda-freeze",
  "minutes",
  "resource",
  "session",
  "template",
  "template-preview",
  "template-reference",
  "user",
] as const;

export type SirenEntityClass = (typeof sirenEntityClasses)[number];

export const sirenEntityClassSchema = z.enum(sirenEntityClasses);
const referenceEntityKindSchema = z.enum(referenceEntityKinds);

export function pathWithoutQuery(request: Request): string {
  return request.originalUrl.split("?", 1)[0] || request.path;
}

function pathWithQuery(request: Request): string {
  return request.originalUrl.split("#", 1)[0] || request.path;
}

export function meetingReferenceFromRequest(request: Request): string | null {
  const contextualReference = request.res?.locals.meetingReference;
  if (typeof contextualReference === "string") return contextualReference;
  return pathWithoutQuery(request).match(/\/api\/council-meetings\/([^/]+)/)?.[1] ?? null;
}

export function classifySirenEntity(request: Request, value: unknown): SirenEntityClass {
  const path = pathWithoutQuery(request);
  if (path.endsWith("/auth/status")) return "authentication-status";
  if (["/auth/session", "/auth/logout", "/auth/login", "/auth/bootstrap"].some((suffix) => path.endsWith(suffix))) {
    return "session";
  }
  if (path.includes("/auth/")) return "authentication";
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if ("councilMeetingId" in object && "subject" in object && "position" in object) return "agenda-item";
    if ("councilMeetingId" in object && "councilMemberId" in object && "status" in object) return "attendance";
    if ("agendaItemId" in object && "mode" in object && "completedAt" in object) return "ballot";
    if ("meetingId" in object && "method" in object && "result" in object) return "ballot";
  }
  if (path.startsWith("/api/users")) return "user";
  if (path.startsWith("/api/audit-events")) return "audit-event";
  if (path.startsWith("/api/settings")) return "hall-settings";
  if (path.endsWith("/notice-message")) return "entity";
  if (path.startsWith("/api/council-business") && path.includes("/prepared-subjects")) return "prepared-subject";
  if (path.startsWith("/api/meeting-notices") || path.endsWith("/notices")) return "meeting-notice";
  if (path.endsWith("/agenda-freeze") && request.method === "GET") return "agenda-freeze";
  if (path.startsWith("/api/minutes")) return "minutes";
  if (path.startsWith("/api/templates/references")) return "template-reference";
  if (path.startsWith("/api/templates/preview")) return "template-preview";
  if (path.startsWith("/api/templates")) return "template";
  if (path.startsWith("/api/contacts")) return "contact";
  if (path.startsWith("/api/council-members")) return "council-member";
  if (path.startsWith("/api/council-terms")) return "council-term";
  if (path.startsWith("/api/council-decisions")) return "council-decision";
  if (path.startsWith("/api/council-delegations") && path.includes("/memberships")) {
    return "delegation-membership";
  }
  if (path.startsWith("/api/council-delegations")) return "council-delegation";
  if (path.startsWith("/api/council-committees") && path.includes("/memberships")) {
    return "committee-membership";
  }
  if (path.startsWith("/api/council-committees")) return "council-committee";
  if (path.startsWith("/api/council-business")) return "council-business";
  if (path.startsWith("/api/ballot-previews")) return "ballot-preview";
  if (path.startsWith("/api/ballots")) return "ballot";
  if (path.startsWith("/api/resources")) return "resource";
  if (path.startsWith("/api/council-meetings")) {
    if (path.includes("/ballots")) return "ballot";
    if (path.includes("/agenda-items")) return "agenda-item";
    if (path.includes("/attendance")) return "attendance";
    return "council-meeting";
  }
  if (value && typeof value === "object" && "roles" in value && !("email" in value)) return "session";
  return "entity";
}

const primaryPropertyByClass: Record<SirenEntityClass, string | null> = {
  "agenda-item": "agendaItem",
  attendance: null,
  "audit-event": null,
  authentication: null,
  "authentication-status": null,
  ballot: "ballot",
  "ballot-preview": null,
  "delegation-membership": null,
  "committee-membership": null,
  contact: null,
  "council-business": "business",
  "council-delegation": null,
  "council-committee": "committee",
  "council-decision": null,
  "council-meeting": "meeting",
  "council-member": null,
  "council-term": null,
  entity: null,
  "hall-settings": null,
  "prepared-subject": null,
  "meeting-notice": null,
  "agenda-freeze": null,
  minutes: null,
  resource: "resource",
  session: null,
  template: null,
  "template-preview": null,
  "template-reference": null,
  user: null,
};

export function primaryObject(entityClass: SirenEntityClass, value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  const primaryProperty = primaryPropertyByClass[entityClass];
  const primary = primaryProperty ? object[primaryProperty] : null;
  return primary && typeof primary === "object" ? (primary as Record<string, unknown>) : object;
}

export function objectId(value: unknown): string | null {
  return value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : null;
}

const slugIdentityByClass: Record<SirenEntityClass, boolean> = {
  "agenda-item": false,
  attendance: false,
  "audit-event": false,
  authentication: false,
  "authentication-status": false,
  ballot: false,
  "ballot-preview": false,
  "delegation-membership": false,
  "committee-membership": false,
  contact: false,
  "council-business": true,
  "council-delegation": false,
  "council-committee": false,
  "council-decision": true,
  "council-meeting": true,
  "council-member": false,
  "council-term": false,
  entity: false,
  "hall-settings": false,
  "prepared-subject": false,
  "meeting-notice": false,
  "agenda-freeze": false,
  minutes: false,
  resource: true,
  session: false,
  template: false,
  "template-preview": false,
  "template-reference": false,
  user: false,
};

export function publicReference(entityClass: SirenEntityClass, value: Record<string, unknown> | null): string | null {
  if (value && slugIdentityByClass[entityClass] && typeof value.slug === "string") return value.slug;
  return objectId(value);
}

const templateReferenceRoots: Record<ReferenceEntityKind, string> = {
  member: "council-members",
  contact: "contacts",
  resource: "resources",
  councilBusiness: "council-business",
  decision: "council-decisions",
  meeting: "council-meetings",
};

export function canonicalHref(request: Request, entityClass: SirenEntityClass, value: unknown): string {
  const primary = primaryObject(entityClass, value);
  const id = objectId(primary);
  const currentHref = () => pathWithQuery(request);
  const referencedHref = (root: string) => {
    const reference = publicReference(entityClass, primary);
    return reference ? `/api/${root}/${reference}` : currentHref();
  };

  return matchLiteral(entityClass, {
    "agenda-item": () => {
      if (!id) return currentHref();
      const meetingReference = meetingReferenceForValue(request, primary, value);
      return meetingReference ? `/api/council-meetings/${meetingReference}/agenda-items/${id}` : currentHref();
    },
    attendance: () => {
      if (
        !id ||
        !primary ||
        typeof primary.councilMeetingId !== "string" ||
        typeof primary.councilMemberId !== "string"
      ) {
        return currentHref();
      }
      return `/api/council-meetings/${meetingReferenceFromRequest(request) ?? primary.councilMeetingId}/attendance/${primary.councilMemberId}`;
    },
    "audit-event": () => (id ? `/api/audit-events/${id}` : currentHref()),
    authentication: currentHref,
    "authentication-status": currentHref,
    "ballot-preview": () => (id ? `/api/ballot-previews/${id}` : currentHref()),
    ballot: () => {
      if (!id) return currentHref();
      if (
        pathWithoutQuery(request).startsWith("/api/ballots") ||
        pathWithoutQuery(request).startsWith("/api/ballot-previews")
      )
        return `/api/ballots/${id}`;
      const meetingReference = meetingReferenceForValue(request, primary, value);
      return meetingReference ? `/api/council-meetings/${meetingReference}/ballots/${id}` : currentHref();
    },
    "delegation-membership": () => {
      if (!id) return currentHref();
      const committeeReference = pathWithoutQuery(request).match(/\/api\/council-delegations\/([^/]+)/)?.[1];
      return committeeReference ? `/api/council-delegations/${committeeReference}/memberships/${id}` : currentHref();
    },
    "committee-membership": () => {
      if (!id) return currentHref();
      const committeeReference = pathWithoutQuery(request).match(/\/api\/council-committees\/([^/]+)/)?.[1];
      return committeeReference ? `/api/council-committees/${committeeReference}/memberships/${id}` : currentHref();
    },
    contact: () => (id ? `/api/contacts/${id}` : currentHref()),
    "council-business": () => referencedHref("council-business"),
    "council-delegation": () => referencedHref("council-delegations"),
    "council-committee": () => referencedHref("council-committees"),
    "council-decision": () => referencedHref("council-decisions"),
    "council-meeting": () => referencedHref("council-meetings"),
    "council-member": () => (id ? `/api/council-members/${id}` : currentHref()),
    "council-term": currentHref,
    entity: currentHref,
    "hall-settings": currentHref,
    "prepared-subject": () =>
      primary
        ? `/api/council-business/prepared-subjects/${primary.kind}/${id ?? primary.councilBusinessId}`
        : currentHref(),
    "meeting-notice": () => referencedHref("meeting-notices"),
    "agenda-freeze": currentHref,
    minutes: () => referencedHref("minutes"),
    resource: () => referencedHref("resources"),
    session: () => "/api/auth/session",
    template: () => referencedHref("templates"),
    "template-preview": currentHref,
    "template-reference": () => {
      if (!id || !primary || typeof primary.type !== "string") return currentHref();
      const parsedType = referenceEntityKindSchema.safeParse(primary.type);
      return parsedType.success ? `/api/${templateReferenceRoots[parsedType.data]}/${id}` : currentHref();
    },
    user: () => (id ? `/api/users/${id}` : currentHref()),
  });
}

function meetingReferenceForValue(
  request: Request,
  primary: Record<string, unknown> | null,
  value: unknown,
): string | null {
  const payloadMeeting =
    value && typeof value === "object" && "meeting" in value && value.meeting && typeof value.meeting === "object"
      ? (value.meeting as Record<string, unknown>)
      : null;
  return (
    publicReference("council-meeting", payloadMeeting) ??
    meetingReferenceFromRequest(request) ??
    (primary && typeof primary.councilMeetingId === "string" ? primary.councilMeetingId : null)
  );
}
