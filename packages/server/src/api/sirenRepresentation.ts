import { SIREN_MEDIA_TYPE, type SirenEmbeddedEntity, type SirenEntity, type SirenLink } from "@hall/api-contract";
import { documentFormatSchema, matchLiteral } from "@hall/domain";
import type { NextFunction, Request, Response } from "express";
import { documentPreviewMode } from "../domain/documentPolicy.js";
import { hasPermission } from "../security/authorization.js";
import { collectionActions, objectActions, withConductAuthorization } from "./sirenActionPolicy.js";
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
    "agenda-item": (): SirenLink[] =>
      id && primary
        ? [
            {
              rel: ["recusals"],
              href: `/api/council-meetings/${primary.councilMeetingId}/agenda-items/${id}/recusals`,
              type: SIREN_MEDIA_TYPE,
            },
          ]
        : [],
    attendance: () => [],
    "audit-event": () => [],
    authentication: () => [],
    "authentication-status": () => [],
    ballot: (): SirenLink[] =>
      typeof primary?.resultPreviewId === "string"
        ? [{ rel: ["result-preview"], href: `/api/ballot-previews/${primary.resultPreviewId}`, type: SIREN_MEDIA_TYPE }]
        : [],
    "ballot-preview": () => [],
    "committee-membership": () => [],
    contact: () => [],
    "council-business": () => [],
    "council-committee": () => [],
    "council-decision": (): SirenLink[] =>
      id
        ? [
            { rel: ["preview"], href: `/api/council-decisions/${id}/preview.pdf`, type: "application/pdf" },
            ...(primary?.documentId
              ? [{ rel: ["content"], href: `/api/council-decisions/${id}/content.pdf`, type: "application/pdf" }]
              : []),
          ]
        : [],
    "council-meeting": (): SirenLink[] =>
      reference
        ? [
            { rel: ["conduct"], href: `/api/council-meetings/${reference}/conduct`, type: SIREN_MEDIA_TYPE },
            { rel: ["notices"], href: `/api/council-meetings/${reference}/notices`, type: SIREN_MEDIA_TYPE },
            ...(primary?.agendaFrozenAt
              ? [
                  {
                    rel: ["agenda-freeze"],
                    href: `/api/council-meetings/${reference}/agenda-freeze`,
                    type: SIREN_MEDIA_TYPE,
                  },
                ]
              : []),
          ]
        : [],
    "council-member": () => [],
    "council-term": () => [],
    entity: () => [],
    "hall-settings": () => [],
    "prepared-subject": (): SirenLink[] =>
      primary
        ? [
            ...(primary.textResourceId
              ? [
                  {
                    rel: ["content-resource"],
                    href: `/api/resources/${primary.textResourceId}`,
                    type: SIREN_MEDIA_TYPE,
                  },
                ]
              : []),
            { rel: ["report"], href: `/api/resources/${primary.reportResourceId}`, type: SIREN_MEDIA_TYPE },
          ]
        : [],
    "agenda-freeze": () => [],
    "meeting-notice": (): SirenLink[] =>
      id ? [{ rel: ["content"], href: `/api/meeting-notices/${id}/content`, type: "application/pdf" }] : [],
    minutes: (): SirenLink[] => {
      if (!id || !primary) return [];
      const links: SirenLink[] = [
        { rel: ["council-meeting"], href: `/api/council-meetings/${primary.councilMeetingId}`, type: SIREN_MEDIA_TYPE },
      ];
      if (!primary.generatedAt)
        links.push({ rel: ["preview"], href: `/api/minutes/${id}/preview`, type: "application/pdf" });
      if (primary.generatedAt && primary.documentId) {
        links.push({ rel: ["content"], href: `/api/minutes/${id}/content`, type: "application/pdf" });
      }
      return links;
    },
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
  value = withConductAuthorization(request, value) as Record<string, unknown>;
  const actions = objectActions(request, entityClass, value);
  return {
    rel: ["item"],
    class: [entityClass],
    properties: value,
    actions: actions.length > 0 ? actions : undefined,
    links: objectLinks(request, entityClass, value),
  };
}

export function toSirenRepresentation(request: Request, input: unknown): SirenEntity {
  const payload = Array.isArray(input) ? input : withConductAuthorization(request, input);
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
        { rel: ["minutes"], href: "/api/minutes", type: SIREN_MEDIA_TYPE },
        { rel: ["council-decisions"], href: "/api/council-decisions", type: SIREN_MEDIA_TYPE },
        { rel: ["council-members"], href: "/api/council-members", type: SIREN_MEDIA_TYPE },
        { rel: ["council-terms"], href: "/api/council-terms", type: SIREN_MEDIA_TYPE },
      );
    }
    if (hasPermission(request.principal, "contacts.read")) {
      links.push({ rel: ["contacts"], href: "/api/contacts", type: SIREN_MEDIA_TYPE });
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
