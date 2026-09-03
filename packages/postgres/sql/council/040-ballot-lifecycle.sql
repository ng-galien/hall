-- Lifecycle: a ballot is created open during a started meeting, completed once,
-- and immutable afterwards. Completion consumes immutable participations and
-- votes, verifies their cardinality and computes the result inside the same row
-- update that records completed_at. The agenda item is opened independently
-- before ballot creation; ballot completion completes it at the same timestamp.
CREATE FUNCTION enforce_ballot_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  meeting_started_at TIMESTAMPTZ;
  meeting_closed_at TIMESTAMPTZ;
  agenda_item_started_at TIMESTAMPTZ;
  agenda_item_completed_at TIMESTAMPTZ;
  agenda_item_position INTEGER;
  agenda_item_minutes_approval UUID;
  agenda_item_decision_proposal UUID;
BEGIN
  -- @functional-requirement HALL-FR-BAL-200 BALLOT_IS_IMMUTABLE: A ballot is a durable voting
  -- fact and cannot be removed by row
  -- deletion or table truncation.
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV401',
      MESSAGE = 'a ballot is immutable';
  END IF;

  -- Initial-state invariants are evaluated independently from completion rules:
  -- every ballot starts open and belongs to an active, ballot-eligible agenda item.
  IF TG_OP = 'INSERT' THEN
    -- @functional-requirement HALL-FR-BAL-210 BALLOT_IS_CREATED_OPEN: Result and completion
    -- timestamp are both absent on creation;
    -- their structural equivalence is also enforced inline on the table.
    IF NEW.completed_at IS NOT NULL OR NEW.result IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV402',
        MESSAGE = 'a ballot must be open on insert';
    END IF;

    -- @technical-requirement HALL-TR-CON-080 BALLOT_CREATION_SERIALIZES_WITH_AGENDA_COMPLETION:
    -- Lock the agenda item while attaching its unique ballot so completion or
    -- deprogramming cannot race with ballot creation.
    SELECT
      council_meetings.started_at,
      council_meetings.closed_at,
      council_agenda_item.started_at,
      council_agenda_item.completed_at,
      council_agenda_item.position,
      council_agenda_item.minutes_approval,
      council_agenda_item.council_decision_proposal
    INTO
      meeting_started_at,
      meeting_closed_at,
      agenda_item_started_at,
      agenda_item_completed_at,
      agenda_item_position,
      agenda_item_minutes_approval,
      agenda_item_decision_proposal
    FROM council_agenda_item
    JOIN council_meetings ON council_meetings.id = council_agenda_item.council_meeting
    WHERE council_agenda_item.id = NEW.council_agenda_item
    FOR UPDATE OF council_agenda_item;

    -- Referential invariant: lifecycle diagnostics identify the missing
    -- agenda item before evaluating any meeting or temporal condition.
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV904',
        MESSAGE = format('unknown council agenda item %s', NEW.council_agenda_item);
    END IF;

    -- @functional-requirement HALL-FR-BAL-220 BALLOT_REQUIRES_STARTED_MEETING: A ballot is part
    -- of the conduct of a started council
    -- meeting, never its preparation.
    IF meeting_started_at IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV403',
        MESSAGE = 'a ballot requires a started council meeting';
    END IF;

    -- @functional-requirement HALL-FR-BAL-280 CLOSED_MEETING_REJECTS_NEW_BALLOTS:
    IF meeting_closed_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV412',
        MESSAGE = 'a closed council meeting cannot receive a ballot';
    END IF;

    -- @functional-requirement HALL-FR-BAL-230 BALLOT_REQUIRES_ACTIVE_AGENDA_ITEM: Opening the
    -- agenda item is independent and precedes ballot creation. A deprogrammed,
    -- completed or open-question item cannot receive a ballot.
    IF agenda_item_started_at IS NULL
      OR agenda_item_completed_at IS NOT NULL
      OR agenda_item_position < 0
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV404',
        MESSAGE = 'a ballot requires an active agenda item';
    END IF;

    IF agenda_item_minutes_approval IS NULL AND agenda_item_decision_proposal IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV411',
        MESSAGE = 'an open question cannot receive a ballot';
    END IF;

    -- The new open ballot satisfies its meeting and agenda invariants.
    RETURN NEW;
  END IF;

  -- @functional-requirement HALL-FR-BAL-240 BALLOT_DEFINITION_IS_IMMUTABLE: Ballot identity,
  -- agenda item, secrecy mode and chairman are
  -- fixed for the entire ballot lifecycle.
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.council_agenda_item IS DISTINCT FROM OLD.council_agenda_item
    OR NEW.mode IS DISTINCT FROM OLD.mode
    OR NEW.chairman IS DISTINCT FROM OLD.chairman
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV405',
      MESSAGE = 'a ballot definition is immutable';
  END IF;

  -- @functional-requirement HALL-FR-BAL-250 COMPLETED_BALLOT_IS_IMMUTABLE: Once completed, every
  -- ballot field is immutable;
  -- an identical no-op update remains observationally harmless.
  IF OLD.completed_at IS NOT NULL THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV406',
        MESSAGE = 'a completed ballot is immutable';
    END IF;

    -- No persisted voting fact changed.
    RETURN NEW;
  END IF;

  -- @functional-requirement HALL-FR-BAL-260 BALLOT_RESULT_IS_DERIVED: Callers record only
  -- completed_at. The database alone
  -- derives result from the immutable votes.
  IF NEW.result IS DISTINCT FROM OLD.result THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV407',
      MESSAGE = 'a ballot result is computed on completion';
  END IF;

  -- Open-state invariant: an update that leaves completed_at NULL does not close
  -- the ballot and therefore does not compute a result.
  IF NEW.completed_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- @functional-requirement HALL-FR-BAL-270 BALLOT_COMPLETION_REQUIRES_ONE_VOTE_PER_PARTICIPATION:
  -- At completion every declared participation has
  -- produced exactly one choice. Public rows count one and secret rows carry an
  -- aggregate count, so totals rather than row counts are compared.
  IF ballot_vote_count(OLD.id) <> ballot_participation_count(OLD.id) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV408',
      MESSAGE = 'every ballot participation must produce one vote';
  END IF;

  -- Result invariant: completion derives the outcome from the immutable voting
  -- facts and the public/secret tie rule; it never accepts a supplied result.
  NEW.result := derive_ballot_result(OLD.id);

  -- The row can now be persisted atomically with completed_at and its result.
  RETURN NEW;
END;
$$;

CREATE TRIGGER ballots_enforce_lifecycle
BEFORE INSERT OR UPDATE OR DELETE ON ballots
FOR EACH ROW
EXECUTE FUNCTION enforce_ballot_lifecycle();

-- @technical-requirement HALL-TR-INT-050 TRUNCATE_CANNOT_BYPASS_BALLOT_IMMUTABILITY:
-- Statement-level deletion cannot bypass ballot immutability.
CREATE TRIGGER ballots_reject_truncate
BEFORE TRUNCATE ON ballots
FOR EACH STATEMENT
EXECUTE FUNCTION enforce_ballot_lifecycle();

-- @technical-requirement HALL-TR-CON-090 BALLOT_CHAIRMAN_VALIDATION_IS_DEFERRED:
-- Chairman validation is deferred so the ballot and its participation can be
-- created in the same transaction. Functionally, Ballot.chairman is a
-- participation of that same ballot whose
-- underlying attendance is physically present. The check is deferred because
-- ballot and participation are created atomically and reference each other.
CREATE FUNCTION enforce_ballot_chairman()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $$
BEGIN
  -- Chairmanship invariant: the chairman is a participation in this exact
  -- ballot and its underlying attendance is physically present, not represented.
  IF NOT ballot_has_valid_chairman(NEW.id, NEW.chairman) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV410',
      MESSAGE = 'the ballot chairman must be a present ballot participation';
  END IF;

  -- The deferred cyclic Ballot/Participation relation is valid at commit time.
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER ballots_enforce_chairman
AFTER INSERT OR UPDATE ON ballots
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_ballot_chairman();
