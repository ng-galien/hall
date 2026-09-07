-- @functional-requirement HALL-FR-AGI-410 OPEN_QUESTIONS_CAN_BE_APPENDED_DURING_MEETING:
-- The event belongs to the original meeting even when its occurrence is later
-- carried forward. It does not amend the frozen notice or opening observation.
CREATE TABLE hall.council_agenda_addition (
  agenda_item UUID PRIMARY KEY REFERENCES hall.council_agenda_item(id) DEFERRABLE INITIALLY DEFERRED,
  council_meeting UUID NOT NULL REFERENCES hall.council_meetings(id),
  introduced_at TIMESTAMPTZ NOT NULL,
  recorded_by TEXT NOT NULL
);

CREATE FUNCTION hall.enforce_council_agenda_addition()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,hall AS $$
DECLARE meeting hall.council_meetings;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE='HV235',MESSAGE='an agenda addition is immutable';
  END IF;
  SELECT * INTO meeting FROM hall.council_meetings WHERE id=NEW.council_meeting FOR UPDATE;
  IF NOT FOUND OR meeting.started_at IS NULL OR meeting.closed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='HV235',MESSAGE='an open question addition requires an ongoing meeting';
  END IF;
  NEW.introduced_at:=clock_timestamp();
  IF NEW.introduced_at<meeting.started_at THEN
    RAISE EXCEPTION USING ERRCODE='HV235',MESSAGE='question addition cannot precede meeting opening';
  END IF;
  NEW.recorded_by:=nullif(current_setting('hall.actor_id',true),'');
  RETURN NEW;
END;
$$;
CREATE TRIGGER council_agenda_addition_history BEFORE INSERT OR UPDATE OR DELETE ON hall.council_agenda_addition
FOR EACH ROW EXECUTE FUNCTION hall.enforce_council_agenda_addition();
CREATE TRIGGER council_agenda_addition_no_truncate BEFORE TRUNCATE ON hall.council_agenda_addition
FOR EACH STATEMENT EXECUTE FUNCTION hall.enforce_council_agenda_addition();

CREATE FUNCTION hall.validate_council_agenda_addition()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,hall AS $$
BEGIN
  IF NOT EXISTS(SELECT FROM hall.council_agenda_item item WHERE item.id=NEW.agenda_item
    AND item.council_meeting=NEW.council_meeting AND item.open_question IS NOT NULL
    AND item.minutes_approval IS NULL AND item.council_decision_proposal IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='HV235',MESSAGE='a meeting addition must identify an open question in that meeting';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER council_agenda_addition_validate AFTER INSERT ON hall.council_agenda_addition
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hall.validate_council_agenda_addition();

CREATE FUNCTION hall.council_agenda_introduced_at(target_meeting UUID,target_item UUID)
RETURNS TIMESTAMPTZ LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
 SELECT introduced_at FROM hall.council_agenda_addition WHERE council_meeting=target_meeting AND agenda_item=target_item;
$$;
