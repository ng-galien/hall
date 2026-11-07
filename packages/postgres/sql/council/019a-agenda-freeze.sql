-- An established revision of the agenda: its points, date and location as
-- issued with the meeting notice of that revision. Its number is its rank among
-- the revisions of the meeting by establishment time. A reopening closes it and
-- starts the next revision; while no revision is active the agenda, date and
-- location of the meeting form the open revision.
-- @implements-requirement HALL-FR-NOT-010
-- @implements-requirement HALL-FR-NOT-140
CREATE TABLE hall.council_agenda_freeze (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  council_meeting UUID NOT NULL REFERENCES hall.council_meetings(id),
  frozen_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  agenda JSONB NOT NULL CONSTRAINT "council_agenda_freeze_agenda_check" CHECK (jsonb_typeof(agenda) = 'array'::text AND jsonb_array_length(agenda) > 0),
  scheduled_at TIMESTAMPTZ,
  location TEXT
);

CREATE TABLE hall.council_agenda_reopening (
  agenda_freeze UUID PRIMARY KEY REFERENCES hall.council_agenda_freeze(id),
  reopened_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp()
);
CREATE VIEW hall.active_council_agenda_freeze AS
SELECT frozen.* FROM hall.council_agenda_freeze frozen
WHERE NOT EXISTS (SELECT FROM hall.council_agenda_reopening reopening WHERE reopening.agenda_freeze = frozen.id);

CREATE FUNCTION hall.council_agenda_revision_number(target hall.council_agenda_freeze)
RETURNS INTEGER LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT count(*)::INTEGER FROM hall.council_agenda_freeze earlier
  WHERE earlier.council_meeting = target.council_meeting
    AND (earlier.frozen_at, earlier.id) <= (target.frozen_at, target.id);
$$;

-- @implements-requirement HALL-FR-NOT-020
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
  RAISE EXCEPTION USING ERRCODE = 'HV801', MESSAGE = 'the established agenda revision cannot be recomposed';
END;
$$;
CREATE TRIGGER council_agenda_item_z_freeze_composition BEFORE INSERT OR UPDATE OR DELETE ON hall.council_agenda_item
FOR EACH ROW EXECUTE FUNCTION hall.enforce_frozen_agenda_composition();

-- @implements-requirement HALL-FR-NOT-030
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
    'scheduledAt', frozen.scheduled_at, 'location', frozen.location,
    'agendaFrozenAt', frozen.frozen_at, 'agenda', frozen.agenda)
  FROM hall.council_meetings meeting JOIN hall.active_council_agenda_freeze frozen ON frozen.council_meeting = meeting.id
  WHERE meeting.id = target_meeting;
$$;
-- @implements-requirement HALL-FR-NOT-050
-- This artifact records no sending, publication, receipt, or legal deadline.
CREATE TABLE hall.meeting_notice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  council_meeting UUID NOT NULL REFERENCES hall.council_meetings(id),
  version INTEGER NOT NULL CONSTRAINT "meeting_notice_version_check" CHECK (version > 0),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  binary_object UUID NOT NULL REFERENCES hall.binary_object(id),
  facts JSONB NOT NULL CONSTRAINT "meeting_notice_facts_check" CHECK (jsonb_typeof(facts) = 'object'::text),
  agenda_freeze UUID REFERENCES hall.council_agenda_freeze(id),
  UNIQUE(council_meeting,version)
);
CREATE TRIGGER meeting_notice_immutable BEFORE UPDATE OR DELETE ON hall.meeting_notice
FOR EACH ROW EXECUTE FUNCTION hall.reject_preparation_history_change();
CREATE TRIGGER meeting_notice_no_truncate BEFORE TRUNCATE ON hall.meeting_notice
FOR EACH STATEMENT EXECUTE FUNCTION hall.reject_preparation_history_change();


-- The notice of the established revision: the last PDF generated under it.
CREATE FUNCTION hall.council_agenda_revision_notice_id(target_meeting UUID)
RETURNS UUID LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT notice.id FROM hall.meeting_notice notice
  JOIN hall.active_council_agenda_freeze frozen ON frozen.id = notice.agenda_freeze
  WHERE frozen.council_meeting = target_meeting
  ORDER BY notice.version DESC LIMIT 1;
$$;

-- The revision of the agenda a meeting is on: the active established revision,
-- or the open revision that follows the last established one.
CREATE FUNCTION hall.council_agenda_revision_projection(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object(
    'number', (SELECT count(*)::INTEGER FROM hall.council_agenda_freeze WHERE council_meeting = target_meeting)
      + CASE WHEN frozen.id IS NULL THEN 1 ELSE 0 END,
    'establishedAt', frozen.frozen_at,
    'noticeId', CASE WHEN frozen.id IS NULL THEN NULL ELSE hall.council_agenda_revision_notice_id(target_meeting) END)
  FROM (SELECT target_meeting AS id) meeting
  LEFT JOIN hall.active_council_agenda_freeze frozen ON frozen.council_meeting = meeting.id;
$$;

CREATE FUNCTION hall.council_meeting_preparation_blockers(target hall.council_meetings)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path=pg_catalog,hall AS $$
DECLARE blockers JSONB := '[]';
BEGIN
  IF target.scheduled_at IS NULL THEN blockers := blockers || '[{"code":"meetingNotScheduled"}]'::jsonb; END IF;
  IF target.location IS NULL OR btrim(target.location) = '' THEN blockers := blockers || '[{"code":"meetingLocationMissing"}]'::jsonb; END IF;
  IF NOT EXISTS (SELECT FROM hall.active_council_agenda_freeze WHERE council_meeting=target.id) THEN
    blockers := blockers || '[{"code":"agendaRevisionOpen"}]'::jsonb;
  END IF;
  RETURN blockers;
END $$;

-- @implements-requirement HALL-FR-NOT-090
CREATE FUNCTION hall.require_established_revision_for_start()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  IF OLD.started_at IS NULL AND NEW.started_at IS NOT NULL
    AND jsonb_array_length(hall.council_meeting_preparation_blockers(OLD)) > 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'HV811', MESSAGE = 'meeting start requires an established agenda revision';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER council_meetings_z_revision_before_start BEFORE UPDATE ON hall.council_meetings
FOR EACH ROW EXECUTE FUNCTION hall.require_established_revision_for_start();

-- The date and location belong to the revision: an established revision keeps them.
-- @implements-requirement HALL-FR-NOT-020
CREATE FUNCTION hall.enforce_established_revision_schedule()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  IF OLD.started_at IS NULL
    AND (NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at OR NEW.location IS DISTINCT FROM OLD.location)
    AND EXISTS (SELECT FROM hall.active_council_agenda_freeze WHERE council_meeting = OLD.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV801', MESSAGE = 'the established revision keeps its date and location';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER council_meetings_z_revision_schedule BEFORE UPDATE ON hall.council_meetings
FOR EACH ROW EXECUTE FUNCTION hall.enforce_established_revision_schedule();
