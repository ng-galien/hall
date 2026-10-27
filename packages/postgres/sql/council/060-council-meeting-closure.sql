-- Council meeting closure
-- =======================
--
-- Closing a meeting is one transaction: unfinished ordinary subjects are
-- carried to a newly provisioned successor, while an unexamined previous PV
-- remains historical and is never submitted for a second vote. The closed
-- meeting produces its own Minutes and the next mandatory MinutesApproval.

-- @implements-requirement HALL-FR-BAL-290
CREATE FUNCTION hall.council_meeting_has_open_ballot(target_meeting UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT EXISTS (
    SELECT
    FROM hall.ballots AS ballot
    JOIN hall.council_agenda_item AS agenda_item
      ON agenda_item.id = ballot.council_agenda_item
    WHERE agenda_item.council_meeting = target_meeting
      AND ballot.completed_at IS NULL
  )
$function$;

-- @implements-requirement HALL-FR-MTG-110
CREATE FUNCTION hall.council_meeting_closure_is_complete(target_meeting UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT EXISTS (
    SELECT
    FROM hall.council_meetings AS successor
    JOIN hall.minutes AS produced_minutes
      ON produced_minutes.council_meeting = target_meeting
    JOIN hall.minutes_approval AS approval
      ON approval.minutes = produced_minutes.id
    JOIN hall.council_agenda_item AS next_agenda_item
      ON next_agenda_item.council_meeting = successor.id
     AND next_agenda_item.minutes_approval = approval.id
     AND next_agenda_item.position = 1
    WHERE successor.previous_council_meeting = target_meeting
  )
  AND EXISTS (SELECT FROM hall.council_meeting_snapshot
    WHERE council_meeting = target_meeting AND phase = 'closing')
  AND NOT EXISTS (
    SELECT
    FROM hall.council_agenda_item AS unstarted
    WHERE unstarted.council_meeting = target_meeting
      AND unstarted.started_at IS NULL
      AND unstarted.position > 0
  )
  AND NOT EXISTS (
    SELECT
    FROM hall.council_agenda_item AS active
    WHERE active.council_meeting = target_meeting
      AND active.started_at IS NOT NULL
      AND active.completed_at IS NULL
      AND active.position > 0
  )
  AND NOT EXISTS (
    SELECT
    FROM hall.council_agenda_item AS deferred
    WHERE deferred.council_meeting = target_meeting
      AND (deferred.started_at IS NOT NULL OR deferred.adjourned_at IS NOT NULL OR (
      EXISTS (SELECT FROM hall.agenda_item_recusal WHERE agenda_item = deferred.id)
      AND EXISTS (SELECT FROM hall.council_meeting_snapshot snapshot,
        jsonb_array_elements(snapshot.payload->'agenda') recorded
        WHERE snapshot.council_meeting = deferred.council_meeting AND snapshot.phase = 'closing'
          AND recorded->>'id' = deferred.id::text AND (recorded->>'position')::integer > 0)))
      AND deferred.completed_at IS NULL
      AND deferred.minutes_approval IS NULL
      AND deferred.position < 0
      AND NOT EXISTS (
        SELECT
        FROM hall.council_meetings AS successor
        JOIN hall.council_agenda_item AS carried
          ON carried.council_meeting = successor.id
        WHERE successor.previous_council_meeting = target_meeting
          AND carried.council_business = deferred.council_business
          AND carried.minutes_approval IS NOT DISTINCT FROM deferred.minutes_approval
          AND carried.council_decision_proposal IS NOT DISTINCT FROM deferred.council_decision_proposal
          AND carried.open_question IS NOT DISTINCT FROM deferred.open_question
          AND carried.started_at IS NULL
          AND carried.position > 0
      )
  )
$function$;

CREATE FUNCTION hall.enforce_council_meeting_sequence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  -- @implements-requirement HALL-FR-MTG-140
  -- A successor is not merely labelled with a predecessor: at transaction end
  -- that predecessor is an immutable closed meeting.
  IF NEW.previous_council_meeting IS NOT NULL
    AND NOT EXISTS (
      SELECT
      FROM hall.council_meetings AS previous
      WHERE previous.id = NEW.previous_council_meeting
        -- TODO REMOVE_STALE: a stale predecessor may provision its successor without closure.
        AND (previous.closed_at IS NOT NULL OR previous.stale)
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV120',
      MESSAGE = 'a council meeting successor requires a closed predecessor';
  END IF;

  -- The closure fact cannot commit without its complete successor/minutes
  -- composition. The unique predecessor key proves that the successor is one.
  IF NEW.closed_at IS NOT NULL
    AND NOT hall.council_meeting_closure_is_complete(NEW.id)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV121',
      MESSAGE = 'a closed council meeting requires its successor and minutes approval';
  END IF;

  IF NEW.closed_at IS NOT NULL
    AND hall.council_meeting_has_open_ballot(NEW.id)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV118',
      MESSAGE = 'a council meeting with an open ballot cannot be closed';
  END IF;

  RETURN NEW;
END
$function$;

CREATE CONSTRAINT TRIGGER council_meetings_enforce_sequence
AFTER INSERT OR UPDATE ON hall.council_meetings
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_council_meeting_sequence();

-- @implements-requirement HALL-TR-CON-140
-- @implements-requirement HALL-FR-MTG-130
-- @implements-requirement HALL-FR-MTG-120
-- @implements-requirement HALL-FR-MIN-030
-- @implements-requirement HALL-FR-AGI-280
CREATE FUNCTION hall.close_council_meeting(
  target_meeting UUID,
  closure_time TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  meeting council_meetings;
  next_meeting UUID := gen_random_uuid();
  produced_minutes UUID := gen_random_uuid();
  produced_approval UUID := gen_random_uuid();
  renewed meeting_reconvocation;
BEGIN
  -- The meeting-row lock serializes closure with attendance, agenda writes and
  -- any competing closure attempt.
  SELECT *
  INTO meeting
  FROM council_meetings
  WHERE id = target_meeting
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV901',
      MESSAGE = format('unknown council meeting %s', target_meeting);
  END IF;

  IF closure_time IS NULL
    OR meeting.started_at IS NULL
    OR EXISTS(SELECT FROM hall.council_agenda_addition WHERE council_meeting=meeting.id AND introduced_at>closure_time)
    OR closure_time < meeting.started_at
    OR EXISTS (SELECT FROM council_agenda_item WHERE council_meeting = target_meeting
      AND greatest(started_at, completed_at, adjourned_at) > closure_time)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV116',
      MESSAGE = 'only a started council meeting can be closed';
  END IF;

  IF meeting.closed_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV114',
      MESSAGE = 'a closed council meeting is immutable';
  END IF;

  IF council_meeting_has_open_ballot(target_meeting) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV118',
      MESSAGE = 'a council meeting with an open ballot cannot be closed';
  END IF;

  PERFORM hall.capture_council_meeting_snapshot(meeting.id, 'closing', closure_time);

  -- @implements-requirement HALL-FR-MTG-290
  -- After a second convocation, the successor is the reconvened meeting, dated
  -- by that convocation at the same place. Otherwise it is provisioned without
  -- a scheduled date. It never presumes a membership; its predecessor link
  -- cannot be duplicated.
  SELECT * INTO renewed FROM meeting_reconvocation WHERE council_meeting = meeting.id ORDER BY sent_at DESC LIMIT 1;
  INSERT INTO council_meetings (
    id,
    number,
    previous_council_meeting,
    scheduled_at,
    location
  ) VALUES (
    next_meeting,
    meeting.number + 1,
    meeting.id,
    renewed.scheduled_at,
    CASE WHEN renewed.id IS NOT NULL THEN meeting.location END
  );

  INSERT INTO minutes (id, council_meeting)
  VALUES (produced_minutes, meeting.id);

  INSERT INTO minutes_approval (id, minutes)
  VALUES (produced_approval, produced_minutes);

  PERFORM schedule_minutes_approval(
    next_meeting,
    produced_approval
  );

  -- Every unfinished occurrence stays in the closed meeting as negative
  -- history. Only ordinary subjects are placed again below.
  UPDATE council_agenda_item
  SET position = -abs(position)
  WHERE council_meeting = meeting.id
    AND (minutes_approval IS NOT NULL OR started_at IS NOT NULL OR EXISTS (
      SELECT FROM hall.agenda_item_recusal WHERE agenda_item = council_agenda_item.id))
    AND completed_at IS NULL
    AND position > 0;

  -- Unstarted rows have no conduct history. Move the same occurrence and give
  -- it a positive position after the mandatory MinutesApproval.
  WITH ordered_unstarted AS (
    SELECT
      agenda_item.id,
      row_number() OVER (ORDER BY abs(agenda_item.position), agenda_item.id) + 1 AS next_position
    FROM council_agenda_item AS agenda_item
    WHERE agenda_item.council_meeting = meeting.id
      AND agenda_item.started_at IS NULL
      AND agenda_item.minutes_approval IS NULL
      AND agenda_item.position > 0
  )
  UPDATE council_agenda_item AS agenda_item
  SET council_meeting = next_meeting,
      position = ordered_unstarted.next_position
  FROM ordered_unstarted
  WHERE agenda_item.id = ordered_unstarted.id;

  -- A started deferral remains as history, so carrying it forward creates a
  -- new inactive occurrence of the same immutable subject and business.
  INSERT INTO council_agenda_item (
    id,
    council_business,
    council_meeting,
    position,
    minutes_approval,
    council_decision_proposal,
    open_question
  )
  SELECT
    gen_random_uuid(),
    deferred.council_business,
    next_meeting,
    existing.count + row_number() OVER (
      ORDER BY abs(deferred.position), deferred.id
    ),
    deferred.minutes_approval,
    deferred.council_decision_proposal,
    deferred.open_question
  FROM council_agenda_item AS deferred
  CROSS JOIN LATERAL (
    SELECT count(*)::INTEGER AS count
    FROM council_agenda_item AS next_item
    WHERE next_item.council_meeting = next_meeting
  ) AS existing
  WHERE deferred.council_meeting = meeting.id
    AND (deferred.started_at IS NOT NULL OR deferred.adjourned_at IS NOT NULL OR (
      EXISTS (SELECT FROM hall.agenda_item_recusal WHERE agenda_item = deferred.id)
      AND EXISTS (SELECT FROM hall.council_meeting_snapshot snapshot,
        jsonb_array_elements(snapshot.payload->'agenda') recorded
        WHERE snapshot.council_meeting = deferred.council_meeting AND snapshot.phase = 'closing'
          AND recorded->>'id' = deferred.id::text AND (recorded->>'position')::integer > 0)))
    AND deferred.completed_at IS NULL
    AND deferred.minutes_approval IS NULL
    AND deferred.position < 0;

  -- This final fact activates the deferred structural checks for the complete
  -- successor/minutes composition assembled above.
  UPDATE council_meetings
  SET closed_at = closure_time
  WHERE id = meeting.id;

  RETURN next_meeting;
END
$function$;

-- A meeting with a predecessor owns exactly one previous-PV occurrence at
-- absolute position one. It may be deprogrammed without losing its historical
-- identity; this does not prevent closure. Checks run at commit.
CREATE FUNCTION hall.enforce_required_previous_minutes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,hall AS $$
BEGIN
 IF EXISTS (
  SELECT FROM hall.council_meetings meeting
  JOIN hall.council_meetings previous ON previous.id=meeting.previous_council_meeting
  WHERE NOT previous.stale AND (
   (SELECT count(*) FROM hall.council_agenda_item item
    WHERE item.council_meeting=meeting.id AND item.minutes_approval IS NOT NULL) <> 1
   OR NOT EXISTS (
    SELECT FROM hall.council_agenda_item item
    JOIN hall.minutes_approval approval ON approval.id=item.minutes_approval
    JOIN hall.minutes previous_minutes ON previous_minutes.id=approval.minutes
    WHERE item.council_meeting=meeting.id AND abs(item.position)=1
      AND previous_minutes.council_meeting=meeting.previous_council_meeting
   )
  )
 ) THEN RAISE EXCEPTION USING ERRCODE='HV126', MESSAGE='a successor requires its previous minutes approval in first position'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER council_meetings_require_previous_minutes
AFTER INSERT OR UPDATE OR DELETE ON hall.council_meetings
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hall.enforce_required_previous_minutes();
CREATE CONSTRAINT TRIGGER council_agenda_require_previous_minutes
AFTER INSERT OR UPDATE OR DELETE ON hall.council_agenda_item
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hall.enforce_required_previous_minutes();
CREATE CONSTRAINT TRIGGER minutes_approval_require_previous_minutes
AFTER INSERT OR UPDATE OR DELETE ON hall.minutes_approval
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hall.enforce_required_previous_minutes();
