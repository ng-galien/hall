-- Lifecycle: a meeting is created unstarted, then starts exactly once after
-- its immutable attendance declarations establish the required quorum. It may
-- later acquire one immutable closure timestamp.
CREATE FUNCTION enforce_council_meeting_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- @functional-requirement HALL-FR-MTG-030 COUNCIL_MEETING_IS_IMMUTABLE: A council meeting is a
  -- durable fact and cannot be deleted, either
  -- row by row or by truncating the table.
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV111',
      MESSAGE = 'a council meeting is immutable';
  END IF;

  -- @functional-requirement HALL-FR-MTG-040 COUNCIL_MEETING_IS_CREATED_UNSTARTED: A meeting is
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

  -- @functional-requirement HALL-FR-MTG-050 COUNCIL_MEETING_DEFINITION_IS_IMMUTABLE: Neither
  -- meeting identity nor the quorum established for
  -- this occurrence can be rewritten during its lifecycle.
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.previous_council_meeting IS DISTINCT FROM OLD.previous_council_meeting
    OR NEW.quorum IS DISTINCT FROM OLD.quorum
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV113',
      MESSAGE = 'a council meeting definition is immutable';
  END IF;

  -- @functional-requirement HALL-FR-MTG-100 CLOSED_COUNCIL_MEETING_IS_IMMUTABLE:
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

  -- @functional-requirement HALL-FR-MTG-060 COUNCIL_MEETING_TIMES_ARE_ONE_WAY_FACTS:
  -- Once the meeting has started, its start and scheduled date are immutable.
  -- The only remaining effective transition is NULL -> closed_at.
  IF OLD.started_at IS NOT NULL THEN
    IF NEW.started_at IS DISTINCT FROM OLD.started_at
      OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
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

  -- @functional-requirement HALL-FR-MTG-070 COUNCIL_MEETING_START_REQUIRES_QUORUM: Starting
  -- requires at least the meeting quorum in
  -- physically present members; represented members are deliberately excluded.
  IF council_meeting_present_member_count(OLD.id) < OLD.quorum THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV115',
      MESSAGE = 'the council meeting quorum is not reached';
  END IF;

  -- The only effective update left is the one-time start transition.
  RETURN NEW;
END;
$$;

CREATE TRIGGER council_meetings_enforce_lifecycle
BEFORE INSERT OR UPDATE OR DELETE ON council_meetings
FOR EACH ROW
EXECUTE FUNCTION enforce_council_meeting_lifecycle();

-- @technical-requirement HALL-TR-INT-020 TRUNCATE_CANNOT_BYPASS_MEETING_IMMUTABILITY:
-- Statement-level deletion cannot bypass meeting immutability.
CREATE TRIGGER council_meetings_reject_truncate
BEFORE TRUNCATE ON council_meetings
FOR EACH STATEMENT
EXECUTE FUNCTION enforce_council_meeting_lifecycle();
