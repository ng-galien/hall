-- @technical-requirement HALL-TR-CON-110 COUNCIL_BUSINESS_AGENDA_WRITES_ARE_SERIALIZED:
-- Every membership mutation locks its aggregate root before the deferred
-- assertion. Concurrent agenda writes for one business therefore cannot create
-- a write-skew that escapes the final-state check.
CREATE FUNCTION lock_council_agenda_item_business()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, hall
AS $$
DECLARE
  target_business UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.council_business ELSE NEW.council_business END;
BEGIN
  IF target_business IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  PERFORM 1
  FROM council_business
  WHERE id = target_business
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV905',
      MESSAGE = format('unknown council business %s', target_business);
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER council_agenda_item_lock_business
BEFORE INSERT OR UPDATE OR DELETE ON council_agenda_item
FOR EACH ROW
EXECUTE FUNCTION lock_council_agenda_item_business();

-- @technical-requirement HALL-TR-CON-120 COUNCIL_AGENDA_SUBJECT_WRITES_ARE_SERIALIZED:
-- A prepared subject may occur on several meetings, but always under the same
-- CouncilBusiness. Locking the subject row prevents two transactions from
-- concurrently assigning it to different roots.
CREATE FUNCTION lock_council_agenda_item_subject()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, hall
AS $$
BEGIN
  IF NEW.minutes_approval IS NOT NULL THEN
    PERFORM 1 FROM minutes_approval WHERE id = NEW.minutes_approval FOR UPDATE;
  ELSIF NEW.council_decision_proposal IS NOT NULL THEN
    PERFORM 1 FROM council_decision_proposal
    WHERE id = NEW.council_decision_proposal FOR UPDATE;
  ELSE
    PERFORM 1 FROM open_question WHERE id = NEW.open_question FOR UPDATE;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER council_agenda_item_lock_subject
BEFORE INSERT OR UPDATE ON council_agenda_item
FOR EACH ROW
EXECUTE FUNCTION lock_council_agenda_item_subject();

-- @functional-requirement HALL-FR-BUS-030 AGENDA_SUBJECT_HAS_ONE_COUNCIL_BUSINESS:
CREATE FUNCTION council_agenda_item_subject_has_one_business(target council_agenda_item)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $$
  SELECT CASE WHEN target.subject_kind='businessConsultation' THEN target.council_business IS NOT NULL
    WHEN target.minutes_approval IS NOT NULL THEN target.council_business IS NULL
    WHEN target.council_decision_proposal IS NOT NULL THEN EXISTS (
      SELECT FROM council_decision_proposal WHERE id=target.council_decision_proposal AND council_business=target.council_business)
    ELSE EXISTS (SELECT FROM open_question WHERE id=target.open_question AND council_business=target.council_business) END;
$$;

CREATE FUNCTION enforce_council_agenda_item_subject_business()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $$
BEGIN
  IF council_agenda_item_subject_has_one_business(NEW) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = 'HV222',
    MESSAGE = 'an agenda subject belongs to exactly one council business';
END;
$$;

CREATE CONSTRAINT TRIGGER council_agenda_item_enforce_subject_business
AFTER INSERT OR UPDATE ON council_agenda_item
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_council_agenda_item_subject_business();
