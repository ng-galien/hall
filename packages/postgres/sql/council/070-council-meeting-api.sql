-- Council meeting application surface
-- ===================================
--
-- Meeting projections expose lifecycle facts and identities only. Minutes
-- report content remains an independently fetched documentary resource.

-- @functional-requirement HALL-FR-MTG-220 COUNCIL_MEETING_SLUG_IS_DERIVED:
-- A scheduled meeting has one readable technical slug derived only from its
-- UTC calendar date and durable sequence number. An unscheduled next meeting
-- has no invented date and therefore no slug yet.
CREATE FUNCTION hall.council_meeting_slug(target hall.council_meetings)
RETURNS TEXT
LANGUAGE sql
STABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog
AS $function$
  SELECT CASE
    WHEN target.scheduled_at IS NULL THEN NULL
    ELSE to_char(target.scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      || '-'
      || lpad(
        target.number::TEXT,
        greatest(3, length(target.number::TEXT)),
        '0'
      )
  END
$function$;

CREATE FUNCTION hall.council_meeting_projection(target hall.council_meetings)
RETURNS JSONB
LANGUAGE sql
STABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
    'id', target.id,
    'number', target.number,
    'slug', hall.council_meeting_slug(target),
    'previousCouncilMeetingId', target.previous_council_meeting,
    'minutesId', (SELECT id FROM hall.minutes WHERE council_meeting = target.id),
    'scheduledAt', target.scheduled_at,
    'location', target.location,
    'chairMemberId', target.chair_member,
    'secretaryMemberId', target.secretary_member,
    'quorum', (SELECT cardinality(member_ids)/2+1 FROM hall.meeting_membership_record WHERE council_meeting=target.id ORDER BY observed_at DESC LIMIT 1),
    'startedAt', target.started_at,
    'closedAt', target.closed_at
  )
$function$;

CREATE FUNCTION hall_api.set_council_meeting_officers(
  target_meeting UUID,
  target_chair_member UUID,
  target_secretary_member UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.council_meetings;
BEGIN
  changed := hall.set_council_meeting_officers(
    target_meeting,
    target_chair_member,
    target_secretary_member
  );
  RETURN hall.council_meeting_projection(changed);
END;
$function$;

CREATE FUNCTION hall_api.open_council_meeting_by_slug(target_slug TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.council_meeting_projection(meeting)
  FROM hall.council_meetings AS meeting
  WHERE target_slug ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+$'
    AND meeting.number = substring(target_slug FROM '[0-9]+$')::INTEGER
    AND hall.council_meeting_slug(meeting) = target_slug
$function$;

CREATE FUNCTION hall_api.open_council_meeting(target_meeting UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.council_meeting_projection(meeting)
  FROM hall.council_meetings AS meeting
  WHERE meeting.id = target_meeting
$function$;

CREATE FUNCTION hall_api.list_council_meetings()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(
    jsonb_agg(
      hall.council_meeting_projection(meeting)
      ORDER BY meeting.scheduled_at DESC NULLS FIRST, meeting.id
    ),
    '[]'::jsonb
  )
  FROM hall.council_meetings AS meeting
$function$;

CREATE FUNCTION hall_api.provision_initial_council_meeting()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  provisioned hall.council_meetings;
BEGIN
  provisioned := hall.provision_initial_council_meeting();
  RETURN hall.council_meeting_projection(provisioned);
END;
$function$;

CREATE FUNCTION hall_api.schedule_council_meeting(
  target_meeting UUID,
  schedule_time TIMESTAMPTZ,
  meeting_location TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.council_meetings;
BEGIN
  changed := hall.schedule_council_meeting(target_meeting, schedule_time, meeting_location);
  RETURN hall.council_meeting_projection(changed);
END;
$function$;

-- @functional-requirement HALL-FR-MTG-260 COUNCIL_MEETING_PREPARATION_IS_ATOMIC:
-- Initial programming records the schedule and both officers in one database
-- transaction. The individual named actions remain available for later edits.
CREATE FUNCTION hall_api.prepare_council_meeting(
  target_meeting UUID,
  schedule_time TIMESTAMPTZ,
  meeting_location TEXT,
  target_chair_member UUID,
  target_secretary_member UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.council_meetings;
BEGIN
  PERFORM hall.schedule_council_meeting(target_meeting, schedule_time, meeting_location);
  changed := hall.set_council_meeting_officers(
    target_meeting,
    target_chair_member,
    target_secretary_member
  );
  RETURN hall.council_meeting_projection(changed);
END;
$function$;

CREATE FUNCTION hall_api.start_council_meeting(
  target_meeting UUID,
  start_time TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.council_meetings;
BEGIN
  changed := hall.start_council_meeting(target_meeting, start_time);
  RETURN hall.council_meeting_projection(changed);
END;
$function$;
