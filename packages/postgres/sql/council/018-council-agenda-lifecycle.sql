-- Lifecycle: an agenda item is prepared against an existing meeting, starts at
-- most once when positively programmed, and completes at most once. Its root
-- and subject mapping never change; its meeting and signed position may be
-- adjusted while it remains unstarted.
CREATE FUNCTION hall.enforce_council_agenda_item_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, hall
AS $$
DECLARE
  meeting_started_at TIMESTAMPTZ;
  meeting_closed_at TIMESTAMPTZ;
  source_closed_at TIMESTAMPTZ;
BEGIN
  -- @implements-requirement HALL-TR-INT-030
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV213',
      MESSAGE = 'council agenda history cannot be truncated';
  END IF;

  -- @implements-requirement HALL-FR-AGI-270
  -- Every insertion or update locks its target meeting. Closure and agenda
  -- mutation therefore cannot cross while each sees a stale meeting state.
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT started_at, closed_at
    INTO meeting_started_at, meeting_closed_at
    FROM council_meetings
    WHERE id = NEW.council_meeting
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV901',
        MESSAGE = format('unknown council meeting %s', NEW.council_meeting);
    END IF;

    IF meeting_closed_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV223',
        MESSAGE = 'a closed council meeting cannot receive agenda changes';
    END IF;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT closed_at INTO source_closed_at FROM council_meetings
    WHERE id = OLD.council_meeting FOR UPDATE;
    IF source_closed_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'HV223', MESSAGE = 'a closed council meeting cannot receive agenda changes';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.adjourned_at IS NOT NULL AND NEW.adjourned_at IS DISTINCT FROM OLD.adjourned_at THEN
      RAISE EXCEPTION USING ERRCODE = 'HV230', MESSAGE = 'an agenda adjournment is immutable';
    END IF;
    IF OLD.adjourned_at IS NULL AND NEW.adjourned_at IS NOT NULL THEN
      IF NEW.adjourned_at < hall.council_agenda_introduced_at(NEW.council_meeting,NEW.id) THEN
        RAISE EXCEPTION USING ERRCODE='HV235',MESSAGE='adjournment cannot precede the question addition';
      END IF;
      IF meeting_started_at IS NULL OR NEW.adjourned_at < meeting_started_at OR OLD.position < 0
        OR OLD.completed_at IS NOT NULL
        OR EXISTS (SELECT FROM ballots WHERE council_agenda_item = OLD.id AND completed_at IS NULL)
      THEN
        RAISE EXCEPTION USING ERRCODE = 'HV230', MESSAGE = 'the agenda item cannot be adjourned';
      END IF;
    END IF;
  END IF;

  -- @implements-requirement HALL-FR-AGI-090
  IF TG_OP = 'INSERT' THEN
    IF EXISTS(SELECT FROM hall.council_agenda_addition WHERE agenda_item=NEW.id)
      AND NEW.position <= (SELECT coalesce(max(abs(position)),0) FROM council_agenda_item WHERE council_meeting=NEW.council_meeting) THEN
      RAISE EXCEPTION USING ERRCODE='HV235',MESSAGE='an added question must follow every existing point';
    END IF;
    IF NEW.started_at IS NOT NULL OR NEW.completed_at IS NOT NULL OR NEW.adjourned_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV212',
        MESSAGE = 'an agenda item must be inactive on insert';
    END IF;
    RETURN NEW;
  END IF;

  -- @implements-requirement HALL-FR-AGI-100
  IF TG_OP = 'DELETE' THEN
    IF OLD.started_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV213',
        MESSAGE = 'a started agenda item cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  -- @implements-requirement HALL-FR-AGI-110
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.council_business IS DISTINCT FROM OLD.council_business
    OR NEW.minutes_approval IS DISTINCT FROM OLD.minutes_approval
    OR NEW.council_decision_proposal IS DISTINCT FROM OLD.council_decision_proposal
    OR NEW.open_question IS DISTINCT FROM OLD.open_question
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV214',
      MESSAGE = 'an agenda item subject is immutable';
  END IF;

  -- An unstarted placement may be moved, reordered or deprogrammed without
  -- changing the underlying business subject.
  IF OLD.started_at IS NULL AND NEW.started_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- @implements-requirement HALL-FR-AGI-120
  IF OLD.started_at IS NULL AND NEW.started_at IS NOT NULL THEN
    IF NEW.started_at < hall.council_agenda_introduced_at(NEW.council_meeting,NEW.id) THEN
      RAISE EXCEPTION USING ERRCODE='HV235',MESSAGE='discussion cannot precede the question addition';
    END IF;
    IF NEW.position < 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV215',
        MESSAGE = 'a deprogrammed agenda item cannot start';
    END IF;

    IF meeting_started_at IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV216',
        MESSAGE = 'an agenda item requires a started council meeting';
    END IF;

    IF NEW.completed_at IS NOT NULL THEN
      -- @implements-requirement HALL-FR-AGI-180
      RAISE EXCEPTION USING
        ERRCODE = 'HV217',
        MESSAGE = 'an agenda item must start before it completes';
    END IF;

    RETURN NEW;
  END IF;

  -- @implements-requirement HALL-FR-AGI-130
  IF NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV218',
      MESSAGE = 'an agenda item start time is immutable';
  END IF;

  -- @implements-requirement HALL-FR-AGI-320
  -- A negative occurrence is no longer under consideration in this meeting.
  -- Its unfinished subject is carried forward when the meeting closes.
  IF OLD.completed_at IS NULL
    AND NEW.completed_at IS NOT NULL
    AND NEW.position < 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV227',
      MESSAGE = 'a deprogrammed agenda item cannot complete';
  END IF;

  -- @implements-requirement HALL-FR-AGI-140
  IF OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV219',
      MESSAGE = 'an agenda item completion time is immutable';
  END IF;

  -- @implements-requirement HALL-FR-AGI-310
  -- A completed occurrence is part of the meeting record. Deprogramming is
  -- reserved for an unstarted item or an explicitly deferred active item.
  IF OLD.completed_at IS NOT NULL AND NEW.position IS DISTINCT FROM OLD.position THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV226',
      MESSAGE = 'a completed agenda item cannot be deprogrammed';
  END IF;

  -- @implements-requirement HALL-FR-AGI-330
  -- Otherwise the ballot could neither complete its now-inactive item nor be
  -- removed, leaving the meeting permanently impossible to close.
  IF OLD.position > 0
    AND NEW.position < 0
    AND EXISTS (
      SELECT
      FROM ballots
      WHERE council_agenda_item = OLD.id
        AND completed_at IS NULL
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV228',
      MESSAGE = 'an agenda item with an open ballot cannot be deprogrammed';
  END IF;

  -- @implements-requirement HALL-FR-AGI-340
  -- Once consideration has been explicitly deferred, the historical
  -- occurrence remains negative and closure creates its next occurrence.
  IF OLD.started_at IS NOT NULL AND OLD.position < 0 AND NEW.position > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV229',
      MESSAGE = 'a started agenda item deprogramming cannot be reversed';
  END IF;

  -- A started item remains in its meeting. Its positive position may become
  -- negative to record an explicit deferral, but its absolute order is kept.
  IF NEW.council_meeting IS DISTINCT FROM OLD.council_meeting
    OR abs(NEW.position) IS DISTINCT FROM abs(OLD.position)
  THEN
    -- @implements-requirement HALL-FR-AGI-190
    RAISE EXCEPTION USING
      ERRCODE = 'HV220',
      MESSAGE = 'a started agenda item placement is immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER council_agenda_item_enforce_lifecycle
BEFORE INSERT OR UPDATE OR DELETE ON hall.council_agenda_item
FOR EACH ROW
EXECUTE FUNCTION enforce_council_agenda_item_lifecycle();

CREATE TRIGGER council_agenda_item_reject_truncate
BEFORE TRUNCATE ON hall.council_agenda_item
FOR EACH STATEMENT
EXECUTE FUNCTION enforce_council_agenda_item_lifecycle();
