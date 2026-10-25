-- Lifecycle: attendance declarations form an exact, adjustable preparation
-- set. The named batch action may replace that set until the meeting starts;
-- from the start instant onward, every declaration is immutable.
CREATE FUNCTION hall.enforce_meeting_attendance_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, hall
AS $$
DECLARE
  meeting_started_at TIMESTAMPTZ;
  meeting_closed_at TIMESTAMPTZ;
  target_meeting UUID;
BEGIN
  -- Table-wide truncation has no meeting scope and can never represent the
  -- named preparation action.
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV101',
      MESSAGE = 'meeting attendance cannot be truncated';
  END IF;

  target_meeting := CASE WHEN TG_OP = 'DELETE' THEN OLD.council_meeting ELSE NEW.council_meeting END;

  -- @implements-requirement HALL-TR-CON-020
  -- Attendance insertion locks its meeting so it cannot
  -- race with the one-time update that starts that same meeting.
  SELECT started_at,closed_at
  INTO meeting_started_at,meeting_closed_at
  FROM council_meetings
  WHERE id = target_meeting
  FOR UPDATE;

  -- Referential invariant: lifecycle validation must name a missing meeting
  -- before any meeting-dependent rule is evaluated.
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV901',
      MESSAGE = format('unknown council meeting %s', NEW.council_meeting);
  END IF;

  -- @implements-requirement HALL-FR-ATT-090
  -- set is complete and frozen from the
  -- instant the council meeting starts.
  IF meeting_closed_at IS NULL AND meeting_started_at IS NOT NULL AND TG_OP='INSERT'
    AND NEW.declared_at>=meeting_started_at AND NEW.declared_at<=clock_timestamp()
    AND EXISTS(SELECT FROM hall.meeting_membership_record r
      WHERE r.id=(SELECT id FROM hall.meeting_membership_record WHERE council_meeting=target_meeting ORDER BY observed_at DESC LIMIT 1)
        AND NEW.council_member=ANY(r.member_ids) AND NEW.declared_at>=r.observed_at)
    AND NOT EXISTS(SELECT FROM hall.meeting_membership_record r
      WHERE r.id=(SELECT id FROM hall.meeting_membership_record WHERE council_meeting=target_meeting ORDER BY observed_at LIMIT 1)
        AND NEW.council_member=ANY(r.member_ids)) THEN
    RETURN NEW;
  END IF;
  IF meeting_started_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV102',
      MESSAGE = 'a started council meeting cannot receive attendance';
  END IF;

  -- @implements-requirement HALL-FR-ATT-080
  -- Before start, the named exact-set action may insert or remove preparation
  -- declarations. The start transition freezes the complete set.
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER meeting_attendance_enforce_lifecycle
BEFORE INSERT OR UPDATE OR DELETE ON hall.meeting_attendance
FOR EACH ROW
EXECUTE FUNCTION enforce_meeting_attendance_lifecycle();

-- @implements-requirement HALL-TR-INT-010
-- Statement-level deletion cannot bypass row-level immutability.
CREATE TRIGGER meeting_attendance_reject_truncate
BEFORE TRUNCATE ON hall.meeting_attendance
FOR EACH STATEMENT
EXECUTE FUNCTION enforce_meeting_attendance_lifecycle();

-- @implements-requirement HALL-TR-CON-030
-- A represented member's proxy holder is validated at transaction end so the
-- represented member and holder can be inserted in either order atomically.
-- Functionally, the proxy holder remains a physically present attendance
-- declaration from the same meeting.
CREATE FUNCTION hall.enforce_meeting_attendance_proxy_holder()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $$
BEGIN
  -- Representation invariant: when a member is represented, the designated
  -- proxy holder is physically present in that exact council meeting.
  IF NEW.status = 'represented' AND NOT meeting_attendance_is_valid_proxy_holder(
    NEW.council_meeting,
    NEW.proxy_holder
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV103',
      MESSAGE = 'a proxy holder must be present in the represented member meeting';
  END IF;

  -- Non-represented attendance has no proxy holder to validate; represented
  -- attendance has passed the deferred cross-row check.
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER meeting_attendance_enforce_proxy_holder
AFTER INSERT ON hall.meeting_attendance
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_meeting_attendance_proxy_holder();
