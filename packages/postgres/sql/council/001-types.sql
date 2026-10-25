-- @implements-requirement HALL-FR-BAL-010
-- either nominative or anonymous. Its mode determines the shape
-- of every vote recorded for it.
CREATE TYPE hall.ballot_mode AS ENUM (
  'public',
  'secret'
);

-- @implements-requirement HALL-FR-VOT-010
-- expressed by a ballot participant and
-- is excluded from the approve/reject majority comparison.
CREATE TYPE hall.vote_choice AS ENUM (
  'approve',
  'reject',
  'abstain',
  'blank',
  'invalid'
);

-- @implements-requirement HALL-FR-BAL-020
-- result; a completed ballot has an approve or reject result,
-- therefore no artificial "none" result exists.
CREATE TYPE hall.ballot_result AS ENUM (
  'approve',
  'reject'
);

-- @implements-requirement HALL-FR-ATT-010
-- declared present, represented, excused or absent before the meeting starts.
CREATE TYPE hall.meeting_attendance_status AS ENUM (
  'present',
  'represented',
  'excused',
  'absent'
);

CREATE TYPE hall.council_agenda_subject_kind AS ENUM ('minutesApproval','councilDecisionProposal','openQuestion');
