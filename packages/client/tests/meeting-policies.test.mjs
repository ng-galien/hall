import assert from "node:assert/strict";
import { test } from "vitest";
import { pendingBallotDecisions } from "../src/pages/council-meetings/ballotDecisionPolicy.ts";
import { meetingOpeningBlock } from "../src/pages/council-meetings/meetingOpeningPolicy.ts";

const meeting = (overrides = {}) => ({
  id: "meeting",
  title: "Meeting",
  startsAt: "2026-09-10T18:30:00.000Z",
  location: "Council room",
  status: "scheduled",
  chairMemberId: "chair",
  secretaryMemberId: "secretary",
  meetingNoticeSentAt: null,
  meetingNoticePublishedAt: null,
  isUrgent: false,
  urgencyApproved: null,
  isReconvenedMeeting: false,
  previousMeetingId: null,
  quorumFailure: null,
  minutesStatus: "notStarted",
  minutesApprovedAt: null,
  minutesSignedAt: null,
  minutesPublishedAt: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...overrides,
});

const attendance = (memberId, status = "present") => ({
  id: `attendance-${memberId}`,
  meetingId: "meeting",
  memberId,
  status,
  proxyHolderMemberId: null,
  proxyDocumentId: null,
  version: 1,
});

const aggregate = (overrides = {}) => ({
  meeting: meeting(),
  rosterMemberIds: ["chair", "secretary", "member"],
  attendance: [attendance("chair"), attendance("secretary"), attendance("member")],
  agendaItems: [],
  councilDecisions: [],
  ballots: [],
  quorum: { activeMembers: 3, physicallyPresent: 3, required: 2, reached: true },
  ...overrides,
});

test("meeting opening validates entries but leaves quorum assessment to the server", () => {
  assert.equal(meetingOpeningBlock(aggregate()), null);
  assert.equal(
    meetingOpeningBlock(aggregate({ attendance: [attendance("chair"), attendance("secretary")] })),
    "attendanceIncomplete",
  );
  assert.equal(
    meetingOpeningBlock(aggregate({ quorum: { activeMembers: 3, physicallyPresent: 1, required: 2, reached: false } })),
    null,
  );
  assert.equal(meetingOpeningBlock(aggregate({ meeting: meeting({ secretaryMemberId: null }) })), "officersMissing");
  assert.equal(
    meetingOpeningBlock(
      aggregate({ attendance: [attendance("chair"), attendance("secretary", "represented"), attendance("member")] }),
    ),
    "officersNotPresent",
  );
});

test("ballot candidates exclude proposals that already have a recorded ballot", () => {
  const decision = (id) => ({
    id,
    number: null,
    title: id,
    draftText: "Draft",
    status: "draft",
    legalityReviewRequired: true,
    submittedForLegalityReviewAt: null,
    publishedAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  });
  const agendaItems = ["ready", "recorded"].map((id, index) => ({
    id: `agenda-${id}`,
    meetingId: "meeting",
    position: index + 1,
    discussionSummary: "",
    status: "scheduled",
    startedAt: null,
    completedAt: null,
    business: {
      id: `business-${id}`,
      kind: "matter",
      councilDecisionId: id,
      title: id,
      report: "",
      folderPath: "",
      resources: [],
      committeeId: null,
      preparationDeadline: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  }));
  const ballotAggregate = aggregate({
    agendaItems,
    councilDecisions: [decision("ready"), decision("recorded")],
    ballots: [{ councilDecisionId: "recorded" }],
  });
  assert.deepEqual(
    pendingBallotDecisions(ballotAggregate).map((item) => item.id),
    ["ready"],
  );
});
