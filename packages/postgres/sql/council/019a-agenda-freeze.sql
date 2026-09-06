-- The agenda freeze is a preparation decision, independent of meeting conduct.
-- @functional-requirement HALL-FR-NOT-010 FROZEN_AGENDA_PRESERVES_QUESTIONS_AND_ORDER:
CREATE TABLE hall.council_agenda_freeze (
  council_meeting UUID PRIMARY KEY REFERENCES hall.council_meetings(id),
  frozen_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  agenda JSONB NOT NULL CHECK (jsonb_typeof(agenda) = 'array' AND jsonb_array_length(agenda) > 0)
);

-- @functional-requirement HALL-FR-NOT-020 FROZEN_AGENDA_CANNOT_BE_RECOMPOSED:
CREATE FUNCTION hall.enforce_frozen_agenda_composition()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE source UUID; target UUID; source_started TIMESTAMPTZ;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN source := OLD.council_meeting; END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN target := NEW.council_meeting; END IF;
  -- Same meeting lock as freeze and lifecycle; serialize both sides of moves.
  PERFORM 1 FROM hall.council_meetings WHERE id IN (source,target) ORDER BY id FOR UPDATE;
  IF NOT EXISTS (SELECT FROM hall.council_agenda_freeze WHERE council_meeting IN (source,target)) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.council_meeting = OLD.council_meeting THEN
    IF NEW.position = OLD.position THEN RETURN NEW; END IF;
    SELECT started_at INTO source_started FROM hall.council_meetings WHERE id = source;
    -- Formal adjournment during conduct retains the original slot in the snapshot.
    IF source_started IS NOT NULL AND OLD.position > 0 AND NEW.position = -OLD.position
      AND OLD.adjourned_at IS NULL AND NEW.adjourned_at IS NOT NULL THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION USING ERRCODE = 'HV801', MESSAGE = 'the frozen agenda cannot be recomposed';
END;
$$;
CREATE TRIGGER council_agenda_freeze_composition BEFORE INSERT OR UPDATE OR DELETE ON hall.council_agenda_item
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
