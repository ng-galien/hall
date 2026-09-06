import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  agendaItemSchema,
  agendaSubjectSchema,
  ballotParticipationSchema,
  ballotSchema,
  ballotVoteSchema,
  completeBallotSchema,
  completeOpenQuestionSchema,
  councilBusinessSchema,
  councilMeetingSchema,
  createBallotSchema,
  createCouncilBusinessSchema,
  createCouncilMemberSchema,
  createResourceSchema,
  findSirenAction,
  meetingAttendanceDeclarationSchema,
  meetingAttendanceSchema,
  problemDetailsSchema,
  provisionInitialCouncilMeetingSchema,
  recordBallotVotesSchema,
  recordMeetingAttendanceSchema,
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
  startCouncilMeetingSchema,
  updateCommitteeMembershipSchema,
  updateCouncilMemberSchema,
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
        minutesId: null,
        scheduledAt: "2026-09-12T09:00:00Z",
        location: "Council chamber",
        quorum: 4,
        startedAt: null,
        closedAt: null,
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
      { kind: "openQuestion", id: subjectId },
    ] as const;

    for (const subject of subjects) {
      expect(agendaSubjectSchema.parse(subject)).toEqual(subject);
      expect(
        agendaItemSchema.parse({
          id: agendaItemId,
          councilBusinessId: subject.kind === "minutesApproval" ? null : businessId,
          discussionSummary: "",
          councilMeetingId: meetingId,
          position: 1,
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

    expect(provisionInitialCouncilMeetingSchema.parse({ quorum: 8 })).toEqual({ quorum: 8 });
    expect(() => provisionInitialCouncilMeetingSchema.parse({ quorum: 0 })).toThrow();
    expect(
      scheduleCouncilMeetingSchema.parse({
        scheduledAt: "2026-09-12T09:00:00Z",
        location: " Council chamber ",
      }),
    ).toEqual({ scheduledAt: "2026-09-12T09:00:00Z", location: "Council chamber" });
    expect(startCouncilMeetingSchema.parse({ startedAt: "2026-09-12T09:05:00Z" })).toBeDefined();
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
    expect(startAgendaItemSchema.parse({ startedAt: "2026-09-12T09:10:00Z" })).toBeDefined();
    expect(completeOpenQuestionSchema.parse({ completedAt: "2026-09-12T09:20:00Z" })).toBeDefined();
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

  it("validates ballot creation, recording and completion commands", () => {
    const agendaItemId = "40000000-0000-4000-8000-000000000001";
    const attendanceId = "10000000-0000-4000-8000-000000000001";
    const otherAttendanceId = "20000000-0000-4000-8000-000000000001";
    const participationId = "30000000-0000-4000-8000-000000000001";

    expect(
      createBallotSchema.parse({
        agendaItemId,
        mode: "public",
        participantAttendanceIds: [attendanceId, otherAttendanceId],
        chairmanAttendanceId: attendanceId,
      }),
    ).toMatchObject({ mode: "public" });
    expect(() =>
      createBallotSchema.parse({
        agendaItemId,
        mode: "public",
        participantAttendanceIds: [attendanceId],
        chairmanAttendanceId: otherAttendanceId,
      }),
    ).toThrow();
    expect(
      recordBallotVotesSchema.parse({
        mode: "public",
        votes: [{ ballotParticipationId: participationId, choice: "approve" }],
      }),
    ).toMatchObject({ mode: "public" });
    expect(
      recordBallotVotesSchema.parse({
        mode: "secret",
        totals: { approve: 2, reject: 1, abstain: 0 },
      }),
    ).toMatchObject({ mode: "secret" });
    expect(() =>
      recordBallotVotesSchema.parse({
        mode: "secret",
        totals: { approve: 0, reject: 0, abstain: 0 },
      }),
    ).toThrow();
    expect(completeBallotSchema.parse({ completedAt: "2026-09-12T09:30:00Z" })).toBeDefined();
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
