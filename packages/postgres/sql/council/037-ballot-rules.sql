-- @functional-requirement HALL-FR-BAL-110 BALLOT_PARTICIPATION_COUNT_USES_DECLARATIONS: The
-- participation count is the number of attendances declared as taking part in a
-- ballot. It is the expected number of expressed choices at completion.
CREATE FUNCTION ballot_participation_count(target_ballot UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $$
  SELECT COUNT(*)::INTEGER
  FROM ballot_participation
  WHERE ballot = target_ballot;
$$;

-- @functional-requirement HALL-FR-BAL-120 BALLOT_VOTE_COUNT_SUMS_RECORDED_COUNTS: The vote count
-- is the number of choices recorded for a ballot. Public votes
-- contribute one; each secret aggregate contributes its strictly positive
-- count.
CREATE FUNCTION ballot_vote_count(target_ballot UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $$
  SELECT COALESCE(SUM(count), 0)::INTEGER
  FROM votes
  WHERE ballot = target_ballot;
$$;

-- @functional-requirement HALL-FR-BAL-130 BALLOT_CHOICE_COUNT_FILTERS_RECORDED_VOTES: A choice
-- count is the number of recorded votes carrying that particular choice.
CREATE FUNCTION ballot_choice_count(
  target_ballot UUID,
  target_choice vote_choice
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $$
  SELECT COALESCE(SUM(count), 0)::INTEGER
  FROM votes
  WHERE ballot = target_ballot
    AND choice = target_choice;
$$;

-- @functional-requirement HALL-FR-BAL-140 BALLOT_CHAIRMAN_IS_PRESENT_PARTICIPATION: The chairman
-- is a participation in the target
-- ballot and its underlying attendance is physically present, not represented.
CREATE FUNCTION ballot_has_valid_chairman(
  target_ballot UUID,
  target_chairman UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM ballot_participation
    JOIN meeting_attendance
      ON meeting_attendance.id = ballot_participation.meeting_attendance
    WHERE ballot_participation.id = target_chairman
      AND ballot_participation.ballot = target_ballot
      AND meeting_attendance.status = 'present'
  );
$$;

-- Ballot result is derived from the immutable recorded votes.
CREATE FUNCTION derive_ballot_result(target_ballot UUID)
RETURNS ballot_result
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, hall
AS $$
DECLARE
  current_mode ballot_mode;
  current_chairman UUID;
  approve_count INTEGER;
  reject_count INTEGER;
  chairman_choice vote_choice;
BEGIN
  -- Referential invariant: result derivation is defined only for an existing
  -- ballot whose immutable mode and chairman determine the tie rule.
  SELECT mode, chairman
  INTO current_mode, current_chairman
  FROM ballots
  WHERE id = target_ballot;

  -- Diagnostic invariant: never silently derive a result for an unknown ballot.
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV902',
      MESSAGE = format('unknown ballot %s', target_ballot);
  END IF;

  -- @functional-requirement HALL-FR-BAL-150 ABSTENTION_IS_EXCLUDED_FROM_MAJORITY: Abstentions are
  -- not suffrages expressed and are therefore
  -- deliberately absent from both counts.
  approve_count := ballot_choice_count(target_ballot, 'approve');
  reject_count := ballot_choice_count(target_ballot, 'reject');

  -- @functional-requirement HALL-FR-BAL-160 APPROVE_MAJORITY_ADOPTS_BALLOT: An approve majority
  -- adopts the proposal.
  IF approve_count > reject_count THEN
    RETURN 'approve';
  END IF;

  -- @functional-requirement HALL-FR-BAL-170 REJECT_MAJORITY_REJECTS_BALLOT: A reject majority
  -- rejects the proposal.
  IF reject_count > approve_count THEN
    RETURN 'reject';
  END IF;

  -- @functional-requirement HALL-FR-BAL-180 PUBLIC_TIE_USES_CHAIRMAN_CHOICE: Only a public ballot
  -- may use the chairman's named vote as the
  -- casting vote.
  IF current_mode = 'public' THEN
    SELECT choice
    INTO chairman_choice
    FROM votes
    WHERE ballot = target_ballot
      AND ballot_participation = current_chairman;

    -- The casting vote applies only when the chairman expressed approve or
    -- reject; an abstention does not manufacture an expressed suffrage.
    IF chairman_choice IN ('approve', 'reject') THEN
      RETURN chairman_choice::TEXT::ballot_result;
    END IF;
  END IF;

  -- @functional-requirement HALL-FR-BAL-190 SECRET_OR_UNDECIDED_TIE_REJECTS_BALLOT: A secret tie,
  -- or a public tie without a decisive chairman choice, rejects.
  RETURN 'reject';
END;
$$;
