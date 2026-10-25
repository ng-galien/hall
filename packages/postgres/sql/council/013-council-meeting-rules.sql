-- @implements-requirement HALL-FR-MTG-020
-- physically present members establish the
-- council meeting quorum. Represented members remain voting attendances but do
-- not increase this count.
CREATE FUNCTION hall.council_meeting_present_member_count(target_meeting UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $$
  SELECT COUNT(*)::INTEGER
  FROM hall.current_meeting_attendance(target_meeting)
  WHERE status = 'present';
$$;
