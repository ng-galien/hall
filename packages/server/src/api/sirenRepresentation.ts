import {
  SIREN_MEDIA_TYPE,
  type SirenAction,
  type SirenEmbeddedEntity,
  type SirenEntity,
  type SirenLink,
} from "@hall/api-contract";
import { documentFormatSchema, matchLiteral } from "@hall/domain";
import type { NextFunction, Request, Response } from "express";
import { documentPreviewMode } from "../domain/documentPolicy.js";
import { hasPermission } from "../security/authorization.js";
import { action, collectionActions, objectActions } from "./sirenActionPolicy.js";
import {
  canonicalHref,
  classifySirenEntity,
  objectId,
  primaryObject,
  publicReference,
  type SirenEntityClass,
} from "./sirenEntityIdentity.js";

function isSirenEntity(value: unknown): value is SirenEntity {
  return Boolean(
    value && typeof value === "object" && "links" in value && Array.isArray((value as { links?: unknown }).links),
  );
}

export function objectLinks(request: Request, entityClass: SirenEntityClass, value: unknown): SirenLink[] {
  const links: SirenLink[] = [
    { rel: ["self"], href: canonicalHref(request, entityClass, value), type: SIREN_MEDIA_TYPE },
  ];
  const primary = primaryObject(entityClass, value);
  const id = objectId(primary);
  const reference = publicReference(entityClass, primary);
  const extraLinks = matchLiteral(entityClass, {
    "agenda-item": () => [],
    attendance: () => [],
    "audit-event": () => [],
    authentication: () => [],
    "authentication-status": () => [],
    ballot: () => [],
    "committee-membership": () => [],
    "council-business": () => [],
    "council-committee": () => [],
    "council-decision": () => [],
    "council-meeting": () => [],
    "council-member": () => [],
    entity: () => [],
    "hall-settings": () => [],
    resource: (): SirenLink[] => {
      if (!id || !reference || primary?.kind !== "document") return [];
      const parsedFormat = documentFormatSchema.safeParse(primary.format);
      if (!parsedFormat.success || typeof primary.mediaType !== "string") return [];
      const mediaType = primary.mediaType;
      const resourceLinks: SirenLink[] = [
        { rel: ["content"], href: `/api/resources/${reference}/content`, type: mediaType },
      ];
      const previewLink = matchLiteral(documentPreviewMode(parsedFormat.data), {
        native: (): SirenLink => ({
          rel: ["preview"],
          href: `/api/resources/${reference}/preview`,
          type: mediaType,
        }),
        convertible: (): SirenLink => ({
          rel: ["preview"],
          href: `/api/resources/${reference}/preview`,
          type: "application/pdf",
        }),
        unavailable: () => null,
      });
      if (previewLink) resourceLinks.push(previewLink);
      return resourceLinks;
    },
    session: () => [],
    template: () => [],
    "template-preview": () => [],
    "template-reference": () => [],
    user: () => [],
  });
  return [...links, ...extraLinks];
}

function embeddedEntity(
  request: Request,
  entityClass: SirenEntityClass,
  value: Record<string, unknown>,
): SirenEmbeddedEntity {
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
  const agendaEntities = agendaItems.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Record<string, unknown>;
    const itemId = objectId(item);
    if (!itemId) return [];
    const actions = objectActions(request, "agenda-item", { ...payload, agendaItem: item });
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
        const ballotActions = objectActions(request, "ballot", { ...payload, ballot });
        return [
          {
            rel: ["item"],
            class: ["ballot"],
            properties: ballot,
            actions: ballotActions.length > 0 ? ballotActions : undefined,
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
  const mutable =
    !(committee as Record<string, unknown>).archivedAt && hasPermission(request.principal, "meetings.prepare");
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

function objectEmbeddedEntities(
  request: Request,
  entityClass: SirenEntityClass,
  payload: Record<string, unknown>,
): SirenEmbeddedEntity[] | undefined {
  return matchLiteral(entityClass, {
    "agenda-item": () => undefined,
    attendance: () => undefined,
    "audit-event": () => undefined,
    authentication: () => undefined,
    "authentication-status": () => undefined,
    ballot: () => undefined,
    "committee-membership": () => undefined,
    "council-business": () => undefined,
    "council-committee": () => committeeMembershipEntities(request, payload),
    "council-decision": () => undefined,
    "council-meeting": () => meetingEntities(request, payload),
    "council-member": () => undefined,
    entity: () => undefined,
    "hall-settings": () => undefined,
    resource: () => undefined,
    session: () => undefined,
    template: () => undefined,
    "template-preview": () => undefined,
    "template-reference": () => undefined,
    user: () => undefined,
  });
}

export function toSirenRepresentation(request: Request, payload: unknown): SirenEntity {
  const entityClass = classifySirenEntity(request, payload);
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
      : !collection
        ? objectEmbeddedEntities(request, entityClass, payload as Record<string, unknown>)
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
    if (hasPermission(request.principal, "meetings.read")) {
      links.push(
        { rel: ["council-meetings"], href: "/api/council-meetings", type: SIREN_MEDIA_TYPE },
        { rel: ["council-decisions"], href: "/api/council-decisions", type: SIREN_MEDIA_TYPE },
        { rel: ["council-members"], href: "/api/council-members", type: SIREN_MEDIA_TYPE },
      );
    }
    if (hasPermission(request.principal, "workspace.read")) {
      links.push(
        { rel: ["resources"], href: "/api/resources", type: SIREN_MEDIA_TYPE },
        { rel: ["council-business"], href: "/api/council-business", type: SIREN_MEDIA_TYPE },
        { rel: ["templates"], href: "/api/templates", type: SIREN_MEDIA_TYPE },
      );
    }
    if (hasPermission(request.principal, "meetings.read")) {
      links.push({ rel: ["council-committees"], href: "/api/council-committees", type: SIREN_MEDIA_TYPE });
    }
    if (hasPermission(request.principal, "users.manage")) {
      links.push({ rel: ["users"], href: "/api/users", type: SIREN_MEDIA_TYPE });
    }
    if (hasPermission(request.principal, "audit.read")) {
      links.push({ rel: ["audit-events"], href: "/api/audit-events", type: SIREN_MEDIA_TYPE });
    }
  }
  return { class: ["hall-api"], properties: { authenticated: Boolean(request.principal) }, links };
}
