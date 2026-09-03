-- Lifecycle: attendance declarations are inserted while the meeting is being
-- prepared. Each declaration is immutable immediately after insertion, and no
-- declaration may be added once the meeting has started.
CREATE FUNCTION enforce_meeting_attendance_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  meeting_started_at TIMESTAMPTZ;
BEGIN
  -- @functional-requirement HALL-FR-ATT-080 MEETING_ATTENDANCE_IS_IMMUTABLE: An attendance
  -- declaration is an immutable fact. Only its initial
  -- insertion is legal; row updates, deletes and table truncation are refused.
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV101',
      MESSAGE = 'meeting attendance is immutable';
  END IF;

  -- @technical-requirement HALL-TR-CON-020 ATTENDANCE_INSERT_SERIALIZES_WITH_MEETING_START:
  -- Attendance insertion locks its meeting so it cannot
  -- race with the one-time update that starts that same meeting.
  SELECT started_at
  INTO meeting_started_at
  FROM council_meetings
  WHERE id = NEW.council_meeting
  FOR UPDATE;

  -- Referential invariant: lifecycle validation must name a missing meeting
  -- before any meeting-dependent rule is evaluated.
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV901',
      MESSAGE = format('unknown council meeting %s', NEW.council_meeting);
  END IF;

  -- @functional-requirement HALL-FR-ATT-090 ATTENDANCE_CLOSES_WHEN_MEETING_STARTS: The attendance
  -- set is complete and frozen from the
  -- instant the council meeting starts.
  IF meeting_started_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV102',
      MESSAGE = 'a started council meeting cannot receive attendance';
  END IF;

  -- The insertion satisfies every attendance lifecycle invariant.
  RETURN NEW;
END;
$$;

CREATE TRIGGER meeting_attendance_enforce_lifecycle
BEFORE INSERT OR UPDATE OR DELETE ON meeting_attendance
FOR EACH ROW
EXECUTE FUNCTION enforce_meeting_attendance_lifecycle();

-- @technical-requirement HALL-TR-INT-010 TRUNCATE_CANNOT_BYPASS_ATTENDANCE_IMMUTABILITY:
-- Statement-level deletion cannot bypass row-level immutability.
CREATE TRIGGER meeting_attendance_reject_truncate
BEFORE TRUNCATE ON meeting_attendance
FOR EACH STATEMENT
EXECUTE FUNCTION enforce_meeting_attendance_lifecycle();

-- @technical-requirement HALL-TR-CON-030 PROXY_VALIDATION_IS_DEFERRED:
-- A represented member's proxy holder is validated at transaction end so the
-- represented member and holder can be inserted in either order atomically.
-- Functionally, the proxy holder remains a physically present attendance
-- declaration from the same meeting.
CREATE FUNCTION enforce_meeting_attendance_proxy_holder()
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
AFTER INSERT ON meeting_attendance
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_meeting_attendance_proxy_holder();
