-- @functional-requirement HALL-FR-BAL-010 BALLOT_MODE_DETERMINES_VOTE_ANONYMITY: A ballot is
-- either nominative or anonymous. Its mode determines the shape
-- of every vote recorded for it.
CREATE TYPE ballot_mode AS ENUM (
  'public',
  'secret'
);

-- @functional-requirement HALL-FR-VOT-010 ABSTENTION_IS_RECORDED: Abstention is a recorded vote
-- expressed by a ballot participant and
-- is excluded from the approve/reject majority comparison.
CREATE TYPE vote_choice AS ENUM (
  'approve',
  'reject',
  'abstain',
  'blank',
  'invalid'
);

-- @functional-requirement HALL-FR-BAL-020 OPEN_BALLOT_HAS_NO_RESULT: An open ballot has a NULL
-- result; a completed ballot has an approve or reject result,
-- therefore no artificial "none" result exists.
CREATE TYPE ballot_result AS ENUM (
  'approve',
  'reject'
);

-- @functional-requirement HALL-FR-ATT-010 ATTENDANCE_STATUS_IS_EXPLICIT: Each council member is
-- declared present, represented, excused or absent before the meeting starts.
CREATE TYPE meeting_attendance_status AS ENUM (
  'present',
  'represented',
  'excused',
  'absent'
);

CREATE TYPE council_agenda_subject_kind AS ENUM ('minutesApproval','councilDecisionProposal','openQuestion');
