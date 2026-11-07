-- HallSettings remains the sole configuration authority.
CREATE FUNCTION hall.notice_deadline_context()
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT coalesce((SELECT jsonb_build_object('population', population, 'timeZone', time_zone)
    FROM hall.settings WHERE id = 'hall'), '{}'::JSONB)
$$;

-- @implements-requirement HALL-FR-NOT-110
-- Ordinary regimes: CGCT L2121-11 and L2121-12; CE 13/10/1993 no 141677.
-- Both boundary dates are excluded. Weekends and holidays count; no next-workday extension.
CREATE FUNCTION hall.notice_clear_day_deadline(meeting_time TIMESTAMPTZ, zone TEXT, clear_days INTEGER)
RETURNS DATE LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $$
  SELECT (meeting_time AT TIME ZONE zone)::DATE - (clear_days + 1);
$$;

-- @implements-requirement HALL-TR-NOT-020
-- Unknown legal qualification must not turn an ordinary reference date into an
-- assertion of an applicable deadline or transmission compliance.
CREATE FUNCTION hall.meeting_notice_deadline(target hall.council_meetings)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = pg_catalog, hall AS $$
DECLARE context JSONB; zone TEXT; population INTEGER; notice_days INTEGER;
  meeting_time TIMESTAMPTZ; deadline DATE; local_today DATE; reminder TEXT;
  reconvocation hall.meeting_reconvocation; result JSONB;
BEGIN
  SELECT * INTO reconvocation FROM hall.meeting_reconvocation
  WHERE council_meeting=target.previous_council_meeting ORDER BY sent_at DESC LIMIT 1;
  context := hall.notice_deadline_context();
  zone := coalesce(reconvocation.time_zone,context->>'timeZone');
  meeting_time := coalesce(target.scheduled_at,reconvocation.scheduled_at);
  IF meeting_time IS NULL THEN RETURN jsonb_build_object('status','indeterminate','reason','scheduleUnknown'); END IF;
  IF zone IS NULL OR NOT EXISTS(SELECT FROM pg_timezone_names WHERE name=zone) THEN
    RETURN jsonb_build_object('status','indeterminate','reason','timeZoneUnknown');
  END IF;
  population := (context->>'population')::INTEGER;
  IF reconvocation.id IS NULL AND population IS NULL THEN
    RETURN jsonb_build_object('status','indeterminate','reason','populationUnknown');
  END IF;
  notice_days := CASE WHEN reconvocation.id IS NOT NULL THEN 3 WHEN population>=3500 THEN 5 ELSE 3 END;
  deadline := hall.notice_clear_day_deadline(meeting_time,zone,notice_days);
  local_today := (statement_timestamp() AT TIME ZONE zone)::DATE;
  reminder := CASE WHEN local_today<deadline THEN 'upcoming' WHEN local_today=deadline THEN 'due' ELSE 'overdue' END;
  result := jsonb_build_object('deadlineDate',deadline,'meetingDate',(meeting_time AT TIME ZONE zone)::DATE,
    'clearDays',notice_days,'timeZone',zone,'reminder',reminder);
  IF reconvocation.id IS NOT NULL THEN
    -- @implements-requirement HALL-FR-MTG-290
    RETURN jsonb_build_object('status','determined','regime','secondConvocation','deadline',result);
  END IF;
  RETURN jsonb_build_object('status','qualificationRequired','reason','noticeRegimeUnqualified','ordinaryReference',result);
END;
$$;
