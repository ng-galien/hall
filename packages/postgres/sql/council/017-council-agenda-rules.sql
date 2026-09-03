-- @functional-requirement HALL-FR-BUS-020 MINUTES_BUSINESS_IS_EXCLUSIVE:
-- A CouncilBusiness either supports placements of one MinutesApproval, or any
-- number of decision proposals and open questions. It never mixes both shapes.
CREATE FUNCTION council_business_agenda_members_are_compatible(target_business UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT NOT (
    count(*) FILTER (WHERE minutes_approval IS NOT NULL) > 0
    AND count(*) FILTER (
      WHERE council_decision_proposal IS NOT NULL OR open_question IS NOT NULL
    ) > 0
  )
  AND count(DISTINCT minutes_approval) FILTER (WHERE minutes_approval IS NOT NULL) <= 1
  FROM council_agenda_item
  WHERE council_business = target_business;
$$;

-- @technical-requirement HALL-TR-CON-110 COUNCIL_BUSINESS_AGENDA_WRITES_ARE_SERIALIZED:
-- Every membership mutation locks its aggregate root before the deferred
-- assertion. Concurrent agenda writes for one business therefore cannot create
-- a write-skew that escapes the final-state check.
CREATE FUNCTION lock_council_agenda_item_business()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_business UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.council_business ELSE NEW.council_business END;
BEGIN
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
AS $$
  SELECT count(DISTINCT council_business) <= 1
  FROM council_agenda_item
  WHERE (target.minutes_approval IS NOT NULL AND minutes_approval = target.minutes_approval)
     OR (
       target.council_decision_proposal IS NOT NULL
       AND council_decision_proposal = target.council_decision_proposal
     )
     OR (target.open_question IS NOT NULL AND open_question = target.open_question);
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

CREATE FUNCTION enforce_council_business_agenda_members()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $$
DECLARE
  target_business UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.council_business ELSE NEW.council_business END;
BEGIN
  IF council_business_agenda_members_are_compatible(target_business) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = 'HV211',
    MESSAGE = 'a minutes approval business cannot support other agenda subjects';
END;
$$;

CREATE CONSTRAINT TRIGGER council_agenda_item_enforce_business_members
AFTER INSERT OR UPDATE OR DELETE ON council_agenda_item
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_council_business_agenda_members();
