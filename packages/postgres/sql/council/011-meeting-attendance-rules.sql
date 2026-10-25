-- @implements-requirement HALL-FR-ATT-070
-- holder is a physically present attendance
-- declaration from the represented member's exact council meeting.
CREATE FUNCTION hall.meeting_attendance_is_valid_proxy_holder(
  target_meeting UUID,
  target_holder UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM meeting_attendance
    WHERE id = target_holder
      AND council_meeting = target_meeting
      AND status = 'present'
  );
$$;
