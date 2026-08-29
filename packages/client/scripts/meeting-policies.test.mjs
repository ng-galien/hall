import assert from "node:assert/strict";
import test from "node:test";
import { pendingBallotDecisions } from "../src/pages/council-meetings/ballotDecisionPolicy.ts";
import { meetingOpeningBlock } from "../src/pages/council-meetings/meetingOpeningPolicy.ts";
import {
  initialSecretBallotTotals,
  reconcileSecretBallotTotals,
  secretBallotTotal,
} from "../src/pages/council-meetings/secretBallotTotals.ts";

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

test("secret ballot totals follow participation without discarding a valid distribution", () => {
  const defaultTotals = reconcileSecretBallotTotals(initialSecretBallotTotals(3), 3, 2);
  assert.deepEqual(defaultTotals, { votesFor: 0, votesAgainst: 0, abstentions: 0, notVoting: 2 });

  const enteredTotals = { votesFor: 1, votesAgainst: 1, abstentions: 0, notVoting: 1 };
  const reconciled = reconcileSecretBallotTotals(enteredTotals, 3, 2);
  assert.deepEqual(reconciled, { votesFor: 1, votesAgainst: 1, abstentions: 0, notVoting: 0 });
  assert.equal(secretBallotTotal(reconciled), 2);

  const alreadyValid = { votesFor: 1, votesAgainst: 0, abstentions: 1, notVoting: 0 };
  assert.strictEqual(reconcileSecretBallotTotals(alreadyValid, 3, 2), alreadyValid);
});

test("meeting opening requires complete attendance, quorum, and physically present officers", () => {
  assert.equal(meetingOpeningBlock(aggregate()), null);
  assert.equal(
    meetingOpeningBlock(aggregate({ attendance: [attendance("chair"), attendance("secretary")] })),
    "attendanceIncomplete",
  );
  assert.equal(
    meetingOpeningBlock(aggregate({ quorum: { activeMembers: 3, physicallyPresent: 1, required: 2, reached: false } })),
    "quorumNotReached",
  );
  assert.equal(meetingOpeningBlock(aggregate({ meeting: meeting({ secretaryMemberId: null }) })), "officersMissing");
  assert.equal(
    meetingOpeningBlock(
      aggregate({ attendance: [attendance("chair"), attendance("secretary", "represented"), attendance("member")] }),
    ),
    "officersNotPresent",
  );
});

test("ballot candidates exclude decisions already final or recorded", () => {
  const decision = (id, status) => ({
    id,
    number: null,
    title: id,
    draftText: "Draft",
    status,
    legalityReviewRequired: true,
    submittedForLegalityReviewAt: null,
    publishedAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  });
  const agendaItems = ["ready", "adopted", "rejected", "recorded"].map((id, index) => ({
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
    councilDecisions: [
      decision("ready", "ready"),
      decision("adopted", "adopted"),
      decision("rejected", "rejected"),
      decision("recorded", "ready"),
    ],
    ballots: [{ councilDecisionId: "recorded" }],
  });
  assert.deepEqual(
    pendingBallotDecisions(ballotAggregate).map((item) => item.id),
    ["ready"],
  );
});
