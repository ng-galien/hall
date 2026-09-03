-- Council meeting application surface
-- ===================================
--
-- Meeting projections expose lifecycle facts and identities only. Minutes
-- report content remains an independently fetched documentary resource.

CREATE FUNCTION hall.council_meeting_projection(target hall.council_meetings)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog
AS $function$
  SELECT jsonb_build_object(
    'id', target.id,
    'previousCouncilMeetingId', target.previous_council_meeting,
    'scheduledAt', target.scheduled_at,
    'quorum', target.quorum,
    'startedAt', target.started_at,
    'closedAt', target.closed_at
  )
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

-- @functional-requirement HALL-FR-WSP-080 MEETING_CLOSURE_CREATES_MINUTES_WORKSPACE_ATOMICALLY:
CREATE FUNCTION hall_api.close_council_meeting(
  target_meeting UUID,
  closure_time TIMESTAMPTZ,
  minutes_parent_path TEXT,
  minutes_business_name TEXT,
  minutes_report_name TEXT,
  minutes_report_content TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall, hall_api
AS $function$
DECLARE
  business JSONB;
  business_id UUID;
  next_meeting UUID;
BEGIN
  -- The documentary aggregate is created first inside the same transaction.
  -- Any meeting invariant failure rolls it back with the entire closure.
  business := hall_api.create_council_business(
    minutes_parent_path,
    minutes_business_name,
    minutes_report_name,
    minutes_report_content
  );
  business_id := (business ->> 'id')::UUID;

  next_meeting := hall.close_council_meeting(
    target_meeting,
    closure_time,
    business_id
  );

  RETURN jsonb_build_object(
    'closedMeeting', hall_api.open_council_meeting(target_meeting),
    'nextMeeting', hall_api.open_council_meeting(next_meeting),
    'minutesBusiness', business
  );
END
$function$;
