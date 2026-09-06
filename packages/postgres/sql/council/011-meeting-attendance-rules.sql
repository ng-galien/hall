-- @functional-requirement HALL-FR-ATT-070 PROXY_HOLDER_IS_PRESENT_IN_SAME_MEETING: A proxy
-- holder is a physically present attendance
-- declaration from the represented member's exact council meeting.
CREATE FUNCTION meeting_attendance_is_valid_proxy_holder(
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
