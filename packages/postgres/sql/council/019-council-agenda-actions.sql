-- Named council-agenda actions
-- ============================
--
-- These functions are the small application boundary of the agenda model.
-- They compose structural writes; triggers and constraints remain the final
-- authority for every invariant.

-- @functional-requirement HALL-FR-AGI-200 DECISION_PROPOSAL_IS_SCHEDULED_ATOMICALLY:
CREATE FUNCTION schedule_council_decision_proposal(
  target_business UUID,
  target_meeting UUID,
  target_position INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  proposal_id UUID := gen_random_uuid();
  agenda_item_id UUID := gen_random_uuid();
BEGIN
  -- One transaction creates both the durable subject and its agenda
  -- occurrence. A proposal cannot be exposed half-created by this action.
  INSERT INTO council_decision_proposal (id) VALUES (proposal_id);

  INSERT INTO council_agenda_item (
    id,
    council_business,
    council_meeting,
    position,
    council_decision_proposal
  ) VALUES (
    agenda_item_id,
    target_business,
    target_meeting,
    target_position,
    proposal_id
  );

  RETURN agenda_item_id;
END;
$$;

-- @functional-requirement HALL-FR-AGI-210 OPEN_QUESTION_IS_SCHEDULED_ATOMICALLY:
CREATE FUNCTION schedule_open_question(
  target_business UUID,
  target_meeting UUID,
  target_position INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  question_id UUID := gen_random_uuid();
  agenda_item_id UUID := gen_random_uuid();
BEGIN
  -- OpenQuestion is the subject. CouncilAgendaItem is only its ordered
  -- occurrence in a meeting; the two rows are created together.
  INSERT INTO open_question (id) VALUES (question_id);

  INSERT INTO council_agenda_item (
    id,
    council_business,
    council_meeting,
    position,
    open_question
  ) VALUES (
    agenda_item_id,
    target_business,
    target_meeting,
    target_position,
    question_id
  );

  RETURN agenda_item_id;
END;
$$;

-- @functional-requirement HALL-FR-AGI-220 MINUTES_APPROVAL_IS_SCHEDULED_ATOMICALLY:
CREATE FUNCTION schedule_minutes_approval(
  target_business UUID,
  target_meeting UUID,
  target_minutes_approval UUID
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
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
    target_business,
    target_meeting,
    1,
    target_minutes_approval
  );

  RETURN agenda_item_id;
END;
$$;

-- @functional-requirement HALL-FR-AGI-230 AGENDA_ITEM_CAN_BE_DEPROGRAMMED:
CREATE FUNCTION deprogram_council_agenda_item(target_agenda_item UUID)
RETURNS council_agenda_item
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  changed council_agenda_item;
BEGIN
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
CREATE FUNCTION reprogram_council_agenda_item(
  target_agenda_item UUID,
  target_meeting UUID,
  target_position INTEGER
)
RETURNS council_agenda_item
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  changed council_agenda_item;
BEGIN
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

-- @functional-requirement HALL-FR-AGI-250 AGENDA_ITEM_START_IS_A_NAMED_ACTION:
CREATE FUNCTION start_council_agenda_item(
  target_agenda_item UUID,
  start_time TIMESTAMPTZ
)
RETURNS council_agenda_item
LANGUAGE plpgsql
VOLATILE
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
CREATE FUNCTION complete_open_question(
  target_agenda_item UUID,
  completion_time TIMESTAMPTZ
)
RETURNS council_agenda_item
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  changed council_agenda_item;
BEGIN
  -- Only OpenQuestion can complete through this action. The completion
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
