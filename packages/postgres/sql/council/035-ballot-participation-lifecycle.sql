-- Lifecycle and cross-entity invariants: a participation is inserted only into
-- an open ballot, is immutable, belongs to the agenda item's meeting, and refers
-- only to a present or represented attendance declaration.
CREATE FUNCTION enforce_ballot_participation_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, hall
AS $$
DECLARE
  ballot_completed_at TIMESTAMPTZ;
  ballot_meeting UUID;
  attendance_meeting UUID;
  attendance_status meeting_attendance_status;
BEGIN
  -- @functional-requirement HALL-FR-BAL-070 BALLOT_PARTICIPATION_IS_IMMUTABLE: Ballot
  -- participation is an immutable declaration; only insertion
  -- is legal, including against attempts to delete or truncate it later.
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV301',
      MESSAGE = 'ballot participation is immutable';
  END IF;

  -- @technical-requirement HALL-TR-CON-060 PARTICIPATION_INSERT_SERIALIZES_WITH_BALLOT_COMPLETION:
  -- Lock the ballot while declaring participation so the
  -- declaration cannot race with completion of that same ballot.
  SELECT ballots.completed_at, council_agenda_item.council_meeting
  INTO ballot_completed_at, ballot_meeting
  FROM ballots
  JOIN council_agenda_item ON council_agenda_item.id = ballots.council_agenda_item
  WHERE ballots.id = NEW.ballot
  FOR UPDATE OF ballots;

  -- Referential invariant: participation cannot exist without its ballot.
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV902',
      MESSAGE = format('unknown ballot %s', NEW.ballot);
  END IF;

  -- @functional-requirement HALL-FR-BAL-080 COMPLETED_BALLOT_REJECTS_PARTICIPATION: The
  -- participation set is frozen once the ballot is
  -- completed.
  IF ballot_completed_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV302',
      MESSAGE = 'a completed ballot cannot receive participation';
  END IF;

  -- Referential invariant: participation identifies one actual attendance fact.
  SELECT council_meeting, status
  INTO attendance_meeting, attendance_status
  FROM meeting_attendance
  WHERE id = NEW.meeting_attendance;

  -- Diagnostic invariant: report a missing attendance before comparing it with
  -- the ballot meeting.
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV903',
      MESSAGE = format('unknown meeting attendance %s', NEW.meeting_attendance);
  END IF;

  -- @functional-requirement HALL-FR-BAL-090 BALLOT_PARTICIPATION_BELONGS_TO_BALLOT_MEETING: A
  -- ballot can use only attendance declared for the meeting
  -- in which its agenda item is examined.
  IF attendance_meeting IS DISTINCT FROM ballot_meeting THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV303',
      MESSAGE = 'ballot participation must belong to the ballot meeting';
  END IF;

  -- @functional-requirement HALL-FR-BAL-100 BALLOT_PARTICIPATION_REQUIRES_VOTING_ATTENDANCE:
  -- Only present or represented members take part in a
  -- ballot; excused and absent members do not.
  IF attendance_status NOT IN ('present', 'represented') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV304',
      MESSAGE = 'ballot participation requires voting attendance';
  END IF;

  -- The participation satisfies lifecycle, scope and eligibility invariants.
  RETURN NEW;
END;
$$;

CREATE TRIGGER ballot_participation_enforce_lifecycle
BEFORE INSERT OR UPDATE OR DELETE ON ballot_participation
FOR EACH ROW
EXECUTE FUNCTION enforce_ballot_participation_lifecycle();

-- @technical-requirement HALL-TR-INT-040 TRUNCATE_CANNOT_BYPASS_PARTICIPATION_IMMUTABILITY:
-- Statement-level deletion cannot bypass participation immutability.
CREATE TRIGGER ballot_participation_reject_truncate
BEFORE TRUNCATE ON ballot_participation
FOR EACH STATEMENT
EXECUTE FUNCTION enforce_ballot_participation_lifecycle();
