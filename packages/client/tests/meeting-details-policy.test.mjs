import assert from "node:assert/strict";
import { test } from "vitest";
import { meetingDetailsSubmission } from "../src/pages/council-meetings/meetingDetailsPolicy.ts";

const scheduledAt = "2026-11-16T19:00:00.000Z";
const undesignated = { chairMemberId: null, secretaryMemberId: null };
const draft = (overrides = {}) => ({
  scheduledAt,
  location: "Salle du conseil",
  chairMemberId: "",
  secretaryMemberId: "",
  ...overrides,
});

test("saves the date and location alone while both officers remain to be designated", () => {
  assert.deepEqual(meetingDetailsSubmission(draft(), undesignated), {
    kind: "schedule",
    input: { scheduledAt, location: "Salle du conseil" },
  });
});

test("prepares the meeting when the chair and the secretary are both chosen", () => {
  assert.deepEqual(
    meetingDetailsSubmission(draft({ chairMemberId: "chair", secretaryMemberId: "secretary" }), undesignated),
    {
      kind: "prepare",
      input: { scheduledAt, location: "Salle du conseil", chairMemberId: "chair", secretaryMemberId: "secretary" },
    },
  );
});

test("names the officer left to be designated when only the other one is chosen", () => {
  assert.deepEqual(meetingDetailsSubmission(draft({ chairMemberId: "chair" }), undesignated), {
    kind: "invalid",
    errors: { secretaryMemberId: "meetings.officersDesignatedTogether" },
  });
  assert.deepEqual(meetingDetailsSubmission(draft({ secretaryMemberId: "secretary" }), undesignated), {
    kind: "invalid",
    errors: { chairMemberId: "meetings.officersDesignatedTogether" },
  });
});

test("keeps an officer already designated from returning to be designated", () => {
  assert.deepEqual(
    meetingDetailsSubmission(draft({ chairMemberId: "chair" }), {
      chairMemberId: "chair",
      secretaryMemberId: "secretary",
    }),
    { kind: "invalid", errors: { secretaryMemberId: "meetings.officerCannotBeRemoved" } },
  );
});

test("names a missing location and an impossible local time under their fields", () => {
  assert.deepEqual(meetingDetailsSubmission(draft({ location: "  " }), undesignated), {
    kind: "invalid",
    errors: { location: "meetings.locationRequired" },
  });
  assert.deepEqual(meetingDetailsSubmission(draft({ scheduledAt: null }), undesignated), {
    kind: "invalid",
    errors: { startsAt: "meetings.invalidLocalTime" },
  });
});
