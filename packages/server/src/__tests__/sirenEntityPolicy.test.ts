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
    method: "GET",
    originalUrl: path,
    path,
    sessionId: "session-id",
    principal: {
      id: "user-id",
      displayName: "Administrator",
      roles: ["administrator"],
      permissions: [...permissions],
      contactId: null,
    },
  } as unknown as Request;
}

const classificationSamples: Record<SirenEntityClass, { path: string; value: unknown }> = {
  "agenda-item": {
    path: "/api/unknown",
    value: { councilMeetingId: "meeting", subject: { kind: "openQuestion", id: "question" }, position: 1 },
  },
  attendance: {
    path: "/api/unknown",
    value: { councilMeetingId: "meeting", councilMemberId: "member", status: "present" },
  },
  "audit-event": { path: "/api/audit-events/id", value: { id: "id" } },
  authentication: { path: "/api/auth/challenge", value: {} },
  "authentication-status": { path: "/api/auth/status", value: {} },
  "ballot-preview": { path: "/api/ballot-previews/id", value: { id: "id", canConfirm: true } },
  ballot: { path: "/api/unknown", value: { meetingId: "meeting", method: "public", result: "adopted" } },
  "delegation-membership": { path: "/api/council-delegations/c/memberships/m", value: { id: "m" } },
  "council-delegation": { path: "/api/council-delegations/id", value: { id: "id" } },
  "committee-membership": { path: "/api/council-committees/c/memberships/m", value: { id: "m" } },
  contact: { path: "/api/contacts/id", value: { id: "id" } },
  "council-business": { path: "/api/council-business/id", value: { id: "id" } },
  "council-committee": { path: "/api/council-committees/id", value: { id: "id" } },
  "council-decision": { path: "/api/council-decisions/id", value: { id: "id" } },
  "council-meeting": { path: "/api/council-meetings/id", value: { id: "id" } },
  "council-member": { path: "/api/council-members/id", value: { id: "id" } },
  "council-term": { path: "/api/council-terms", value: { id: "id" } },
  entity: { path: "/api/unknown", value: {} },
  "hall-settings": { path: "/api/settings", value: { id: "settings" } },
  "prepared-subject": {
    path: "/api/council-business/prepared-subjects/openQuestion/id",
    value: { id: "id", kind: "openQuestion" },
  },
  "agenda-freeze": {
    path: "/api/council-meetings/id/agenda-freeze",
    value: { councilMeetingId: "id", frozenAt: "2026-09-06T10:00:00Z", agenda: [] },
  },
  "meeting-notice": { path: "/api/meeting-notices/id", value: { id: "id", councilMeetingId: "id", version: 1 } },
  minutes: { path: "/api/minutes/one", value: { id: "one", generatedAt: null } },
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

  it("exposes the current resource, session and settings affordances", () => {
    const adminRequest = request("/api/resources");
    expect(collectionActions(adminRequest, "resource").map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "resource.create",
        "resource.import-spreadsheet",
        "resource.create-document",
        "resource.search-legal-references",
      ]),
    );
    expect(objectActions(request("/api/auth/session"), "session", {}).map(({ name }) => name)).toEqual([
      "session.logout",
      "session.change-password",
    ]);
    expect(
      objectActions(request("/api/settings"), "hall-settings", { id: "settings" }).map(({ name }) => name),
    ).toEqual(["settings.update"]);
  });

  // @verifies-requirement HALL-FR-WSP-290
  // @verifies-requirement HALL-FR-WSP-450
  it("groups council business actions by content, subjects, agenda and business", () => {
    const deletable = request("/api/council-business/business-id");
    Object.assign(deletable, { res: { locals: { deletableCouncilBusinessIds: new Set(["business-id"]) } } });
    const actions = objectActions(deletable, "council-business", {
      id: "business-id",
    });
    const kept = objectActions(request("/api/council-business/business-id"), "council-business", {
      id: "business-id",
    });
    expect(kept.map(({ name }) => name)).toEqual(
      actions.map(({ name }) => name).filter((name) => name !== "council-business.delete"),
    );
    expect(actions.map(({ name, title }) => ({ name, title }))).toEqual([
      { name: "resource.create", title: "Create a resource" },
      {
        name: "resource.import-spreadsheet",
        title: "Create a spreadsheet resource by importing a file",
      },
      {
        name: "resource.convert-spreadsheet-table",
        title: "Convert the first sheet of a spreadsheet file into a Markdown table",
      },
      { name: "resource.create-document", title: "Create a document resource by uploading a file" },
      { name: "council-business.associate-resource", title: "Attach an existing resource" },
      { name: "council-business.dissociate-resource", title: "Detach a resource" },
      { name: "council-business.reorder-resources", title: "Reorder attached resources" },
      { name: "council-business.associate-committee", title: "Associate a committee" },
      { name: "council-business.dissociate-committee", title: "Dissociate a committee" },
      { name: "council-business.create-prepared-subject", title: "Create a prepared subject" },
      {
        name: "council-business.schedule-decision-proposal",
        title: "Add a decision proposal to the agenda",
      },
      { name: "council-business.schedule-open-question", title: "Add an open question to the agenda" },
      { name: "council-business.export-bundle", title: "Export the council business" },
      { name: "council-business.delete", title: "Delete the council business" },
    ]);
    expect(actions.find(({ name }) => name === "council-business.create-prepared-subject")?.fields).toEqual([
      {
        name: "kind",
        type: "text",
        options: [
          { value: "councilDecisionProposal", title: "Council decision proposal" },
          { value: "openQuestion", title: "Open question" },
        ],
      },
      { name: "name", type: "text" },
      { name: "content", type: "text" },
    ]);
  });

  // @verifies-requirement HALL-FR-BUS-070
  it("advertises committee mutations only with the dedicated business update permission", () => {
    const business = { id: "business-id" };
    const readOnly = objectActions(
      request("/api/council-business/business-id", ["workspace.read", "meetings.read"]),
      "council-business",
      business,
    );
    expect(readOnly.some(({ name }) => name === "council-business.associate-committee")).toBe(false);
    expect(readOnly.some(({ name }) => name === "council-business.dissociate-committee")).toBe(false);

    const updateOnly = objectActions(
      request("/api/council-business/business-id", ["council-business.update"]),
      "council-business",
      business,
    );
    expect(updateOnly.map(({ name }) => name)).toEqual([
      "council-business.associate-resource",
      "council-business.dissociate-resource",
      "council-business.reorder-resources",
      "council-business.associate-committee",
      "council-business.dissociate-committee",
    ]);
    expect(updateOnly.find(({ name }) => name === "council-business.associate-committee")?.fields).toEqual([
      { name: "committeeId", type: "text" },
    ]);
    expect(updateOnly.some(({ name }) => name === "council-business.create")).toBe(false);
    expect(updateOnly.some(({ name }) => name === "council-business.delete")).toBe(false);
  });

  // @verifies-requirement HALL-FR-WSP-290
  it("derives prepared-subject agenda actions from the Siren representation", () => {
    const currentRequest = request("/api/council-business/prepared-subjects/openQuestion/subject-id");
    expect(
      objectActions(currentRequest, "prepared-subject", {
        id: "subject-id",
        kind: "openQuestion",
        agenda: { state: "notScheduled", agendaItemId: null, meeting: null },
        scheduleTarget: { meetingReference: "2026-09-14-001", position: 4 },
      }),
    ).toEqual([
      {
        name: "agenda-item.schedule-prepared",
        method: "POST",
        href: "/api/council-meetings/2026-09-14-001/agenda-items/from-prepared",
        type: "application/json",
        title: "Schedule on the active meeting",
        fields: [
          { name: "subjectId", type: "hidden", value: "subject-id" },
          { name: "kind", type: "hidden", value: "openQuestion" },
          { name: "position", type: "hidden", value: 4 },
        ],
      },
    ]);
    expect(
      objectActions(currentRequest, "prepared-subject", {
        id: "subject-id",
        kind: "openQuestion",
        agenda: {
          state: "scheduled",
          agendaItemId: "agenda-item-id",
          meeting: { reference: "2026-09-14-001", startedAt: null },
        },
        scheduleTarget: null,
      }),
    ).toEqual([
      {
        name: "agenda-item.deprogram",
        method: "DELETE",
        href: "/api/council-meetings/2026-09-14-001/agenda-items/agenda-item-id",
        type: "application/json",
        title: "Remove from the agenda",
      },
    ]);
    expect(
      objectActions(currentRequest, "prepared-subject", {
        id: "subject-id",
        kind: "openQuestion",
        agenda: {
          state: "scheduled",
          agendaItemId: "agenda-item-id",
          meeting: { reference: "2026-09-14-001", startedAt: "2026-09-14T18:00:00.000Z" },
        },
        scheduleTarget: null,
      }),
    ).toEqual([]);
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

  it("offers the available lifecycle actions while a started meeting remains open", () => {
    const startedMeeting = {
      id: "meeting-id",
      slug: "2026-09-01-001",
      scheduledAt: "2026-09-01T18:00:00.000Z",
      startedAt: "2026-09-01T18:05:00.000Z",
      closedAt: null,
      stale: false,
      closureBlockers: [],
    };

    expect(objectActions(request("/api/council-meetings/2026-09-01-001"), "council-meeting", startedMeeting)).toEqual([
      expect.objectContaining({
        name: "meeting.mark-stale",
        method: "POST",
        href: "/api/council-meetings/2026-09-01-001/stale",
      }),
      expect.objectContaining({
        name: "meeting.close",
        method: "POST",
        href: "/api/council-meetings/2026-09-01-001/close",
      }),
    ]);
    expect(
      objectActions(request("/api/council-meetings/2026-09-01-001"), "council-meeting", {
        ...startedMeeting,
        closedAt: "2026-09-01T20:00:00.000Z",
      }),
    ).toEqual([]);
    expect(
      objectActions(
        request("/api/council-meetings/2026-09-01-001", ["meetings.read"]),
        "council-meeting",
        startedMeeting,
      ),
    ).toEqual([]);
  });

  it("keeps primitive and object collection representations structurally valid", () => {
    const primitiveCollection = toSirenRepresentation(request("/api/resources", []), ["seed", "finances"]);
    expect(primitiveCollection).toMatchObject({
      class: ["resource-collection"],
      properties: { items: ["seed", "finances"] },
      entities: undefined,
    });

    const emptyObjectCollection = toSirenRepresentation(request("/api/resources", []), []);
    expect(emptyObjectCollection.entities).toEqual([]);

    const archivedCommittee = toSirenRepresentation(request("/api/council-committees/committee", []), {
      committee: { id: "committee-id", slug: "committee", archivedAt: "2026-09-01T10:00:00.000Z" },
      memberships: [null, {}, { id: "membership-id", endedOn: null }],
    });
    expect(archivedCommittee.entities).toBeUndefined();

    const unclassified = toSirenRepresentation(request("/api/unknown", []), {});
    expect(unclassified.actions).toBeUndefined();
  });
});

describe("active agenda ballot capabilities", () => {
  it.each([
    ["openQuestion", false],
    ["councilDecisionProposal", false],
    ["minutesApproval", false],
    ["councilDecisionProposal", true],
    ["minutesApproval", true],
  ])("exposes ballot result preview for %s: %s", (kind, expected) => {
    const req = request("/api/council-meetings/meeting/agenda-items");
    req.res = {
      locals: { currentCouncilMeeting: { id: "meeting", startedAt: "2026-09-05T10:00:00Z", closedAt: null } },
    } as unknown as Request["res"];
    const actions = objectActions(req, "agenda-item", {
      id: "item",
      councilMeetingId: "meeting",
      position: 1,
      startedAt: "2026-09-05T10:01:00Z",
      completedAt: null,
      subject: { kind, id: "subject" },
      canReviewBallot: expected,
      conductBlockers: {
        startDiscussion: [{ code: "discussionAlreadyStarted" }],
        reviewBallot: expected ? [] : [{ code: "nonVotingSubject" }],
        adjourn: [],
        complete: [{ code: "votingSubjectRequiresBallot" }],
        updateNotes: [],
      },
    });
    expect(actions.some((action) => action.name === "ballot.preview")).toBe(expected);
  });
});

describe("conduct reasons in HTTP properties", () => {
  it("adds permission refusal to the visible reason list and removes the corresponding Siren action", () => {
    const req = request("/api/council-meetings/meeting/agenda-items/item", []);
    req.res = {
      locals: { currentCouncilMeeting: { id: "meeting", startedAt: "2026-01-01T09:00:00Z", closedAt: null } },
    } as unknown as Request["res"];
    const entity = toSirenRepresentation(req, {
      id: "item",
      councilMeetingId: "meeting",
      position: 1,
      startedAt: null,
      completedAt: null,
      adjournedAt: null,
      subject: { kind: "openQuestion", id: "subject" },
      canStartDiscussion: true,
      canReviewBallot: false,
      conductBlockers: {
        startDiscussion: [],
        reviewBallot: [{ code: "nonVotingSubject" }],
        adjourn: [],
        complete: [{ code: "discussionNotStarted" }],
        updateNotes: [],
      },
    });
    expect(entity.properties).toMatchObject({
      canStartDiscussion: false,
      conductBlockers: {
        startDiscussion: [{ code: "permissionDenied" }],
        reviewBallot: [{ code: "nonVotingSubject" }, { code: "permissionDenied" }],
      },
    });
    expect(entity.actions ?? []).toEqual([]);
  });
  it("adds a closure permission refusal without inventing a minutes blocker", () => {
    const entity = toSirenRepresentation(request("/api/council-meetings/meeting", []), {
      id: "meeting",
      number: 1,
      startedAt: "2026-01-01T09:00:00Z",
      closedAt: null,
      closureBlockers: [],
    });
    expect(entity.properties).toMatchObject({
      closureBlockers: [{ code: "permissionDenied" }],
    });
    expect(entity.actions ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "meeting.close" })]),
    );
  });
});

it.each([true, false])("keeps attendance reasons and Siren permission consistent: permitted=%s", (permitted) => {
  const entity = toSirenRepresentation(
    request("/api/council-meetings/meeting/conduct", permitted ? apiPermissions : []),
    {
      councilMeetingId: "meeting",
      meeting: { id: "meeting", number: 1, startedAt: "2026-01-01T09:00:00Z", closedAt: null, closureBlockers: [] },
      canRecordAttendanceEvents: true,
      canRecordOfficerChange: true,
      canDeclareAuxiliaryAttendance: true,
      meetingActionBlockers: {
        addAgendaItem: [],
        recordAttendanceEvents: [],
        recordOfficerChange: [],
        declareAuxiliaryAttendance: [],
      },
    },
  );
  expect(entity.properties).toMatchObject({
    canRecordAttendanceEvents: permitted,
    canRecordOfficerChange: permitted,
    canDeclareAuxiliaryAttendance: permitted,
    meetingActionBlockers: {
      addAgendaItem: permitted ? [] : [{ code: "permissionDenied" }],
      recordAttendanceEvents: permitted ? [] : [{ code: "permissionDenied" }],
      recordOfficerChange: permitted ? [] : [{ code: "permissionDenied" }],
      declareAuxiliaryAttendance: permitted ? [] : [{ code: "permissionDenied" }],
    },
  });
  expect(entity.actions?.some((action) => action.name === "meeting.record-attendance-events") ?? false).toBe(permitted);
  expect(entity.actions?.some((action) => action.name === "meeting.record-officer-change") ?? false).toBe(permitted);
  expect(entity.actions?.some((action) => action.name === "meeting.declare-auxiliary-attendance") ?? false).toBe(
    permitted,
  );
  expect(entity.actions?.some((action) => action.name === "meeting.add-open-question") ?? false).toBe(permitted);
  expect(entity.actions?.some((action) => action.name.includes("late")) ?? false).toBe(false);
});

describe("meeting opening preparation capabilities", () => {
  const path = "/api/council-meetings/meeting/conduct";
  const meeting = {
    id: "meeting",
    scheduledAt: "2026-01-01T18:00:00Z",
    startedAt: null,
    closedAt: null,
    currentNoticeId: "notice",
  };
  it("uses SQL opening blockers even when a notice is present", () => {
    const actions = objectActions(request(path), "council-meeting", {
      meeting: { ...meeting, openingBlockers: [{ code: "agendaNotFrozen" }] },
    });
    expect(actions.some((action) => action.name === "meeting.record-opening")).toBe(false);
  });
  it("exposes opening when the backend lists no blockers", () => {
    const actions = objectActions(request(path), "council-meeting", { meeting: { ...meeting, openingBlockers: [] } });
    expect(actions.some((action) => action.name === "meeting.record-opening")).toBe(true);
    expect(
      objectActions(request(path, []), "council-meeting", { meeting: { ...meeting, openingBlockers: [] } }),
    ).toEqual([]);
  });
  it("does not infer availability when the blocker contract is absent or invalid", () => {
    for (const openingBlockers of [undefined, [{ code: "unknown" }]]) {
      const actions = objectActions(request(path), "council-meeting", { meeting: { ...meeting, openingBlockers } });
      expect(actions.some((action) => action.name === "meeting.record-opening")).toBe(false);
    }
  });
});
