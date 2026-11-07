import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  agendaItemSchema,
  agendaSubjectSchema,
  ballotParticipationSchema,
  ballotSchema,
  ballotVoteSchema,
  completeAgendaItemSchema,
  confirmBallotResultPreviewSchema,
  councilBusinessSchema,
  councilMeetingSchema,
  createBallotResultPreviewSchema,
  createCouncilBusinessSchema,
  createCouncilMemberSchema,
  createResourceSchema,
  findSirenAction,
  meetingAttendanceDeclarationSchema,
  meetingAttendanceSchema,
  problemDetailsSchema,
  provisionInitialCouncilMeetingSchema,
  recordMeetingAttendanceSchema,
  recordMeetingOpeningSchema,
  reorderCouncilAgendaSchema,
  reprogramAgendaItemSchema,
  resourceDetailSchema,
  saveContactSchema,
  saveCouncilCommitteeSchema,
  scheduleAgendaItemSchema,
  scheduleCouncilMeetingSchema,
  sirenData,
  sirenEntitySchema,
  startAgendaItemSchema,
  updateCommitteeMembershipSchema,
  updateCouncilMemberSchema,
  updateResourceContentSchema,
} from "./index.js";

describe("shared HTTP contract", () => {
  it("validates a Siren entity with a state-changing action", () => {
    const schema = sirenEntitySchema(z.object({ status: z.string() }));
    const entity = schema.parse({
      class: ["council-meeting"],
      properties: { status: "scheduled" },
      actions: [
        {
          name: "meeting.record-attendance",
          method: "PUT",
          href: "/api/council-meetings/meeting-1/attendance",
          type: "application/json",
        },
      ],
      links: [{ rel: ["self"], href: "/api/council-meetings/meeting-1" }],
    });

    expect(entity.actions?.[0]?.name).toBe("meeting.record-attendance");
  });

  it("rejects unsupported HTTP methods", () => {
    const schema = sirenEntitySchema(z.object({}));
    expect(() =>
      schema.parse({
        actions: [{ name: "council-business.update", method: "RUN", href: "/api/council-business/business-1" }],
        links: [{ rel: ["self"], href: "/api/council-business/business-1" }],
      }),
    ).toThrow();
  });

  it("validates RFC 9457 problem details with a stable application code", () => {
    const problem = problemDetailsSchema.parse({
      type: "/api/problems/quorum-not-reached",
      title: "Quorum not reached",
      status: 409,
      code: "quorum_not_reached",
      requestId: "request-1",
    });
    expect(problem.status).toBe(409);
  });

  it("decodes collection entities while preserving discoverable actions", () => {
    const representation = {
      class: ["council-business-collection"],
      properties: { count: 1 },
      entities: [
        {
          rel: ["item"],
          class: ["council-business"],
          properties: { id: "business-1" },
          links: [{ rel: ["self"], href: "/api/council-business/business-1" }],
        },
      ],
      actions: [{ name: "council-business.create" as const, method: "POST" as const, href: "/api/council-business" }],
      links: [{ rel: ["self"], href: "/api/council-business" }],
    };

    expect(sirenData<Array<{ id: string }>>(representation)).toEqual([{ id: "business-1" }]);
    expect(findSirenAction(representation, "council-business.create")?.href).toBe("/api/council-business");
  });

  it("keeps the modern resource contract small and discriminated", () => {
    expect(createResourceSchema.parse({ kind: "text", path: "school", name: "menu.md", content: "Menu" })).toEqual({
      kind: "text",
      path: "school",
      name: "menu.md",
      content: "Menu",
    });

    const resource = resourceDetailSchema.parse({
      id: "10000000-0000-4000-8000-000000000001",
      slug: "menu-md",
      path: "school",
      name: "menu.md",
      fullPath: "school/menu.md",
      kind: "text",
      tags: ["school"],
      state: { readiness: "ready", availability: null },
      autosaveEnabled: true,
      createdAt: "2026-09-02T10:00:00Z",
      updatedAt: "2026-09-02T10:00:00Z",
      content: "Menu",
      version: 1,
    });
    expect(resource.tags).toEqual(["school"]);
    expect(resource).toMatchObject({ kind: "text", autosaveEnabled: true });
    expect(resource).not.toHaveProperty("councilBusiness");

    expect(
      createResourceSchema.parse({
        kind: "remote",
        path: "school",
        name: "portal",
        target: { kind: "unconfigured" },
      }),
    ).toMatchObject({ kind: "remote", target: { kind: "unconfigured" } });
  });

  it("keeps council business independent from its asynchronously hydrated resources", () => {
    expect(
      councilBusinessSchema.parse({
        id: "10000000-0000-4000-8000-000000000001",
        folderResourceId: "20000000-0000-4000-8000-000000000001",
        reportResourceId: "30000000-0000-4000-8000-000000000001",
      }),
    ).not.toHaveProperty("report");

    expect(
      createCouncilBusinessSchema.parse({
        path: "school",
        name: "Canteen",
        reportName: "Main report",
        reportContent: "Initial report",
      }),
    ).toEqual({
      path: "school",
      name: "Canteen",
      reportName: "Main report",
      reportContent: "Initial report",
    });
  });

  it("keeps meetings and their agenda as separate strict projections", () => {
    const meetingId = "10000000-0000-4000-8000-000000000001";
    const businessId = "20000000-0000-4000-8000-000000000001";
    const subjectId = "30000000-0000-4000-8000-000000000001";
    const agendaItemId = "40000000-0000-4000-8000-000000000001";

    expect(
      councilMeetingSchema.parse({
        id: meetingId,
        slug: "2026-09-12-001",
        chairMemberId: null,
        secretaryMemberId: null,
        number: 1,
        previousCouncilMeetingId: null,
        reconvocationId: null,
        minutesId: null,
        agendaFrozenAt: null,
        currentNoticeId: null,
        closureBlockers: [],
        entryBlockers: [{ code: "agendaNotFrozen" }, { code: "currentNoticeMissing" }],
        openingBlockers: [{ code: "agendaNotFrozen" }, { code: "currentNoticeMissing" }],
        noticeDeadline: { status: "indeterminate", reason: "populationUnknown" },
        scheduledAt: "2026-09-12T09:00:00Z",
        location: "Council chamber",
        quorum: 4,
        startedAt: null,
        closedAt: null,
        stale: false,
      }),
    ).toMatchObject({ id: meetingId, quorum: 4 });

    const subjects = [
      { kind: "minutesApproval", id: subjectId, minutesId: subjectId, documentId: null },
      {
        kind: "councilDecisionProposal",
        id: subjectId,
        textResourceId: "50000000-0000-4000-8000-000000000001",
        content: "",
      },
      { kind: "openQuestion", id: subjectId, textResourceId: subjectId, content: "" },
    ] as const;

    for (const subject of subjects) {
      expect(agendaSubjectSchema.parse(subject)).toEqual(subject);
      expect(
        agendaItemSchema.parse({
          id: agendaItemId,
          councilBusinessId: subject.kind === "minutesApproval" ? null : businessId,
          discussionSummary: "",
          canStartDiscussion: true,
          canReviewBallot: true,
          conductBlockers: { startDiscussion: [], reviewBallot: [], adjourn: [], complete: [], updateNotes: [] },
          title: "Question",
          councilMeetingId: meetingId,
          position: 1,
          agendaNumber: 1,
          introducedAt: null,
          subject,
          startedAt: null,
          completedAt: null,
          adjournedAt: null,
        }),
      ).toMatchObject({ subject });
    }
  });

  it("validates the named meeting and agenda commands", () => {
    const meetingId = "10000000-0000-4000-8000-000000000001";
    const businessId = "20000000-0000-4000-8000-000000000001";
    const minutesApprovalId = "30000000-0000-4000-8000-000000000001";
    const agendaItemId = "40000000-0000-4000-8000-000000000001";

    expect(provisionInitialCouncilMeetingSchema.parse({})).toEqual({});
    expect(() => provisionInitialCouncilMeetingSchema.parse({ quorum: 8 })).toThrow();
    expect(
      scheduleCouncilMeetingSchema.parse({
        scheduledAt: "2026-09-12T09:00:00Z",
        location: " Council chamber ",
      }),
    ).toEqual({ scheduledAt: "2026-09-12T09:00:00Z", location: "Council chamber" });
    expect(
      recordMeetingOpeningSchema.parse({
        chairMemberId: "00000000-0000-4000-8000-000000000001",
        secretaryMemberId: "00000000-0000-4000-8000-000000000001",
        attendance: [{ councilMemberId: "00000000-0000-4000-8000-000000000001", status: "present" }],
      }),
    ).toBeDefined();
    expect(() =>
      recordMeetingOpeningSchema.parse({
        observedAt: "2026-09-12T09:05:00Z",
        chairMemberId: "00000000-0000-4000-8000-000000000001",
        secretaryMemberId: "00000000-0000-4000-8000-000000000001",
        attendance: [{ councilMemberId: "00000000-0000-4000-8000-000000000001", status: "present" }],
      }),
    ).toThrow();
    expect(
      scheduleAgendaItemSchema.parse({
        kind: "councilDecisionProposal",
        councilBusinessId: businessId,
        position: 2,
      }),
    ).toMatchObject({ kind: "councilDecisionProposal", position: 2 });
    expect(
      scheduleAgendaItemSchema.parse({
        kind: "openQuestion",
        councilBusinessId: businessId,
        position: 3,
      }),
    ).toMatchObject({ kind: "openQuestion", position: 3 });
    expect(() =>
      scheduleAgendaItemSchema.parse({
        kind: "minutesApproval",
        councilBusinessId: businessId,
        minutesApprovalId,
      }),
    ).toThrow();
    expect(reprogramAgendaItemSchema.parse({ councilMeetingId: meetingId, position: 2 })).toBeDefined();
    expect(reorderCouncilAgendaSchema.parse({ agendaItemIds: [agendaItemId, businessId] })).toEqual({
      agendaItemIds: [agendaItemId, businessId],
    });
    expect(startAgendaItemSchema.parse({})).toEqual({});
    expect(completeAgendaItemSchema.parse({})).toEqual({});
    expect(() => startAgendaItemSchema.parse({ startedAt: "2026-09-12T09:10:00Z" })).toThrow();
    expect(() => completeAgendaItemSchema.parse({ completedAt: "2026-09-12T09:20:00Z" })).toThrow();
    expect(() =>
      scheduleAgendaItemSchema.parse({
        kind: "openQuestion",
        councilBusinessId: businessId,
        position: 0,
      }),
    ).toThrow();
    expect(() => reprogramAgendaItemSchema.parse({ councilMeetingId: meetingId, position: -1 })).toThrow();
    expect(() => reorderCouncilAgendaSchema.parse({ agendaItemIds: [agendaItemId, agendaItemId] })).toThrow();
  });

  it("keeps proxy persistence identities behind the attendance boundary", () => {
    const meetingId = "10000000-0000-4000-8000-000000000001";
    const representedMemberId = "20000000-0000-4000-8000-000000000001";
    const holderMemberId = "30000000-0000-4000-8000-000000000001";
    const proxyDocumentId = "40000000-0000-4000-8000-000000000001";

    expect(
      recordMeetingAttendanceSchema.parse({
        attendance: [
          { councilMemberId: holderMemberId, status: "present" },
          {
            councilMemberId: representedMemberId,
            status: "represented",
            proxyHolderCouncilMemberId: holderMemberId,
            proxyDocumentId,
          },
        ],
      }),
    ).toMatchObject({ attendance: [{ status: "present" }, { status: "represented" }] });

    expect(
      meetingAttendanceSchema.parse({
        id: "50000000-0000-4000-8000-000000000001",
        councilMeetingId: meetingId,
        councilMemberId: representedMemberId,
        status: "represented",
        proxyHolderCouncilMemberId: holderMemberId,
        proxyDocumentId,
      }),
    ).not.toHaveProperty("proxyHolderAttendanceId");

    expect(() =>
      meetingAttendanceDeclarationSchema.parse({
        councilMemberId: representedMemberId,
        status: "represented",
        proxyDocumentId,
      }),
    ).toThrow();
    expect(() => recordMeetingAttendanceSchema.parse({ attendance: [] })).toThrow();
  });

  it("keeps ballot participation and public or secret votes structurally distinct", () => {
    const ballotId = "10000000-0000-4000-8000-000000000001";
    const agendaItemId = "20000000-0000-4000-8000-000000000001";
    const participationId = "30000000-0000-4000-8000-000000000001";
    const attendanceId = "40000000-0000-4000-8000-000000000001";
    const memberId = "50000000-0000-4000-8000-000000000001";

    expect(
      ballotSchema.parse({
        id: ballotId,
        agendaItemId,
        mode: "public",
        chairmanParticipationId: participationId,
        resultPreviewId: null,
        completedAt: null,
        result: null,
      }),
    ).toMatchObject({ id: ballotId, result: null });
    expect(
      ballotParticipationSchema.parse({
        id: participationId,
        ballotId,
        meetingAttendanceId: attendanceId,
        councilMemberId: memberId,
      }),
    ).toMatchObject({ councilMemberId: memberId });
    expect(
      ballotVoteSchema.parse({
        mode: "public",
        ballotId,
        choice: "approve",
        ballotParticipationId: participationId,
        count: 1,
      }),
    ).toMatchObject({ mode: "public", ballotParticipationId: participationId });
    expect(
      ballotVoteSchema.parse({
        mode: "secret",
        ballotId,
        choice: "reject",
        ballotParticipationId: null,
        count: 2,
      }),
    ).toMatchObject({ mode: "secret", count: 2 });
    expect(() =>
      ballotVoteSchema.parse({
        mode: "secret",
        ballotId,
        choice: "reject",
        ballotParticipationId: participationId,
        count: 1,
      }),
    ).toThrow();
  });

  it("validates public and secret review candidates without accepting mixed shapes", () => {
    const agendaItemId = "40000000-0000-4000-8000-000000000001";
    const attendanceId = "10000000-0000-4000-8000-000000000001";
    const base = {
      procedure: "ordinaryMajority",
      participantAttendanceIds: [attendanceId],
    };
    expect(
      createBallotResultPreviewSchema.parse({
        agendaItemId,
        candidate: { ...base, mode: "public", votes: [{ meetingAttendanceId: attendanceId, choice: "approve" }] },
      }).candidate,
    ).toMatchObject({ mode: "public", nonParticipations: [] });
    expect(
      createBallotResultPreviewSchema.parse({
        agendaItemId,
        candidate: { ...base, mode: "secret", totals: { approve: 1, reject: 0, abstain: 0 } },
      }).candidate,
    ).toMatchObject({ mode: "secret", totals: { blank: 0, invalid: 0, nonParticipation: 0 } });
    expect(() =>
      createBallotResultPreviewSchema.parse({
        agendaItemId,
        candidate: { ...base, mode: "secret", votes: [], totals: { approve: 1, reject: 0, abstain: 0 } },
      }),
    ).toThrow();
    expect(() =>
      createBallotResultPreviewSchema.parse({
        agendaItemId,
        candidate: { ...base, mode: "public", votes: [{ meetingAttendanceId: attendanceId, choice: "blank" }] },
      }),
    ).toThrow();
    expect(() =>
      createBallotResultPreviewSchema.parse({
        agendaItemId,
        candidate: { ...base, procedure: "cfu", mode: "public", votes: [] },
      }),
    ).toThrow();
  });

  it("accepts a ballot confirmation without any client time", () => {
    expect(confirmBallotResultPreviewSchema.parse({})).toEqual({});
    expect(() => confirmBallotResultPreviewSchema.parse({ confirmedAt: "2026-09-12T19:40:00+02:00" })).toThrow();
    expect(() => confirmBallotResultPreviewSchema.parse({ candidate: {} })).toThrow();
  });

  it("keeps contacts and council mandates normalized", () => {
    expect(
      saveContactSchema.parse({
        firstName: " Alice ",
        lastName: "Martin",
        organizationName: null,
        jobTitle: null,
        email: null,
        phone: "",
        notes: "",
      }),
    ).toMatchObject({ firstName: "Alice", phone: null });

    const mandate = {
      contactId: "11111111-1111-4111-8111-111111111111",
      role: "councillor" as const,
      termStartedOn: "2026-03-01",
    };
    expect(createCouncilMemberSchema.parse(mandate)).toEqual(mandate);
    expect(
      updateCouncilMemberSchema.parse({
        role: mandate.role,
        termStartedOn: mandate.termStartedOn,
        termEndedOn: "2026-03-01",
      }),
    ).toMatchObject({ termEndedOn: "2026-03-01" });
    expect(() =>
      updateCouncilMemberSchema.parse({
        role: mandate.role,
        termStartedOn: mandate.termStartedOn,
        termEndedOn: "2026-02-28",
      }),
    ).toThrow();
  });

  it("owns committee commands and membership chronology", () => {
    expect(saveCouncilCommitteeSchema.parse({ name: " Finances ", description: "" })).toEqual({
      name: "Finances",
      description: "",
    });
    const membership = { role: "chair" as const, startedOn: "2026-03-01" };
    expect(updateCommitteeMembershipSchema.parse({ ...membership, endedOn: "2026-03-01" })).toMatchObject({
      endedOn: "2026-03-01",
    });
    expect(() => updateCommitteeMembershipSchema.parse({ ...membership, endedOn: "2026-02-28" })).toThrow();
  });
});

// @verifies-requirement HALL-FR-DOC-460
describe("saved measurements in a geographic document", () => {
  const document = {
    view: { kind: "center", center: [4.5, 47.54], zoom: 15 },
    layers: [{ id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 }],
    provenance: {
      attribution: "IGN",
      license: "Licence Ouverte 2.0",
      metadataUrl: "https://geoservices.ign.fr/",
      configuredAt: "2026-10-10T10:00:00.000Z",
      sourceUpdatedAt: null,
    },
  };
  const line = [
    [4.5, 47.54],
    [4.51, 47.54],
  ];
  const ring = [
    [4.5, 47.54],
    [4.51, 47.54],
    [4.51, 47.55],
    [4.5, 47.54],
  ];
  const update = (feature: unknown) =>
    updateResourceContentSchema.safeParse({
      kind: "geographic",
      expectedVersion: 3,
      document: { ...document, hallLayer: { type: "FeatureCollection", features: [feature] } },
    });
  const length = {
    type: "Feature",
    id: "44444444-4444-4444-8444-444444444444",
    properties: { kind: "lengthMeasurement", label: "Chemin du lavoir", length: 764.3 },
    geometry: { type: "LineString", coordinates: line },
  };
  const area = {
    type: "Feature",
    id: "55555555-5555-4555-8555-555555555555",
    properties: { kind: "areaMeasurement", label: "Pré communal", area: 849_800, perimeter: 3_752 },
    geometry: { type: "Polygon", coordinates: [ring] },
  };

  it("accepts a length or area measurement with its geometry, name and value", () => {
    expect(update(length).success).toBe(true);
    expect(update(area).success).toBe(true);
  });

  it("rejects a measurement whose kind, name or value does not match the stored shape", () => {
    expect(update({ ...length, geometry: area.geometry }).success).toBe(false);
    expect(update({ ...area, geometry: length.geometry }).success).toBe(false);
    expect(update({ ...length, properties: { ...length.properties, label: " " } }).success).toBe(false);
    expect(update({ ...length, properties: { ...length.properties, length: -2 } }).success).toBe(false);
    expect(update({ ...area, properties: { kind: "areaMeasurement", label: "Pré", area: 4 } }).success).toBe(false);
  });
});
