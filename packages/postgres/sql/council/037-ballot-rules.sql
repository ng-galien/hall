-- @implements-requirement HALL-FR-BAL-110
-- participation count is the number of attendances declared as taking part in a
-- ballot. It is the expected number of expressed choices at completion.
CREATE FUNCTION hall.ballot_participation_count(target_ballot UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $$
  SELECT COUNT(*)::INTEGER
  FROM ballot_participation
  WHERE ballot = target_ballot;
$$;

-- @implements-requirement HALL-FR-BAL-120
-- is the number of choices recorded for a ballot. Public votes
-- contribute one; each secret aggregate contributes its strictly positive
-- count.
CREATE FUNCTION hall.ballot_vote_count(target_ballot UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $$
  SELECT COALESCE(SUM(count), 0)::INTEGER
  FROM votes
  WHERE ballot = target_ballot;
$$;

-- @implements-requirement HALL-FR-BAL-130
-- count is the number of recorded votes carrying that particular choice.
CREATE FUNCTION hall.ballot_choice_count(
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

-- @implements-requirement HALL-FR-BAL-140
-- is a participation in the target
-- ballot and its underlying attendance is physically present, not represented.
CREATE FUNCTION hall.ballot_has_valid_chairman(
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
      AND ballot_participation.physically_present
  );
$$;

CREATE FUNCTION hall.ordinary_majority_result(mode hall.ballot_mode,approve_count INTEGER,reject_count INTEGER,chairman_choice hall.vote_choice)
RETURNS hall.ballot_result LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,hall AS $$
 SELECT CASE WHEN approve_count>reject_count THEN 'approve'::hall.ballot_result
   WHEN reject_count>approve_count THEN 'reject'::hall.ballot_result
   WHEN mode='public' AND chairman_choice IN ('approve','reject') THEN chairman_choice::text::hall.ballot_result
   ELSE 'reject'::hall.ballot_result END;
$$;

-- Ballot result is derived from the immutable recorded votes.
CREATE FUNCTION hall.derive_ballot_result(target_ballot UUID)
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

  -- @implements-requirement HALL-FR-BAL-150
  -- not suffrages expressed and are therefore
  -- deliberately absent from both counts.
  approve_count := ballot_choice_count(target_ballot, 'approve');
  reject_count := ballot_choice_count(target_ballot, 'reject');

  -- @implements-requirement HALL-FR-BAL-160
  -- @implements-requirement HALL-FR-BAL-170
  -- @implements-requirement HALL-FR-BAL-180
  -- @implements-requirement HALL-FR-BAL-190
  SELECT choice INTO chairman_choice FROM votes WHERE ballot=target_ballot AND ballot_participation=current_chairman;
  RETURN hall.ordinary_majority_result(current_mode,approve_count,reject_count,chairman_choice);
END;
$$;
