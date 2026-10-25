-- Lifecycle and cross-entity invariants: a participation is inserted only into
-- an open ballot, is immutable, belongs to the agenda item's meeting, and refers
-- only to a present or represented attendance declaration.
CREATE FUNCTION hall.enforce_ballot_participation_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, hall
AS $$
DECLARE
  ballot_completed_at TIMESTAMPTZ;
  ballot_meeting UUID;
  attendance_meeting UUID;
  attendance_status meeting_attendance_status;
  target_item UUID;
  departure_accounted BOOLEAN;
BEGIN
  -- @implements-requirement HALL-FR-BAL-070
  -- participation is an immutable declaration; only insertion
  -- is legal, including against attempts to delete or truncate it later.
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV301',
      MESSAGE = 'ballot participation is immutable';
  END IF;

  PERFORM 1 FROM hall.council_meetings m JOIN hall.council_agenda_item item ON item.council_meeting=m.id
    JOIN hall.ballots b ON b.council_agenda_item=item.id WHERE b.id=NEW.ballot FOR UPDATE OF m;

  -- @implements-requirement HALL-TR-CON-060
  -- Lock the ballot while declaring participation so the
  -- declaration cannot race with completion of that same ballot.
  SELECT ballots.completed_at, council_agenda_item.council_meeting, council_agenda_item.id
  INTO ballot_completed_at, ballot_meeting, target_item
  FROM ballots
  JOIN council_agenda_item ON council_agenda_item.id = ballots.council_agenda_item
  WHERE ballots.id = NEW.ballot
  FOR UPDATE OF ballots, council_agenda_item;

  -- Referential invariant: participation cannot exist without its ballot.
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV902',
      MESSAGE = format('unknown ballot %s', NEW.ballot);
  END IF;

  -- @implements-requirement HALL-FR-BAL-080
  -- participation set is frozen once the ballot is
  -- completed.
  IF ballot_completed_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV302',
      MESSAGE = 'a completed ballot cannot receive participation';
  END IF;

  -- Referential invariant: participation identifies one actual attendance fact.
  SELECT a.council_meeting, current.status
  INTO attendance_meeting, attendance_status
  FROM meeting_attendance a CROSS JOIN LATERAL hall.current_meeting_attendance(a.council_meeting) current
  WHERE a.id = NEW.meeting_attendance AND current.id=a.id;

  -- Diagnostic invariant: report a missing attendance before comparing it with
  -- the ballot meeting.
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV903',
      MESSAGE = format('unknown meeting attendance %s', NEW.meeting_attendance);
  END IF;

  -- @implements-requirement HALL-FR-BAL-090
  -- ballot can use only attendance declared for the meeting
  -- in which its agenda item is examined.
  IF attendance_meeting IS DISTINCT FROM ballot_meeting THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV303',
      MESSAGE = 'ballot participation must belong to the ballot meeting';
  END IF;

  SELECT hall.candidate_accounts_for_departure(target_item,p.candidate,NEW.meeting_attendance)
  INTO departure_accounted FROM hall.ballots b JOIN hall.ballot_result_preview p ON p.id=b.result_preview
  WHERE b.id=NEW.ballot;
  -- @implements-requirement HALL-FR-BAL-100
  -- Present or represented members can vote. A member whose departure after
  -- discussion is evidenced can only be retained for explicit non-participation
  -- accounting in the reviewed candidate, never to express a new vote.
  IF attendance_status NOT IN ('present', 'represented') AND NOT coalesce(departure_accounted,false) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV304',
      MESSAGE = 'ballot participation requires voting attendance';
  END IF;

  -- Regulatory basis: CGCT L2131-11 first sentence and L1111-6 II/III,
  -- versions 2025-12-24. Product enforcement uses participation exclusion,
  -- preserving public/secret vote shapes rather than adding a vote choice.
  -- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053153029
  -- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053153012
  -- @implements-requirement HALL-FR-BAL-310
  -- A recused member cannot vote personally or exercise a written proxy.
  IF NOT hall.agenda_item_attendance_is_eligible(target_item, NEW.meeting_attendance) AND NOT coalesce(departure_accounted,false) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV305', MESSAGE = 'a recused member cannot participate in this ballot';
  END IF;

  NEW.physically_present := attendance_status='present';
  -- The participation satisfies lifecycle, scope and eligibility invariants.
  RETURN NEW;
END;
$$;

CREATE TRIGGER ballot_participation_enforce_lifecycle
BEFORE INSERT OR UPDATE OR DELETE ON hall.ballot_participation
FOR EACH ROW
EXECUTE FUNCTION enforce_ballot_participation_lifecycle();

-- @implements-requirement HALL-TR-INT-040
-- Statement-level deletion cannot bypass participation immutability.
CREATE TRIGGER ballot_participation_reject_truncate
BEFORE TRUNCATE ON hall.ballot_participation
FOR EACH STATEMENT
EXECUTE FUNCTION enforce_ballot_participation_lifecycle();
