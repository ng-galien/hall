-- Named council-agenda actions
-- ============================
--
-- These functions are the small application boundary of the agenda model.
-- They compose structural writes; triggers and constraints remain the final
-- authority for every invariant.

-- @functional-requirement HALL-FR-AGI-300 NAMED_PROGRAMMING_REQUIRES_POSITIVE_POSITION:
-- Negative positions are durable deprogramming facts. Only the dedicated
-- deprogram action may introduce one; schedule and reprogram always place an
-- item on the active agenda.
CREATE FUNCTION hall.assert_programmed_council_agenda_position(target_position INTEGER)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
BEGIN
  IF target_position IS NULL OR target_position <= 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV225',
      MESSAGE = 'agenda programming requires a positive position';
  END IF;
END;
$$;

-- @functional-requirement HALL-FR-AGI-200 DECISION_PROPOSAL_IS_SCHEDULED_ATOMICALLY:
CREATE FUNCTION hall.schedule_council_decision_proposal(
  target_business UUID,
  target_meeting UUID,
  target_position INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $$
DECLARE
  proposal_id UUID := gen_random_uuid();
  agenda_item_id UUID := gen_random_uuid();
BEGIN
  PERFORM assert_programmed_council_agenda_position(target_position);
  IF NOT EXISTS(SELECT FROM hall.council_business WHERE id=target_business) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV905', MESSAGE='unknown council business';
  END IF;

  -- One transaction creates both the durable subject and its agenda
  -- occurrence. A proposal cannot be exposed half-created by this action.
  INSERT INTO council_decision_proposal (id,council_business) VALUES (proposal_id,target_business);

  -- All insertion paths share the same shifting and nature-order authority.
  agenda_item_id := (hall_api.schedule_prepared_council_subject(
    target_meeting, proposal_id, 'councilDecisionProposal', target_position
  )->>'id')::UUID;

  RETURN agenda_item_id;
END;
$$;

-- @functional-requirement HALL-FR-AGI-210 OPEN_QUESTION_IS_SCHEDULED_ATOMICALLY:
CREATE FUNCTION hall.schedule_open_question(
  target_business UUID,
  target_meeting UUID,
  target_position INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $$
DECLARE
  question_id UUID := gen_random_uuid();
  agenda_item_id UUID := gen_random_uuid();
BEGIN
  PERFORM assert_programmed_council_agenda_position(target_position);
  IF NOT EXISTS(SELECT FROM hall.council_business WHERE id=target_business) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV905', MESSAGE='unknown council business';
  END IF;

  -- OpenQuestion is the subject. CouncilAgendaItem is only its ordered
  -- occurrence in a meeting; the two rows are created together.
  INSERT INTO open_question (id,council_business) VALUES (question_id,target_business);

  -- All insertion paths share the same shifting and nature-order authority.
  agenda_item_id := (hall_api.schedule_prepared_council_subject(
    target_meeting, question_id, 'openQuestion', target_position
  )->>'id')::UUID;

  RETURN agenda_item_id;
END;
$$;

-- @functional-requirement HALL-FR-AGI-220 MINUTES_APPROVAL_IS_SCHEDULED_ATOMICALLY:
CREATE FUNCTION hall.schedule_minutes_approval(
  target_meeting UUID,
  target_minutes_approval UUID
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $$
DECLARE
  agenda_item_id UUID := gen_random_uuid();
BEGIN
  -- Minutes approval always occupies absolute position one. Its sign remains
  -- available to retain a deprogrammed occurrence without losing history.
  INSERT INTO council_agenda_item (
    id,
    council_business,
    council_meeting,
    position,
    minutes_approval
  ) VALUES (
    agenda_item_id,
    NULL,
    target_meeting,
    1,
    target_minutes_approval
  );

  RETURN agenda_item_id;
END;
$$;

-- @functional-requirement HALL-FR-AGI-230 AGENDA_ITEM_CAN_BE_DEPROGRAMMED:
CREATE FUNCTION hall.deprogram_council_agenda_item(target_agenda_item UUID)
RETURNS council_agenda_item
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $$
DECLARE
  changed council_agenda_item;
BEGIN
  IF EXISTS (SELECT FROM council_agenda_item item JOIN council_meetings meeting ON meeting.id = item.council_meeting
    WHERE item.id = target_agenda_item AND meeting.started_at IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV230', MESSAGE = 'use adjournment after the meeting starts';
  END IF;
  -- The row and its absolute order remain; only the sign records that it is no
  -- longer programmed in the meeting.
  UPDATE council_agenda_item
  SET position = -abs(position)
  WHERE id = target_agenda_item
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV904',
      MESSAGE = format('unknown council agenda item %s', target_agenda_item);
  END IF;

  RETURN changed;
END;
$$;

-- @functional-requirement HALL-FR-AGI-240 UNSTARTED_AGENDA_ITEM_CAN_BE_REPROGRAMMED:
CREATE FUNCTION hall.reprogram_council_agenda_item(
  target_agenda_item UUID,
  target_meeting UUID,
  target_position INTEGER
)
RETURNS council_agenda_item
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $$
DECLARE
  changed council_agenda_item;
BEGIN
  PERFORM assert_programmed_council_agenda_position(target_position);

  -- Reprogramming is an update of the existing occurrence, not a new subject.
  -- The lifecycle trigger rejects a move after consideration has started.
  UPDATE council_agenda_item
  SET council_meeting = target_meeting,
      position = target_position
  WHERE id = target_agenda_item
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV904',
      MESSAGE = format('unknown council agenda item %s', target_agenda_item);
  END IF;

  RETURN changed;
END;
$$;

-- @functional-requirement HALL-FR-AGI-290 COUNCIL_AGENDA_REORDER_IS_EXACT:
-- The command names every currently programmed occurrence exactly once. It
-- changes only their relative order and therefore preserves intentional gaps
-- and every deprogrammed negative position.
-- @technical-requirement HALL-TR-CON-190 COUNCIL_AGENDA_REORDER_IS_ATOMIC:
CREATE FUNCTION hall.reorder_council_agenda(
  target_meeting UUID,
  ordered_agenda_items UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $$
DECLARE
  programmed_count INTEGER;
  existing_positions INTEGER[];
  temporary_offset INTEGER;
  minutes_item UUID;
BEGIN
  -- The meeting row serializes the complete reorder with attendance, start,
  -- closure and every other agenda write scoped to this meeting.
  PERFORM 1
  FROM council_meetings
  WHERE id = target_meeting
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV901',
      MESSAGE = format('unknown council meeting %s', target_meeting);
  END IF;

  SELECT
    count(*)::INTEGER,
    coalesce(array_agg(position ORDER BY position), ARRAY[]::INTEGER[]),
    coalesce(max(abs(position)), 0),
    (array_agg(id) FILTER (WHERE minutes_approval IS NOT NULL))[1]
  INTO programmed_count, existing_positions, temporary_offset, minutes_item
  FROM council_agenda_item
  WHERE council_meeting = target_meeting
    AND position > 0;

  IF ordered_agenda_items IS NULL
    OR cardinality(ordered_agenda_items) <> programmed_count
    OR (
      SELECT count(DISTINCT item_id)
      FROM unnest(ordered_agenda_items) AS requested(item_id)
    ) <> programmed_count
    OR EXISTS (
      SELECT
      FROM unnest(ordered_agenda_items) AS requested(item_id)
      LEFT JOIN council_agenda_item AS agenda_item
        ON agenda_item.id = requested.item_id
       AND agenda_item.council_meeting = target_meeting
       AND agenda_item.position > 0
      WHERE agenda_item.id IS NULL
    )
    OR (minutes_item IS NOT NULL AND ordered_agenda_items[1] IS DISTINCT FROM minutes_item)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV224',
      MESSAGE = 'a council agenda reorder must contain every programmed item exactly once with minutes first';
  END IF;

  IF programmed_count < 2 THEN
    RETURN;
  END IF;

  -- Move non-minutes rows above the complete occupied range before assigning
  -- their final existing positions. Minutes stays at position one throughout,
  -- so its structural CHECK is never temporarily violated.
  SELECT coalesce(max(abs(position)), 0) + programmed_count + 1
  INTO temporary_offset
  FROM council_agenda_item
  WHERE council_meeting = target_meeting;

  UPDATE council_agenda_item
  SET position = position + temporary_offset
  WHERE council_meeting = target_meeting
    AND position > 0
    AND minutes_approval IS NULL;

  UPDATE council_agenda_item AS agenda_item
  SET position = desired.position
  FROM unnest(ordered_agenda_items, existing_positions) AS desired(id, position)
  WHERE agenda_item.id = desired.id
    AND agenda_item.minutes_approval IS NULL;
END;
$$;

-- @functional-requirement HALL-FR-AGI-250 AGENDA_ITEM_START_IS_A_NAMED_ACTION:
CREATE FUNCTION hall.start_council_agenda_item(
  target_agenda_item UUID,
  start_time TIMESTAMPTZ
)
RETURNS council_agenda_item
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $$
DECLARE
  changed council_agenda_item;
BEGIN
  -- The lifecycle trigger proves that the meeting has started, the item is
  -- positively programmed and no other item is active.
  UPDATE council_agenda_item
  SET started_at = start_time
  WHERE id = target_agenda_item
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV904',
      MESSAGE = format('unknown council agenda item %s', target_agenda_item);
  END IF;

  RETURN changed;
END;
$$;

-- @functional-requirement HALL-FR-AGI-260 OPEN_QUESTION_COMPLETION_IS_A_NAMED_ACTION:
CREATE FUNCTION hall.complete_non_voting_agenda_item(
  target_agenda_item UUID,
  completion_time TIMESTAMPTZ
)
RETURNS council_agenda_item
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $$
DECLARE
  changed council_agenda_item;
BEGIN
  -- Open questions complete through this action. The completion
  -- authority rejects ballot-backed subjects without a completed Ballot.
  UPDATE council_agenda_item
  SET completed_at = completion_time
  WHERE id = target_agenda_item
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV904',
      MESSAGE = format('unknown council agenda item %s', target_agenda_item);
  END IF;

  RETURN changed;
END;
$$;

-- Explicit in-session adjournment, distinct from preparation deprogramming.
CREATE FUNCTION hall.adjourn_council_agenda_item(target_agenda_item UUID, adjournment_time TIMESTAMPTZ)
RETURNS council_agenda_item LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, hall AS $$
DECLARE changed council_agenda_item;
BEGIN
  IF adjournment_time IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV230', MESSAGE = 'an agenda adjournment requires a timestamp';
  END IF;
  UPDATE council_agenda_item SET position = -abs(position), adjourned_at = adjournment_time
  WHERE id = target_agenda_item RETURNING * INTO changed;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV904', MESSAGE = format('unknown council agenda item %s', target_agenda_item);
  END IF;
  RETURN changed;
END;
$$;
