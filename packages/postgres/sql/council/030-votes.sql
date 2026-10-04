-- Entity: a recorded choice in a ballot. A public row belongs to one named
-- BallotParticipation and always counts once. A secret row is anonymous and
-- aggregates one or more identical choices.
CREATE TABLE hall.votes (
  ballot UUID NOT NULL,
  mode ballot_mode NOT NULL,
  choice vote_choice NOT NULL,
  ballot_participation UUID,

  -- @functional-requirement HALL-FR-VOT-020 VOTE_COUNT_IS_POSITIVE: Every row records at least
  -- one expressed choice.
  count INTEGER NOT NULL CONSTRAINT "votes_count_check" CHECK (count > 0),
  FOREIGN KEY (ballot) REFERENCES ballots (id),
  FOREIGN KEY (ballot_participation) REFERENCES ballot_participation (id),

  -- @functional-requirement HALL-FR-VOT-030 PUBLIC_AND_SECRET_VOTES_HAVE_DISTINCT_SHAPES: Public
  -- and secret votes are mutually exclusive structural
  -- forms. Public votes are nominative and singular; secret votes are anonymous.
  CONSTRAINT "votes_check" CHECK (mode = 'public'::hall.ballot_mode AND ballot_participation IS NOT NULL AND count = 1 AND (choice = ANY (ARRAY['approve'::hall.vote_choice, 'reject'::hall.vote_choice, 'abstain'::hall.vote_choice])) OR mode = 'secret'::hall.ballot_mode AND ballot_participation IS NULL)
);

-- @functional-requirement HALL-FR-VOT-040 ONE_PUBLIC_VOTE_PER_PARTICIPATION: One
-- BallotParticipation produces at most one public vote. The
-- referenced participation already identifies its ballot, so no composite key
-- is needed here.
CREATE UNIQUE INDEX votes_one_public_vote_per_participation ON hall.votes USING btree (ballot_participation) WHERE (ballot_participation IS NOT NULL);

-- @functional-requirement HALL-FR-VOT-050 ONE_SECRET_AGGREGATE_PER_CHOICE: A secret ballot stores
-- at most one aggregate row for each choice.
-- The ballot legitimately scopes this business uniqueness.
CREATE UNIQUE INDEX votes_one_secret_count_per_choice ON hall.votes USING btree (ballot, choice) WHERE (mode = 'secret'::hall.ballot_mode);
