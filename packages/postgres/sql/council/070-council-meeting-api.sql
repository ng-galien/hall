-- Council meeting application surface
-- ===================================
--
-- Meeting projections expose lifecycle facts and identities only. Minutes
-- report content remains an independently fetched documentary resource.

-- @implements-requirement HALL-FR-MTG-220
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

CREATE FUNCTION hall.council_meeting_closure_blockers(target hall.council_meetings)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path=pg_catalog,hall AS $$
DECLARE blockers JSONB:='[]'; ballot RECORD;
BEGIN
  IF target.started_at IS NULL THEN blockers:=blockers||'[{"code":"meetingNotStarted"}]'::jsonb; END IF;
  IF target.closed_at IS NOT NULL THEN blockers:=blockers||'[{"code":"meetingClosed"}]'::jsonb; END IF;
  FOR ballot IN SELECT b.id FROM hall.ballots b JOIN hall.council_agenda_item a ON a.id=b.council_agenda_item WHERE a.council_meeting=target.id AND b.completed_at IS NULL LOOP
    blockers:=blockers||jsonb_build_array(jsonb_build_object('code','ballotInProgress','ballotId',ballot.id));
  END LOOP;
  RETURN blockers;
END $$;

CREATE FUNCTION hall.council_meeting_entry_blockers(target hall.council_meetings)
RETURNS JSONB LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
  SELECT CASE WHEN target.closed_at IS NOT NULL THEN '[{"code":"meetingClosed"}]'::jsonb
    WHEN target.started_at IS NOT NULL THEN '[]'::jsonb
    ELSE hall.council_meeting_preparation_blockers(target) END;
$$;

CREATE FUNCTION hall.council_meeting_opening_blockers(target hall.council_meetings)
RETURNS JSONB LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
  SELECT CASE WHEN target.closed_at IS NOT NULL THEN '[{"code":"meetingClosed"}]'::jsonb
    WHEN target.started_at IS NOT NULL THEN '[{"code":"meetingAlreadyStarted"}]'::jsonb
    ELSE hall.council_meeting_preparation_blockers(target) ||
      CASE WHEN target.scheduled_at > statement_timestamp() THEN
        jsonb_build_array(jsonb_build_object('code','scheduledTimeNotReached','scheduledAt',target.scheduled_at))
      ELSE '[]'::jsonb END END;
$$;

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
    'reconvocationId', (SELECT id FROM hall.meeting_reconvocation
      WHERE council_meeting = target.previous_council_meeting ORDER BY sent_at DESC LIMIT 1),
    'minutesId', (SELECT id FROM hall.minutes WHERE council_meeting = target.id),
    'noticeDeadline', hall.meeting_notice_deadline(target),
    'currentNoticeId', hall.current_meeting_notice_id(target.id),
    'agendaFrozenAt', (SELECT frozen_at FROM hall.active_council_agenda_freeze WHERE council_meeting = target.id),
    'scheduledAt', target.scheduled_at,
    'location', target.location,
    'chairMemberId', target.chair_member,
    'secretaryMemberId', target.secretary_member,
    'quorum', (SELECT cardinality(member_ids)/2+1 FROM hall.meeting_membership_record WHERE council_meeting=target.id ORDER BY observed_at DESC LIMIT 1),
    'startedAt', target.started_at,
    'closedAt', target.closed_at,
    -- TODO REMOVE_STALE: temporary marker exposed without inventing a closure fact.
    'stale', target.stale,
    'closureBlockers',hall.council_meeting_closure_blockers(target),
    'entryBlockers',hall.council_meeting_entry_blockers(target),
    'openingBlockers',hall.council_meeting_opening_blockers(target)
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

-- A slug names the scheduled meeting carrying its durable number, so an
-- address kept from a former date still opens the meeting; the projection
-- carries the slug derived from the current date.
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
    AND meeting.scheduled_at IS NOT NULL
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

-- @implements-requirement HALL-FR-MTG-260
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

CREATE FUNCTION hall_api.record_meeting_opening(
  target_meeting UUID,
  observation_time TIMESTAMPTZ,
  attendance_declarations JSONB,
  chairman_member UUID,
  secretary_member UUID
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
  SELECT * INTO changed FROM hall.council_meetings WHERE id=target_meeting FOR UPDATE;
  IF jsonb_array_length(hall.council_meeting_preparation_blockers(changed)) > 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'HV807', MESSAGE='meeting start requires the current generated notice';
  END IF;
  PERFORM hall_api.record_meeting_attendance(target_meeting,attendance_declarations,observation_time);
  PERFORM hall.set_council_meeting_officers(target_meeting,chairman_member,secretary_member);
  PERFORM hall.start_council_meeting(target_meeting,observation_time);
  RETURN hall_api.meeting_conduct(target_meeting);
END;
$function$;

-- TODO REMOVE_STALE: temporary succession for incomplete historical records, no PV or votes.
CREATE FUNCTION hall_api.mark_council_meeting_stale(target_meeting UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,hall AS $$
DECLARE target hall.council_meetings; successor hall.council_meetings;
BEGIN
  LOCK TABLE hall.council_meetings IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO target FROM hall.council_meetings WHERE id=target_meeting FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='HV901', MESSAGE='unknown council meeting'; END IF;
  IF target.closed_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='HV114', MESSAGE='a closed council meeting is immutable'; END IF;
  UPDATE hall.council_meetings SET stale=TRUE WHERE id=target.id RETURNING * INTO target;
  SELECT * INTO successor FROM hall.council_meetings WHERE previous_council_meeting=target.id;
  IF NOT FOUND THEN
    INSERT INTO hall.council_meetings(id,number,previous_council_meeting)
    VALUES(gen_random_uuid(),target.number+1,target.id) RETURNING * INTO successor;
  END IF;
  RETURN jsonb_build_object('staleMeeting',hall.council_meeting_projection(target),
    'nextMeeting',hall.council_meeting_projection(successor));
END $$;
