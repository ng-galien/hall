-- Ballot application surface
-- ==========================
--
-- Ballot, participation and vote projections are intentionally separate. A
-- consumer hydrates only the bounded voting data needed by its current view.

CREATE FUNCTION hall.ballot_projection(target hall.ballots)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog
AS $function$
  SELECT jsonb_build_object(
    'id', target.id,
    'agendaItemId', target.council_agenda_item,
    'mode', target.mode,
    'chairmanParticipationId', target.chairman,
    'completedAt', target.completed_at,
    'result', target.result
  )
$function$;

CREATE FUNCTION hall.ballot_participation_projection(target hall.ballot_participation)
RETURNS JSONB
LANGUAGE sql
STABLE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
    'id', target.id,
    'ballotId', target.ballot,
    'meetingAttendanceId', target.meeting_attendance,
    'councilMemberId', attendance.council_member
  )
  FROM hall.meeting_attendance AS attendance
  WHERE attendance.id = target.meeting_attendance
$function$;

CREATE FUNCTION hall.ballot_vote_projection(target hall.votes)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog
AS $function$
  SELECT jsonb_build_object(
    'mode', target.mode,
    'ballotId', target.ballot,
    'choice', target.choice,
    'ballotParticipationId', target.ballot_participation,
    'count', target.count
  )
$function$;

CREATE FUNCTION hall_api.open_ballot(target_ballot UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.ballot_projection(ballot)
  FROM hall.ballots AS ballot
  WHERE ballot.id = target_ballot
$function$;

CREATE FUNCTION hall_api.list_council_meeting_ballots(target_meeting UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(
    jsonb_agg(hall.ballot_projection(ballot) ORDER BY agenda_item.position, ballot.id),
    '[]'::jsonb
  )
  FROM hall.ballots AS ballot
  JOIN hall.council_agenda_item AS agenda_item
    ON agenda_item.id = ballot.council_agenda_item
  WHERE agenda_item.council_meeting = target_meeting
$function$;

CREATE FUNCTION hall_api.list_ballot_participations(target_ballot UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(
    jsonb_agg(hall.ballot_participation_projection(participation) ORDER BY participation.id),
    '[]'::jsonb
  )
  FROM hall.ballot_participation AS participation
  WHERE participation.ballot = target_ballot
$function$;

CREATE FUNCTION hall_api.list_ballot_votes(target_ballot UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(
    jsonb_agg(
      hall.ballot_vote_projection(vote)
      ORDER BY vote.choice, vote.ballot_participation NULLS LAST
    ),
    '[]'::jsonb
  )
  FROM hall.votes AS vote
  WHERE vote.ballot = target_ballot
$function$;

CREATE FUNCTION hall_api.create_ballot(
  target_agenda_item UUID,
  target_mode TEXT,
  participant_attendances UUID[],
  chairman_attendance UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  ballot_id UUID;
BEGIN
  ballot_id := hall.create_ballot(
    target_agenda_item,
    target_mode::hall.ballot_mode,
    participant_attendances,
    chairman_attendance
  );
  RETURN hall_api.open_ballot(ballot_id);
END;
$function$;

CREATE FUNCTION hall_api.record_public_ballot_votes(
  target_ballot UUID,
  participant_ids UUID[],
  choices TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  PERFORM hall.record_public_ballot_votes(
    target_ballot,
    participant_ids,
    choices::hall.vote_choice[]
  );
  RETURN hall_api.list_ballot_votes(target_ballot);
END;
$function$;

CREATE FUNCTION hall_api.record_secret_ballot_votes(
  target_ballot UUID,
  approve_count INTEGER,
  reject_count INTEGER,
  abstain_count INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  PERFORM hall.record_secret_ballot_votes(
    target_ballot,
    approve_count,
    reject_count,
    abstain_count
  );
  RETURN hall_api.list_ballot_votes(target_ballot);
END;
$function$;

CREATE FUNCTION hall_api.complete_ballot(
  target_ballot UUID,
  completion_time TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.ballots;
BEGIN
  changed := hall.complete_ballot(target_ballot, completion_time);
  RETURN hall.ballot_projection(changed);
END;
$function$;
