import { minutesDetailSchema as httpMinutesSchema } from "@hall/api-contract";
import { PostgresMinutes, ProjectionValidationError } from "@hall/postgres";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { renderMinutesSections } from "../src/services/minutesDocument.js";

const recordedAt = "2026-09-05T20:00:00+02:00";
const minutesId = "00000000-0000-4000-8000-000000000001";
const meetingId = "00000000-0000-4000-8000-000000000002";
const previousMeeting = {
  id: "00000000-0000-4000-8000-000000000003",
  number: 1,
  scheduledAt: "2026-09-01T18:00:00+02:00",
  startedAt: "2026-09-01T18:05:00+02:00",
};

// This is the stored shape produced before the second-convocation field existed.
const historicalMinutes = {
  id: minutesId,
  councilMeetingId: meetingId,
  meetingNumber: 2,
  scheduledAt: recordedAt,
  createdAt: recordedAt,
  updatedAt: recordedAt,
  version: 1,
  generatedAt: null,
  documentId: null,
  settledAt: null,
  sections: [],
  facts: {
    meeting: {
      id: meetingId,
      number: 2,
      scheduledAt: recordedAt,
      startedAt: recordedAt,
      closedAt: recordedAt,
      location: "Salle du conseil",
      quorum: 1,
      chair: null,
      secretary: null,
    },
    attendance: [],
    recusals: [],
    conduct: {
      membershipRecords: [],
      attendanceEvents: [],
      quorumObservations: [],
      reconvocations: [],
      officerChanges: [],
      auxiliaryAttendances: [],
      proxyExceptions: [],
      closedSessions: [],
    },
    agenda: [],
    ballots: [],
  },
};

async function readStoredProjection(payload: unknown) {
  // Supply a historical database result to the real transaction and projection decoder.
  const query = vi.fn().mockResolvedValue({ rows: [{ payload }], rowCount: 1 });
  const pool = {
    connect: async () => ({ query, release: vi.fn() }),
  } as unknown as Pool;
  const minutes = await new PostgresMinutes(pool).open(
    {
      role: "hall_api_authenticated",
      context: { requestId: "historical-minutes", actorId: "test-clerk", contactId: null, roles: ["administrator"] },
    },
    minutesId,
  );
  expect(query).toHaveBeenCalledWith("SELECT hall_api.open_minutes($1::uuid) AS payload", [minutesId]);
  return minutes;
}

function withReconvocation(value: unknown) {
  return {
    ...historicalMinutes,
    facts: { ...historicalMinutes.facts, meeting: { ...historicalMinutes.facts.meeting, reconvenedFrom: value } },
  };
}

describe("historical minutes projections", () => {
  // @verifies-requirement HALL-FR-MIN-060
  // @verifies-requirement HALL-FR-MIN-070
  it("reads the historical facts unchanged through PostgreSQL and HTTP contracts without inventing a reconvocation", async () => {
    const snapshot = structuredClone(historicalMinutes);
    const minutes = httpMinutesSchema.parse(await readStoredProjection(historicalMinutes));
    expect(minutes).toStrictEqual(snapshot);
    expect(minutes.facts.meeting).not.toHaveProperty("reconvenedFrom");
    expect(historicalMinutes).toStrictEqual(snapshot);
    expect(renderMinutesSections(minutes).facts).not.toContain("Séance tenue sur seconde convocation");
  });

  // @verifies-requirement HALL-FR-MTG-290
  it.each([null, previousMeeting])("preserves an explicitly captured reconvocation value: %j", async (value) => {
    const payload = withReconvocation(value);
    const minutes = httpMinutesSchema.parse(await readStoredProjection(payload));
    expect(minutes).toStrictEqual(payload);
    expect(renderMinutesSections(minutes).facts.includes("Séance tenue sur seconde convocation")).toBe(value !== null);
  });

  it.each([
    {},
    { ...previousMeeting, id: "not-a-uuid" },
    { ...previousMeeting, number: 0 },
    { ...previousMeeting, startedAt: null },
    { ...previousMeeting, invented: true },
  ])("rejects a malformed present reconvocation at both boundaries: %j", async (value) => {
    const payload = withReconvocation(value);
    await expect(readStoredProjection(payload)).rejects.toBeInstanceOf(ProjectionValidationError);
    expect(httpMinutesSchema.safeParse(payload).success).toBe(false);
  });

  it("keeps other historical facts mandatory", async () => {
    const payload = {
      ...historicalMinutes,
      facts: { ...historicalMinutes.facts, meeting: { ...historicalMinutes.facts.meeting, quorum: undefined } },
    };
    await expect(readStoredProjection(payload)).rejects.toBeInstanceOf(ProjectionValidationError);
    expect(httpMinutesSchema.safeParse(payload).success).toBe(false);
  });
});
