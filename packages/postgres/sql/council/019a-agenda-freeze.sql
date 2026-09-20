-- The agenda freeze is a preparation decision, independent of meeting conduct.
-- @functional-requirement HALL-FR-NOT-010 FROZEN_AGENDA_PRESERVES_QUESTIONS_AND_ORDER:
CREATE TABLE hall.council_agenda_freeze (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  council_meeting UUID NOT NULL REFERENCES hall.council_meetings(id),
  frozen_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  agenda JSONB NOT NULL CHECK (jsonb_typeof(agenda) = 'array' AND jsonb_array_length(agenda) > 0)
);

CREATE TABLE hall.council_agenda_reopening (
  agenda_freeze UUID PRIMARY KEY REFERENCES hall.council_agenda_freeze(id),
  reopened_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp()
);
CREATE VIEW hall.active_council_agenda_freeze AS
SELECT frozen.* FROM hall.council_agenda_freeze frozen
WHERE NOT EXISTS (SELECT FROM hall.council_agenda_reopening reopening WHERE reopening.agenda_freeze = frozen.id);

-- @functional-requirement HALL-FR-NOT-020 FROZEN_AGENDA_CANNOT_BE_RECOMPOSED:
CREATE FUNCTION hall.enforce_frozen_agenda_composition()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE source UUID; target UUID; source_started TIMESTAMPTZ;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN source := OLD.council_meeting; END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN target := NEW.council_meeting; END IF;
  -- Same meeting lock as freeze and lifecycle; serialize both sides of moves.
  PERFORM 1 FROM hall.council_meetings WHERE id IN (source,target) ORDER BY id FOR UPDATE;
  IF NOT EXISTS (SELECT FROM hall.active_council_agenda_freeze WHERE council_meeting IN (source,target)) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  -- Only a recorded in-meeting OpenQuestion may be appended past the frozen agenda.
  IF TG_OP='INSERT' AND NEW.open_question IS NOT NULL
    AND NEW.minutes_approval IS NULL AND NEW.council_decision_proposal IS NULL
    AND NEW.position>(SELECT coalesce(max(abs(position)),0) FROM hall.council_agenda_item WHERE council_meeting=target)
    AND EXISTS(SELECT FROM hall.council_agenda_addition addition JOIN hall.council_meetings meeting ON meeting.id=addition.council_meeting
      WHERE addition.agenda_item=NEW.id AND addition.council_meeting=target AND meeting.started_at IS NOT NULL AND meeting.closed_at IS NULL)
  THEN RETURN NEW; END IF;
  -- Closure carries a deferred unstarted occurrence into the newly created successor.
  IF TG_OP='UPDATE' AND OLD.started_at IS NULL AND NEW.position>0
    AND EXISTS(SELECT FROM hall.council_meetings WHERE id=NEW.council_meeting AND previous_council_meeting=OLD.council_meeting)
    AND EXISTS(SELECT FROM hall.council_meeting_snapshot WHERE council_meeting=OLD.council_meeting AND phase='closing') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.council_meeting = OLD.council_meeting THEN
    IF NEW.position = OLD.position THEN RETURN NEW; END IF;
    SELECT started_at INTO source_started FROM hall.council_meetings WHERE id = source;
    -- Closure retains an unfinished occurrence with conduct or recusal evidence
    -- in the original meeting. An unexamined previous PV also stays here and
    -- is not submitted for another vote on the successor agenda.
    -- subject_kind is generated after BEFORE triggers; compare its immutable
    -- source columns instead of its not-yet-computed NEW value.
    IF source_started IS NOT NULL AND OLD.position > 0 AND NEW.position = -OLD.position
      AND OLD.completed_at IS NULL
      AND (OLD.minutes_approval IS NOT NULL OR OLD.started_at IS NOT NULL
        OR EXISTS(SELECT FROM hall.agenda_item_recusal WHERE agenda_item=OLD.id))
      AND (to_jsonb(NEW)-ARRAY['position','subject_kind']) = (to_jsonb(OLD)-ARRAY['position','subject_kind'])
      AND EXISTS(SELECT FROM hall.council_meeting_snapshot WHERE council_meeting=source AND phase='closing')
      AND EXISTS(SELECT FROM hall.council_meetings WHERE previous_council_meeting=source) THEN RETURN NEW; END IF;
    -- Formal adjournment during conduct retains the original slot in the snapshot.
    IF source_started IS NOT NULL AND OLD.position > 0 AND NEW.position = -OLD.position
      AND OLD.adjourned_at IS NULL AND NEW.adjourned_at IS NOT NULL THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION USING ERRCODE = 'HV801', MESSAGE = 'the frozen agenda cannot be recomposed';
END;
$$;
CREATE TRIGGER council_agenda_item_z_freeze_composition BEFORE INSERT OR UPDATE OR DELETE ON hall.council_agenda_item
FOR EACH ROW EXECUTE FUNCTION hall.enforce_frozen_agenda_composition();

-- @functional-requirement HALL-FR-NOT-030 PREPARATION_DOCUMENT_HISTORY_IS_IMMUTABLE:
CREATE FUNCTION hall.reject_preparation_history_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'HV802', MESSAGE = 'preparation document history is immutable';
END;
$$;
CREATE TRIGGER council_agenda_freeze_immutable BEFORE UPDATE OR DELETE ON hall.council_agenda_freeze
FOR EACH ROW EXECUTE FUNCTION hall.reject_preparation_history_change();
CREATE TRIGGER council_agenda_freeze_no_truncate BEFORE TRUNCATE ON hall.council_agenda_freeze
FOR EACH STATEMENT EXECUTE FUNCTION hall.reject_preparation_history_change();

CREATE TRIGGER council_agenda_reopening_immutable BEFORE UPDATE OR DELETE ON hall.council_agenda_reopening
FOR EACH ROW EXECUTE FUNCTION hall.reject_preparation_history_change();
CREATE TRIGGER council_agenda_reopening_no_truncate BEFORE TRUNCATE ON hall.council_agenda_reopening
FOR EACH STATEMENT EXECUTE FUNCTION hall.reject_preparation_history_change();

CREATE FUNCTION hall.meeting_notice_meeting_facts(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object('id', meeting.id, 'number', meeting.number,
    'scheduledAt', meeting.scheduled_at, 'location', meeting.location,
    'agendaFrozenAt', frozen.frozen_at, 'agenda', frozen.agenda)
  FROM hall.council_meetings meeting JOIN hall.active_council_agenda_freeze frozen ON frozen.council_meeting = meeting.id
  WHERE meeting.id = target_meeting;
$$;
-- @functional-requirement HALL-FR-NOT-050 NOTICE_GENERATION_PERSISTS_A_VERSION_WITHOUT_TRANSMISSION:
-- This artifact records no sending, publication, receipt, or legal deadline.
CREATE TABLE hall.meeting_notice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  council_meeting UUID NOT NULL REFERENCES hall.council_meetings(id),
  version INTEGER NOT NULL CHECK (version > 0),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  binary_object UUID NOT NULL REFERENCES hall.binary_object(id),
  facts JSONB NOT NULL CHECK (jsonb_typeof(facts) = 'object'),
  UNIQUE(council_meeting,version)
);
CREATE TRIGGER meeting_notice_immutable BEFORE UPDATE OR DELETE ON hall.meeting_notice
FOR EACH ROW EXECUTE FUNCTION hall.reject_preparation_history_change();
CREATE TRIGGER meeting_notice_no_truncate BEFORE TRUNCATE ON hall.meeting_notice
FOR EACH STATEMENT EXECUTE FUNCTION hall.reject_preparation_history_change();


CREATE FUNCTION hall.current_meeting_notice_id(target_meeting UUID)
RETURNS UUID LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT id FROM hall.meeting_notice WHERE council_meeting = target_meeting
    AND facts->'meeting' = hall.meeting_notice_meeting_facts(target_meeting)
  ORDER BY version DESC LIMIT 1;
$$;
CREATE FUNCTION hall.council_meeting_preparation_blockers(target hall.council_meetings)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path=pg_catalog,hall AS $$
DECLARE blockers JSONB := '[]';
BEGIN
  IF target.scheduled_at IS NULL THEN blockers := blockers || '[{"code":"meetingNotScheduled"}]'::jsonb; END IF;
  IF target.location IS NULL OR btrim(target.location) = '' THEN blockers := blockers || '[{"code":"meetingLocationMissing"}]'::jsonb; END IF;
  IF NOT EXISTS (SELECT FROM hall.active_council_agenda_freeze WHERE council_meeting=target.id) THEN
    blockers := blockers || '[{"code":"agendaNotFrozen"}]'::jsonb;
  END IF;
  IF hall.current_meeting_notice_id(target.id) IS NULL THEN blockers := blockers || '[{"code":"currentNoticeMissing"}]'::jsonb; END IF;
  RETURN blockers;
END $$;

-- @functional-requirement HALL-FR-NOT-090 MEETING_START_REQUIRES_THE_CURRENT_NOTICE:
CREATE FUNCTION hall.require_current_notice_for_start()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  IF OLD.started_at IS NULL AND NEW.started_at IS NOT NULL AND (jsonb_array_length(hall.council_meeting_preparation_blockers(OLD)) > 0
    OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at OR NEW.location IS DISTINCT FROM OLD.location) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV807', MESSAGE = 'meeting start requires the current generated notice';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER council_meetings_z_notice_before_start BEFORE UPDATE ON hall.council_meetings
FOR EACH ROW EXECUTE FUNCTION hall.require_current_notice_for_start();
