import { type ApiPermission, apiPermissions } from "@hall/api-contract";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { collectionActions, objectActions } from "../api/sirenActionPolicy.js";
import {
  canonicalHref,
  classifySirenEntity,
  primaryObject,
  type SirenEntityClass,
  sirenEntityClasses,
  sirenEntityClassSchema,
} from "../api/sirenEntityIdentity.js";
import { toSirenRepresentation } from "../api/sirenRepresentation.js";

function request(path: string, permissions: readonly ApiPermission[] = apiPermissions): Request {
  return {
    originalUrl: path,
    path,
    sessionId: "session-id",
    principal: {
      id: "user-id",
      displayName: "Administrator",
      roles: ["administrator"],
      permissions: [...permissions],
      councilMemberId: null,
    },
  } as unknown as Request;
}

const classificationSamples: Record<SirenEntityClass, { path: string; value: unknown }> = {
  "agenda-item": { path: "/api/unknown", value: { meetingId: "meeting", business: {}, position: 1 } },
  attendance: { path: "/api/unknown", value: { meetingId: "meeting", memberId: "member", version: 1 } },
  "audit-event": { path: "/api/audit-events/id", value: { id: "id" } },
  authentication: { path: "/api/auth/challenge", value: {} },
  "authentication-status": { path: "/api/auth/status", value: {} },
  ballot: { path: "/api/unknown", value: { meetingId: "meeting", method: "public", result: "adopted" } },
  "committee-membership": { path: "/api/council-committees/c/memberships/m", value: { id: "m" } },
  "council-business": { path: "/api/council-business/id", value: { id: "id" } },
  "council-committee": { path: "/api/council-committees/id", value: { id: "id" } },
  "council-decision": { path: "/api/council-decisions/id", value: { id: "id" } },
  "council-meeting": { path: "/api/council-meetings/id", value: { id: "id" } },
  "council-member": { path: "/api/council-members/id", value: { id: "id" } },
  entity: { path: "/api/unknown", value: {} },
  "hall-settings": { path: "/api/settings", value: { id: "settings" } },
  resource: { path: "/api/resources/id", value: { id: "id" } },
  session: { path: "/api/auth/session", value: {} },
  template: { path: "/api/templates/id", value: { id: "id" } },
  "template-preview": { path: "/api/templates/preview", value: {} },
  "template-reference": { path: "/api/templates/references", value: { id: "id", type: "resource" } },
  user: { path: "/api/users/id", value: { id: "id" } },
};

describe("Siren entity class authority", () => {
  it("classifies and validates every closed entity class", () => {
    expect(Object.keys(classificationSamples).sort()).toEqual([...sirenEntityClasses].sort());
    for (const entityClass of sirenEntityClasses) {
      const sample = classificationSamples[entityClass];
      expect(classifySirenEntity(request(sample.path), sample.value)).toBe(entityClass);
      expect(sirenEntityClassSchema.parse(entityClass)).toBe(entityClass);
    }
  });

  it("defines primary identity, canonical route and action policy for every class", () => {
    for (const entityClass of sirenEntityClasses) {
      const sample = classificationSamples[entityClass];
      const currentRequest = request(sample.path);
      expect(primaryObject(entityClass, sample.value)).not.toBeUndefined();
      expect(canonicalHref(currentRequest, entityClass, sample.value)).toMatch(/^\/api\//);
      expect(collectionActions(currentRequest, entityClass)).toBeInstanceOf(Array);
      expect(objectActions(currentRequest, entityClass, sample.value)).toBeInstanceOf(Array);
    }
  });

  it("preserves the established resource, session and settings affordances", () => {
    const adminRequest = request("/api/resources");
    expect(collectionActions(adminRequest, "resource").map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "resource.create-text",
        "resource.create-spreadsheet",
        "resource.import-spreadsheet",
        "resource.create-document",
        "resource.search-legal-references",
      ]),
    );
    expect(objectActions(request("/api/auth/session"), "session", {}).map(({ name }) => name)).toEqual([
      "session.logout",
    ]);
    expect(
      objectActions(request("/api/settings"), "hall-settings", { id: "settings" }).map(({ name }) => name),
    ).toEqual(["settings.update"]);
  });

  it("uses the object action policy for agenda items and ballots embedded in a meeting", () => {
    const currentRequest = request("/api/council-meetings/meeting-slug");
    const agendaItem = {
      id: "agenda-item-id",
      meetingId: "meeting-id",
      startedAt: "2026-09-01T18:00:00.000Z",
      completedAt: null,
      business: { councilDecisionId: "decision-id" },
    };
    const ballot = {
      id: "ballot-id",
      agendaItemId: agendaItem.id,
      councilDecisionId: "decision-id",
      cancelledAt: null,
    };
    const aggregate = {
      meeting: {
        id: "meeting-id",
        slug: "meeting-slug",
        status: "inProgress",
        chairMemberId: "member-id",
        secretaryMemberId: "member-id",
      },
      agendaItems: [agendaItem],
      ballots: [ballot],
      attendance: [],
      rosterMemberIds: [],
      quorum: { reached: true },
    };

    const representation = toSirenRepresentation(currentRequest, aggregate);
    const embeddedAgendaItem = representation.entities?.find((entity) => entity.class?.includes("agenda-item"));
    const embeddedBallot = representation.entities?.find((entity) => entity.class?.includes("ballot"));
    const embeddedAgendaActions =
      embeddedAgendaItem && "actions" in embeddedAgendaItem ? embeddedAgendaItem.actions : [];
    const embeddedBallotActions = embeddedBallot && "actions" in embeddedBallot ? embeddedBallot.actions : [];

    expect(embeddedAgendaActions).toEqual(objectActions(currentRequest, "agenda-item", { ...aggregate, agendaItem }));
    expect(embeddedBallotActions).toEqual(objectActions(currentRequest, "ballot", { ...aggregate, ballot }));
  });

  it("keeps sparse aggregate and collection representations structurally valid", () => {
    const primitiveCollection = toSirenRepresentation(request("/api/resources", []), ["seed", "finances"]);
    expect(primitiveCollection).toMatchObject({
      class: ["resource-collection"],
      properties: { items: ["seed", "finances"] },
      entities: undefined,
    });

    const emptyObjectCollection = toSirenRepresentation(request("/api/resources", []), []);
    expect(emptyObjectCollection.entities).toEqual([]);

    const incompleteMeeting = toSirenRepresentation(request("/api/council-meetings/meeting", []), {
      meeting: { id: "meeting-id", slug: "meeting" },
      agendaItems: [null, {}, { id: "agenda-item-id" }],
    });
    expect(incompleteMeeting.entities).toHaveLength(1);
    expect(incompleteMeeting.entities?.[0]).toMatchObject({ class: ["agenda-item"] });

    const archivedCommittee = toSirenRepresentation(request("/api/council-committees/committee", []), {
      committee: { id: "committee-id", slug: "committee", archivedAt: "2026-09-01T10:00:00.000Z" },
      memberships: [null, {}, { id: "membership-id", endedOn: null }],
    });
    expect(archivedCommittee.entities).toEqual([
      expect.objectContaining({ class: ["committee-membership"], actions: undefined }),
    ]);

    const unclassified = toSirenRepresentation(request("/api/unknown", []), {});
    expect(unclassified.actions).toBeUndefined();
  });
});
