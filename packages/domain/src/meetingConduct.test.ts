import { describe, expect, it } from "vitest";
import {
  declareMeetingAuxiliaryAttendanceSchema,
  meetingAgendaCanChange,
  meetingConductEvidenceSchema,
  meetingConductStateSchema,
  meetingQuorumObservationSchema,
  meetingReconvocationSchema,
  recordMeetingAttendanceEventsSchema,
  recordMeetingQuorumSchema,
  recordMeetingReconvocationSchema,
} from "./meetingConduct.js";

const meetingId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const attendanceId = "33333333-3333-4333-8333-333333333333";
const recordId = "44444444-4444-4444-8444-444444444444";
const agendaItemId = "55555555-5555-4555-8555-555555555555";
const observationId = "66666666-6666-4666-8666-666666666666";
const time = "2026-10-03T18:00:00+02:00";

const attendance = {
  id: attendanceId,
  councilMemberId: memberId,
  status: "present",
  proxyHolderAttendanceId: null,
  proxyDocumentId: null,
  observedAt: time,
};
const facts = {
  membershipRecordId: recordId,
  membersInOffice: [{ councilMemberId: memberId, name: "Camille Martin" }],
  membershipObservedAt: time,
  membershipSourceReference: "Tableau du conseil",
  memberCount: 1,
  excludedMemberIds: [],
  denominatorExcludedMemberIds: [],
  denominator: 1,
  requiredPresent: 1,
  presentMemberIds: [memberId],
  presentCount: 1,
  regime: "ordinary",
  verdict: "met",
  reconvocationId: null,
  attendance: [attendance],
  remainingAgendaItemIds: [agendaItemId],
};
const evidence = { councilMeetingId: meetingId, observedAt: time, recordedAt: time, recordedBy: "secretary" };
const observation = { id: observationId, ...evidence, agendaItemId: null, facts };
const reconvocation = {
  id: "77777777-7777-4777-8777-777777777777",
  councilMeetingId: meetingId,
  failedObservationId: observationId,
  sentAt: time,
  scheduledAt: "2026-10-06T18:00:00+02:00",
  timeZone: "Europe/Paris",
  firstNoticeEvidence: "Convocation du 26 septembre",
  renewedNoticeEvidence: "Convocation du 3 octobre",
  agendaItemIds: [agendaItemId],
  recordedAt: time,
  recordedBy: "secretary",
};

describe("meeting conduct evidence", () => {
  it("accepts a complete conduct state", () => {
    const state = {
      councilMeetingId: meetingId,
      membershipRecords: [
        { id: recordId, ...evidence, sourceReference: "Tableau du conseil", members: facts.membersInOffice },
      ],
      attendanceEvents: [
        {
          id: "88888888-8888-4888-8888-888888888888",
          meetingAttendanceId: attendanceId,
          observedAt: time,
          recordedAt: time,
          recordedBy: "secretary",
          status: "present",
          proxyHolderAttendanceId: null,
          proxyDocumentId: null,
        },
      ],
      quorumObservations: [observation],
      reconvocations: [reconvocation],
      officerChanges: [
        {
          id: "99999999-9999-4999-8999-999999999999",
          councilMeetingId: meetingId,
          office: "chair",
          basis: "deputyInNominationOrder",
          councilMemberId: memberId,
          memberName: "Camille Martin",
          observedAt: time,
          recordedAt: time,
          recordedBy: "secretary",
        },
      ],
      auxiliaryAttendances: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          councilMeetingId: meetingId,
          contactId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          name: "Claire Martin",
          quality: "secrétaire de mairie",
          declaredAt: time,
          recordedAt: time,
          recordedBy: "secretary",
        },
      ],
      proxyExceptions: [],
      closedSessions: [],
      currentAttendance: [attendance],
      canRecordAttendanceEvents: true,
      currentOfficers: { chairMemberId: memberId, secretaryMemberId: null },
      officerHandoverOptions: {
        chair: [],
        secretary: [{ councilMemberId: memberId, basis: "councilNomination" }],
        proposedChairMemberId: null,
      },
      canRecordOfficerChange: true,
      canDeclareAuxiliaryAttendance: true,
      canRecordClosedSession: true,
      canRecordQuorum: true,
      canRecordReconvocation: false,
    };
    expect(meetingConductStateSchema.parse(state)).toEqual(state);
  });

  it("reads conduct evidence closed before officer events and attending persons existed", () => {
    expect(
      meetingConductEvidenceSchema.parse({
        membershipRecords: [],
        attendanceEvents: [],
        quorumObservations: [],
        reconvocations: [],
      }),
    ).toMatchObject({ officerChanges: [], auxiliaryAttendances: [], proxyExceptions: [], closedSessions: [] });
  });

  it("accepts a free capacity and requires either a contact or a full new name", () => {
    expect(
      declareMeetingAuxiliaryAttendanceSchema.parse({
        person: { kind: "contact", contactId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
        quality: "  ",
        declaredAt: time,
      }).quality,
    ).toBeNull();
    expect(() =>
      declareMeetingAuxiliaryAttendanceSchema.parse({
        person: { kind: "newContact", firstName: "Jean", lastName: " " },
        quality: null,
        declaredAt: time,
      }),
    ).toThrow();
  });

  it("requires a time-zone offset on observed instants", () => {
    expect(() => meetingQuorumObservationSchema.parse({ ...observation, observedAt: "2026-10-03T18:00:00" })).toThrow();
  });

  it("rejects an unknown quorum verdict or regime", () => {
    expect(() =>
      meetingQuorumObservationSchema.parse({ ...observation, facts: { ...facts, verdict: "pending" } }),
    ).toThrow();
    expect(() =>
      meetingQuorumObservationSchema.parse({ ...observation, facts: { ...facts, regime: "urgent" } }),
    ).toThrow();
  });

  it("rejects quorum facts without members in office", () => {
    expect(() =>
      meetingQuorumObservationSchema.parse({ ...observation, facts: { ...facts, membersInOffice: [] } }),
    ).toThrow();
  });

  it("rejects undeclared fields", () => {
    expect(() => meetingReconvocationSchema.parse({ ...reconvocation, note: "x" })).toThrow();
  });
});

describe("meeting conduct commands", () => {
  it("requires at least one attendance change", () => {
    expect(() => recordMeetingAttendanceEventsSchema.parse({ observedAt: time, changes: [] })).toThrow();
    expect(
      recordMeetingAttendanceEventsSchema.parse({
        observedAt: time,
        changes: [
          { councilMemberId: memberId, status: "excused", proxyHolderCouncilMemberId: null, proxyDocumentId: null },
        ],
      }).changes,
    ).toHaveLength(1);
  });

  it("records a quorum observation for the meeting or for one agenda item", () => {
    expect(recordMeetingQuorumSchema.parse({ agendaItemId: null, observedAt: time }).agendaItemId).toBeNull();
    expect(recordMeetingQuorumSchema.parse({ agendaItemId, observedAt: time }).agendaItemId).toBe(agendaItemId);
  });

  it("requires non-blank notice evidence and at least one agenda item for a reconvocation", () => {
    const command = {
      failedObservationId: observationId,
      sentAt: time,
      scheduledAt: reconvocation.scheduledAt,
      timeZone: "Europe/Paris",
      firstNoticeEvidence: "  Convocation du 26 septembre  ",
      renewedNoticeEvidence: "Convocation du 3 octobre",
      agendaItemIds: [agendaItemId],
    };
    expect(recordMeetingReconvocationSchema.parse(command).firstNoticeEvidence).toBe("Convocation du 26 septembre");
    expect(() => recordMeetingReconvocationSchema.parse({ ...command, renewedNoticeEvidence: "   " })).toThrow();
    expect(() => recordMeetingReconvocationSchema.parse({ ...command, agendaItemIds: [] })).toThrow();
  });
});

describe("meeting agenda changes", () => {
  it("allows agenda changes only before the meeting opens", () => {
    expect(meetingAgendaCanChange("draft")).toBe(true);
    expect(meetingAgendaCanChange("scheduled")).toBe(true);
    expect(meetingAgendaCanChange("inProgress")).toBe(false);
    expect(meetingAgendaCanChange("closed")).toBe(false);
    expect(meetingAgendaCanChange("cancelled")).toBe(false);
  });
});
