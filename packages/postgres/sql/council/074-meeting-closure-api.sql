-- @functional-requirement HALL-FR-MIN-140 CLOSURE_RETURNS_A_STANDALONE_MINUTES_DRAFT:
CREATE FUNCTION hall_api.close_council_meeting(target_meeting UUID, closure_time TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, hall, hall_api AS $$
DECLARE next_meeting UUID;
BEGIN
  next_meeting := hall.close_council_meeting(target_meeting, closure_time);
  RETURN jsonb_build_object(
    'closedMeeting', hall_api.open_council_meeting(target_meeting),
    'nextMeeting', hall_api.open_council_meeting(next_meeting),
    'minutes', (SELECT hall.minutes_summary(minutes) FROM hall.minutes WHERE council_meeting = target_meeting)
  );
END;
$$;
