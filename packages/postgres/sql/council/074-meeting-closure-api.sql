-- @implements-requirement HALL-FR-MIN-140
-- @implements-requirement HALL-FR-MTG-370
CREATE FUNCTION hall_api.close_council_meeting(target_meeting UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, hall, hall_api AS $$
DECLARE next_meeting UUID;
BEGIN
  next_meeting := hall.close_council_meeting(target_meeting, hall.meeting_reception_time(target_meeting));
  RETURN jsonb_build_object(
    'closedMeeting', hall_api.open_council_meeting(target_meeting),
    'nextMeeting', hall_api.open_council_meeting(next_meeting),
    'minutes', (SELECT hall.minutes_summary(minutes) FROM hall.minutes WHERE council_meeting = target_meeting)
  );
END;
$$;
