-- Lifecycle: a meeting is created unstarted, then starts exactly once after
-- its immutable attendance declarations establish the required quorum. It may
-- later acquire one immutable closure timestamp.
CREATE FUNCTION hall.enforce_council_meeting_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, hall
AS $$
DECLARE observation RECORD;
BEGIN
  -- @implements-requirement HALL-FR-MTG-030
  -- durable fact and cannot be deleted, either
  -- row by row or by truncating the table.
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV111',
      MESSAGE = 'a council meeting is immutable';
  END IF;

  -- @implements-requirement HALL-FR-MTG-040
  -- always created in preparation; its
  -- attendance declarations must exist before the distinct start transition.
  IF TG_OP = 'INSERT' THEN
    IF NEW.started_at IS NOT NULL OR NEW.closed_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV112',
        MESSAGE = 'a council meeting must not be started on insert';
    END IF;

    -- The unstarted meeting satisfies its insertion contract.
    RETURN NEW;
  END IF;

  -- @implements-requirement HALL-FR-MTG-050
  -- meeting identity for
  -- this occurrence can be rewritten during its lifecycle.
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.number IS DISTINCT FROM OLD.number
    OR NEW.previous_council_meeting IS DISTINCT FROM OLD.previous_council_meeting
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV113',
      MESSAGE = 'a council meeting definition is immutable';
  END IF;

  -- @implements-requirement HALL-FR-MTG-100
  -- Closure is a fact. Once recorded, no meeting field can be rewritten; an
  -- identical no-op update remains observationally harmless.
  IF OLD.closed_at IS NOT NULL THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV114',
        MESSAGE = 'a closed council meeting is immutable';
    END IF;

    RETURN NEW;
  END IF;

  -- @implements-requirement HALL-FR-MTG-060
  -- Once the meeting has started, its start and scheduled date are immutable.
  -- The only remaining effective transition is NULL -> closed_at.
  IF OLD.started_at IS NOT NULL THEN
    IF NEW.started_at IS DISTINCT FROM OLD.started_at
      OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
      OR NEW.location IS DISTINCT FROM OLD.location
      OR NEW.chair_member IS DISTINCT FROM OLD.chair_member
      OR NEW.secretary_member IS DISTINCT FROM OLD.secretary_member
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV114',
        MESSAGE = 'a started council meeting lifecycle is immutable';
    END IF;

    RETURN NEW;
  END IF;

  -- Preparation invariant: an update that leaves started_at NULL does not start
  -- the meeting and therefore does not evaluate the start preconditions.
  IF NEW.started_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Starting and closing are distinct facts, produced by distinct actions.
  IF NEW.closed_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV116',
      MESSAGE = 'a council meeting cannot start and close in one transition';
  END IF;

  -- @implements-requirement HALL-FR-MTG-070
  -- Opening records attendance facts even without quorum. Formal consideration
  -- of a decision and voting retain their own applicable quorum guards.
  observation := hall.record_meeting_quorum(OLD.id,NULL,NEW.started_at);

  -- @implements-requirement HALL-FR-MTG-240
  -- The president and secretary are designated CouncilMembers and each has a
  -- physical-presence declaration in this meeting before it can start.
  IF OLD.chair_member IS NULL
    OR OLD.secretary_member IS NULL
    OR NOT EXISTS (
      SELECT
      FROM hall.current_meeting_attendance(OLD.id)
      WHERE council_member = OLD.chair_member
        AND status = 'present'
    )
    OR NOT EXISTS (
      SELECT
      FROM hall.current_meeting_attendance(OLD.id)
      WHERE council_member = OLD.secretary_member
        AND status = 'present'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV124',
      MESSAGE = 'the council meeting officers must be designated and physically present';
  END IF;

  -- The only effective update left is the one-time start transition.
  RETURN NEW;
END;
$$;

-- @implements-requirement HALL-FR-MTG-250
CREATE FUNCTION hall.set_council_meeting_officers(
  target_meeting UUID,
  target_chair_member UUID,
  target_secretary_member UUID
)
RETURNS council_meetings
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $$
DECLARE
  changed council_meetings;
BEGIN
  IF target_chair_member IS NULL OR target_secretary_member IS NULL
    OR NOT EXISTS (
      SELECT FROM council_member
      WHERE id = target_chair_member AND term_ended_on IS NULL
    )
    OR NOT EXISTS (
      SELECT FROM council_member
      WHERE id = target_secretary_member AND term_ended_on IS NULL
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV124',
      MESSAGE = 'council meeting officers must be active council members';
  END IF;

  UPDATE council_meetings
  SET chair_member = target_chair_member,
      secretary_member = target_secretary_member
  WHERE id = target_meeting
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV901',
      MESSAGE = format('unknown council meeting %s', target_meeting);
  END IF;

  RETURN changed;
END;
$$;

-- @implements-requirement HALL-FR-MTG-160
CREATE FUNCTION hall.schedule_council_meeting(
  target_meeting UUID,
  schedule_time TIMESTAMPTZ,
  meeting_location TEXT
)
RETURNS council_meetings
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $$
DECLARE
  changed council_meetings;
BEGIN
  IF schedule_time IS NULL OR meeting_location IS NULL OR btrim(meeting_location) = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV122',
      MESSAGE = 'a council meeting schedule requires a date and location';
  END IF;

  UPDATE council_meetings
  SET scheduled_at = schedule_time,
      location = btrim(meeting_location)
  WHERE id = target_meeting
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV901',
      MESSAGE = format('unknown council meeting %s', target_meeting);
  END IF;

  RETURN changed;
END;
$$;

-- @implements-requirement HALL-FR-MTG-170
CREATE FUNCTION hall.start_council_meeting(
  target_meeting UUID,
  start_time TIMESTAMPTZ
)
RETURNS council_meetings
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $$
DECLARE
  changed council_meetings;
BEGIN
  IF start_time IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV114',
      MESSAGE = 'a council meeting start cannot be null';
  END IF;

  UPDATE council_meetings
  SET started_at = start_time
  WHERE id = target_meeting
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV901',
      MESSAGE = format('unknown council meeting %s', target_meeting);
  END IF;

  RETURN changed;
END;
$$;

-- @implements-requirement HALL-FR-MTG-180
-- This is the sole runtime action for creating the root of the meeting
-- sequence. Later meetings are provisioned atomically by closure.
CREATE FUNCTION hall.provision_initial_council_meeting()
RETURNS council_meetings
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $$
DECLARE
  provisioned council_meetings;
BEGIN
  -- @implements-requirement HALL-TR-CON-180
  -- Competing bootstrap transactions cannot both observe an empty relation.
  -- Runtime roles cannot write the table directly and must use this action.
  LOCK TABLE council_meetings IN SHARE ROW EXCLUSIVE MODE;

  IF EXISTS (SELECT FROM council_meetings) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV123',
      MESSAGE = 'the initial council meeting is already provisioned';
  END IF;

  INSERT INTO council_meetings (id, number)
  VALUES (gen_random_uuid(), 1)
  RETURNING * INTO provisioned;

  RETURN provisioned;
END;
$$;

CREATE TRIGGER council_meetings_enforce_lifecycle
BEFORE INSERT OR UPDATE OR DELETE ON hall.council_meetings
FOR EACH ROW
EXECUTE FUNCTION enforce_council_meeting_lifecycle();

-- @implements-requirement HALL-TR-INT-020
-- Statement-level deletion cannot bypass meeting immutability.
CREATE TRIGGER council_meetings_reject_truncate
BEFORE TRUNCATE ON hall.council_meetings
FOR EACH STATEMENT
EXECUTE FUNCTION enforce_council_meeting_lifecycle();
