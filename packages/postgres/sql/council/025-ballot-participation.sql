-- Entity: one immutable declaration that a meeting attendance takes part in a
-- particular ballot. Existence of the row is the participation fact; there is
-- no participation status.
CREATE TABLE hall.ballot_participation (
  id UUID PRIMARY KEY,
  ballot UUID NOT NULL REFERENCES ballots (id),
  meeting_attendance UUID NOT NULL REFERENCES meeting_attendance (id),
  physically_present BOOLEAN NOT NULL,

  -- @functional-requirement HALL-FR-BAL-050 ONE_PARTICIPATION_PER_ATTENDANCE_AND_BALLOT: One
  -- attendance participates at most once in one ballot. This
  -- composite uniqueness scopes a business fact; it is not the entity identity.
  UNIQUE (ballot, meeting_attendance)
);

-- @functional-requirement HALL-FR-BAL-060 BALLOT_CHAIRMAN_IS_BALLOT_PARTICIPATION: The ballot
-- chairman directly references a BallotParticipation. The
-- foreign key is deferred because the ballot and its participations form one
-- atomic creation cycle.
-- @technical-requirement HALL-TR-CON-050 BALLOT_PARTICIPATION_CYCLE_IS_ATOMIC:
-- Deferred referential validation permits the cyclic ballot and participation
-- facts to be created atomically in one transaction.
ALTER TABLE hall.ballots
  ADD FOREIGN KEY (chairman)
  REFERENCES ballot_participation (id)
  DEFERRABLE INITIALLY DEFERRED;
