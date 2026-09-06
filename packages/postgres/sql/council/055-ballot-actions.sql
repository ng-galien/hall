-- Named ballot and vote actions
-- =============================

-- @technical-requirement HALL-TR-CON-150 BALLOT_CREATION_IS_ATOMIC:
-- Ballot and participation identities are created in one transaction. The
-- caller names meeting attendance facts and never manufactures persistence
-- identities for BallotParticipation.
CREATE FUNCTION create_ballot(
  target_agenda_item UUID,
  target_mode ballot_mode,
  participant_attendances UUID[],
  chairman_attendance UUID,
  reviewed_preview UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  ballot_id UUID := gen_random_uuid();
  chairman_participation_id UUID := gen_random_uuid();
  participant_attendance UUID;
BEGIN
  INSERT INTO ballots (
    id,
    council_agenda_item,
    mode,
    chairman,
    result_preview
  ) VALUES (
    ballot_id,
    target_agenda_item,
    target_mode,
    chairman_participation_id,
    reviewed_preview
  );

  FOREACH participant_attendance IN ARRAY participant_attendances LOOP
    INSERT INTO ballot_participation (
      id,
      ballot,
      meeting_attendance
    ) VALUES (
      CASE
        WHEN participant_attendance = chairman_attendance THEN chairman_participation_id
        ELSE gen_random_uuid()
      END,
      ballot_id,
      participant_attendance
    );
  END LOOP;

  RETURN ballot_id;
END;
$function$;

-- @technical-requirement HALL-TR-CON-160 PUBLIC_VOTES_ARE_RECORDED_ATOMICALLY:
CREATE FUNCTION record_public_ballot_votes(
  target_ballot UUID,
  participant_ids UUID[],
  choices vote_choice[]
)
RETURNS VOID
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog, hall
AS $function$
  INSERT INTO votes (
    ballot,
    mode,
    choice,
    ballot_participation,
    count
  )
  SELECT
    target_ballot,
    'public',
    vote.choice,
    vote.participant_id,
    1
  FROM unnest(participant_ids, choices) AS vote(participant_id, choice)
$function$;

-- @technical-requirement HALL-TR-CON-170 SECRET_VOTES_ARE_RECORDED_ATOMICALLY:
CREATE FUNCTION record_secret_ballot_votes(
  target_ballot UUID, approve_count INTEGER, reject_count INTEGER, abstain_count INTEGER,
  blank_count INTEGER, invalid_count INTEGER, non_participation_count INTEGER
)
RETURNS VOID LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,hall AS $$
BEGIN
  IF approve_count IS NULL OR reject_count IS NULL OR abstain_count IS NULL OR blank_count IS NULL
    OR invalid_count IS NULL OR non_participation_count IS NULL
    OR least(approve_count,reject_count,abstain_count,blank_count,invalid_count,non_participation_count)<0 THEN
    RAISE EXCEPTION USING ERRCODE = 'HV514',MESSAGE='secret accounting requires explicit nonnegative totals';
  END IF;
  INSERT INTO votes(ballot,mode,choice,ballot_participation,count)
  SELECT target_ballot,'secret',recorded.choice,NULL,recorded.count FROM (VALUES
    ('approve'::vote_choice,approve_count),('reject'::vote_choice,reject_count),
    ('abstain'::vote_choice,abstain_count),('blank'::vote_choice,blank_count),('invalid'::vote_choice,invalid_count)
  ) recorded(choice,count) WHERE recorded.count>0;
  IF non_participation_count>0 THEN
    INSERT INTO hall.ballot_non_participation(ballot,mode,count) VALUES(target_ballot,'secret',non_participation_count);
  END IF;
END $$;

CREATE FUNCTION hall.record_public_non_participations(target_ballot UUID,participant_ids UUID[],reasons TEXT[])
RETURNS VOID LANGUAGE sql VOLATILE SET search_path=pg_catalog,hall AS $$
  INSERT INTO hall.ballot_non_participation(ballot,mode,ballot_participation,count,reason)
  SELECT target_ballot,'public',id,1,reason FROM unnest(participant_ids,reasons) recorded(id,reason);
$$;

-- @functional-requirement HALL-FR-BAL-300 BALLOT_COMPLETION_IS_A_NAMED_ACTION:
CREATE FUNCTION complete_ballot(
  target_ballot UUID,
  completion_time TIMESTAMPTZ, reviewed_preview UUID
)
RETURNS ballots
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed ballots;
BEGIN
  UPDATE ballots
  SET completed_at = completion_time, result_preview=reviewed_preview
  WHERE id = target_ballot
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV902',
      MESSAGE = format('unknown ballot %s', target_ballot);
  END IF;

  RETURN changed;
END;
$function$;
