-- Lifecycle and cross-entity invariants: a vote is inserted once into an open
-- ballot, uses that ballot's mode and, when public, references a participation
-- belonging to that exact ballot. Votes are immutable facts after insertion.
CREATE FUNCTION enforce_vote_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, hall
AS $$
DECLARE
  ballot_completed_at TIMESTAMPTZ;
  expected_mode ballot_mode;
  participation_ballot UUID;
BEGIN
  -- @functional-requirement HALL-FR-VOT-060 VOTE_IS_IMMUTABLE: A recorded vote is an immutable
  -- fact. Updates, deletes and table
  -- truncation are rejected by the same trigger function.
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV501',
      MESSAGE = 'a vote is immutable';
  END IF;

  -- @technical-requirement HALL-TR-CON-220 CONDUCT_CHANGES_SERIALIZE_WITH_VOTING:
  -- All physical-presence and membership writes lock the meeting. Expression
  -- of a vote joins that lock order before locking its ballot.
  PERFORM 1 FROM hall.council_meetings m JOIN hall.council_agenda_item item ON item.council_meeting=m.id
    JOIN hall.ballots b ON b.council_agenda_item=item.id WHERE b.id=NEW.ballot FOR UPDATE OF m;

  -- @technical-requirement HALL-TR-CON-100 VOTE_INSERT_SERIALIZES_WITH_BALLOT_COMPLETION:
  -- Lock the ballot before recording the vote so vote
  -- insertion cannot race with ballot completion.
  SELECT completed_at, mode
  INTO ballot_completed_at, expected_mode
  FROM ballots
  WHERE id = NEW.ballot
  FOR UPDATE;

  -- Referential invariant: a vote cannot exist without its ballot.
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV902',
      MESSAGE = format('unknown ballot %s', NEW.ballot);
  END IF;

  -- @functional-requirement HALL-FR-VOT-070 COMPLETED_BALLOT_REJECTS_VOTES: Completion freezes
  -- the set of recorded votes.
  IF ballot_completed_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV502',
      MESSAGE = 'a completed ballot cannot receive votes';
  END IF;

  -- @functional-requirement HALL-FR-VOT-080 VOTE_MODE_MATCHES_BALLOT_MODE: The representation of
  -- a vote is dictated by its ballot;
  -- a public vote cannot be stored as secret, nor the reverse.
  IF NEW.mode IS DISTINCT FROM expected_mode THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV503',
      MESSAGE = 'vote mode must match ballot mode';
  END IF;

  -- @functional-requirement HALL-FR-VOT-090 PUBLIC_VOTE_PARTICIPATION_BELONGS_TO_BALLOT: A named
  -- public vote uses a participation belonging to this
  -- exact ballot. Secret aggregate votes have no participation and skip this
  -- named-voter check.
  IF NEW.ballot_participation IS NOT NULL THEN
    SELECT ballot
    INTO participation_ballot
    FROM ballot_participation
    WHERE id = NEW.ballot_participation;

    -- A missing participation also yields NULL and therefore cannot equal the
    -- vote ballot under IS DISTINCT FROM semantics.
    IF participation_ballot IS DISTINCT FROM NEW.ballot THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV504',
        MESSAGE = 'vote participation must belong to the ballot';
    END IF;
  END IF;

  IF NEW.mode='public' THEN
    IF EXISTS(SELECT FROM hall.ballot_non_participation WHERE ballot_participation=NEW.ballot_participation) THEN
      RAISE EXCEPTION USING ERRCODE = 'HV512',MESSAGE='a public participant cannot both express a vote and not participate';
    END IF;
    IF NEW.ballot_participation IS NOT NULL AND NOT EXISTS(SELECT FROM hall.ballot_participation p JOIN hall.ballots b ON b.id=p.ballot
      WHERE p.id=NEW.ballot_participation AND hall.agenda_item_attendance_is_eligible(b.council_agenda_item,p.meeting_attendance)) THEN
      RAISE EXCEPTION USING ERRCODE = 'HV513',MESSAGE='a public voter or proxy holder must still be eligible when expressing the vote';
    END IF;
  END IF;
  -- The vote satisfies immutability, timing, secrecy and scope invariants.
  RETURN NEW;
END;
$$;

CREATE TRIGGER votes_enforce_immutability
BEFORE INSERT OR UPDATE OR DELETE ON votes
FOR EACH ROW
EXECUTE FUNCTION enforce_vote_immutability();

-- @technical-requirement HALL-TR-INT-060 TRUNCATE_CANNOT_BYPASS_VOTE_IMMUTABILITY:
-- Statement-level deletion cannot bypass vote immutability.
CREATE TRIGGER votes_reject_truncate
BEFORE TRUNCATE ON votes
FOR EACH STATEMENT
EXECUTE FUNCTION enforce_vote_immutability();
