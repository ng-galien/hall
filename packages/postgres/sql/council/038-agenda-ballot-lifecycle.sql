-- @implements-requirement HALL-FR-AGI-160
CREATE FUNCTION hall.council_agenda_item_has_completed_ballot(
  target_agenda_item UUID,
  target_completed_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM ballots
    WHERE council_agenda_item = target_agenda_item
      AND completed_at = target_completed_at
      AND result IS NOT NULL
  );
$$;

-- Direct completion is valid for an OpenQuestion. A MinutesApproval or
-- CouncilDecisionProposal completes only through its ballot authority.
CREATE FUNCTION hall.enforce_council_agenda_item_completion_authority()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, hall
AS $$
BEGIN
  -- @implements-requirement HALL-FR-AGI-150
  -- An open question has no ballot by nature. Its explicit completion is the
  -- authoritative record that consideration ended.
  IF NEW.completed_at IS NULL OR NEW.open_question IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF council_agenda_item_has_completed_ballot(NEW.id, NEW.completed_at) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = 'HV221',
    MESSAGE = 'a ballot-backed agenda item completes only with its completed ballot';
END;
$$;

CREATE TRIGGER council_agenda_item_enforce_completion_authority
AFTER UPDATE ON hall.council_agenda_item
FOR EACH ROW
WHEN (OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL)
EXECUTE FUNCTION enforce_council_agenda_item_completion_authority();

-- @implements-requirement HALL-FR-AGI-170
-- @implements-requirement HALL-TR-CON-070
CREATE FUNCTION hall.complete_ballot_agenda_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, hall
AS $$
BEGIN
  UPDATE council_agenda_item
  SET completed_at = NEW.completed_at
  WHERE id = NEW.council_agenda_item
    AND position > 0
    AND started_at IS NOT NULL
    AND completed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV409',
      MESSAGE = 'a completed ballot requires an active agenda item';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ballots_complete_agenda_item
AFTER UPDATE ON hall.ballots
FOR EACH ROW
WHEN (OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL)
EXECUTE FUNCTION complete_ballot_agenda_item();
