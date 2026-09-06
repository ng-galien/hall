-- @functional-requirement HALL-FR-MTG-020 QUORUM_COUNTS_ONLY_PHYSICALLY_PRESENT_MEMBERS: Only
-- physically present members establish the
-- council meeting quorum. Represented members remain voting attendances but do
-- not increase this count.
CREATE FUNCTION council_meeting_present_member_count(target_meeting UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $$
  SELECT COUNT(*)::INTEGER
  FROM meeting_attendance
  WHERE council_meeting = target_meeting
    AND status = 'present';
$$;
