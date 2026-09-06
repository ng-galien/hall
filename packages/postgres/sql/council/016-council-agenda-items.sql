-- Council agenda mapping
-- ======================
--
-- One row places a prepared subject in one CouncilMeeting. Ordinary subjects
-- belong to CouncilBusiness; minutes approval references standalone Minutes.
-- The row owns ordering and
-- examination timestamps; there is no intermediate Question entity.
CREATE TABLE council_agenda_item (
  id UUID PRIMARY KEY,
  council_business UUID REFERENCES council_business (id),
  council_meeting UUID NOT NULL REFERENCES council_meetings (id),
  position INTEGER NOT NULL,

  minutes_approval UUID REFERENCES minutes_approval (id),
  council_decision_proposal UUID REFERENCES council_decision_proposal (id),
  open_question UUID REFERENCES open_question (id),
  discussion_summary TEXT NOT NULL DEFAULT '',

  -- @functional-requirement HALL-FR-MIN-050 MINUTES_APPROVAL_IS_OUTSIDE_THE_WORKSPACE:
  CONSTRAINT council_agenda_item_business_scope CHECK (
    (minutes_approval IS NOT NULL) = (council_business IS NULL)
  ),

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  adjourned_at TIMESTAMPTZ,
  CONSTRAINT council_agenda_item_adjournment_shape CHECK (
    adjourned_at IS NULL OR (position < 0 AND completed_at IS NULL
      AND (started_at IS NULL OR adjourned_at >= started_at))
  ),

  -- @functional-requirement HALL-FR-AGI-010 AGENDA_ITEM_HAS_EXACTLY_ONE_SUBJECT:
  CONSTRAINT council_agenda_item_one_subject CHECK (
    num_nonnulls(minutes_approval, council_decision_proposal, open_question) = 1
  ),

  -- @functional-requirement HALL-FR-AGI-020 AGENDA_POSITION_SIGN_ENCODES_PROGRAMMING:
  -- Positive positions are programmed. Negative positions retain a
  -- deprogrammed association for automatic placement on the next agenda.
  CONSTRAINT council_agenda_item_position_is_nonzero CHECK (position <> 0),

  -- @functional-requirement HALL-FR-AGI-030 MINUTES_APPROVAL_IS_FIRST:
  CONSTRAINT council_agenda_item_minutes_is_first CHECK (
    minutes_approval IS NULL OR abs(position) = 1
  ),

  -- @functional-requirement HALL-FR-AGI-040 COMPLETION_REQUIRES_START:
  CONSTRAINT council_agenda_item_completion_requires_start CHECK (
    completed_at IS NULL OR started_at IS NOT NULL
  ),

  -- @functional-requirement HALL-FR-AGI-050 AGENDA_ITEM_TIME_IS_MONOTONIC:
  CONSTRAINT council_agenda_item_time_is_monotonic CHECK (
    completed_at IS NULL OR completed_at >= started_at
  )
);

-- @functional-requirement HALL-FR-AGI-060 ABSOLUTE_POSITION_IS_UNIQUE_PER_MEETING:
-- Positive and negative forms of one ordinal cannot coexist. Gaps are valid;
-- ordering never requires global renumbering.
CREATE UNIQUE INDEX council_agenda_item_absolute_position_unique
  ON council_agenda_item (council_meeting, abs(position));

-- @functional-requirement HALL-FR-AGI-070 ONE_SUBJECT_OCCURRENCE_PER_MEETING:
CREATE UNIQUE INDEX council_agenda_item_minutes_once_per_meeting
  ON council_agenda_item (council_meeting, minutes_approval)
  WHERE minutes_approval IS NOT NULL;

CREATE UNIQUE INDEX council_agenda_item_decision_once_per_meeting
  ON council_agenda_item (council_meeting, council_decision_proposal)
  WHERE council_decision_proposal IS NOT NULL;

CREATE UNIQUE INDEX council_agenda_item_open_question_once_per_meeting
  ON council_agenda_item (council_meeting, open_question)
  WHERE open_question IS NOT NULL;

-- @functional-requirement HALL-FR-AGI-080 ONE_ACTIVE_AGENDA_ITEM_PER_MEETING:
CREATE UNIQUE INDEX council_agenda_item_one_active_per_meeting
  ON council_agenda_item (council_meeting)
  WHERE position > 0 AND started_at IS NOT NULL AND completed_at IS NULL;

-- Supports the single-table CouncilBusiness membership assertion and locks
-- only the small agenda slice of the affected aggregate.
CREATE INDEX council_agenda_item_business_membership
  ON council_agenda_item (council_business);

-- @technical-requirement HALL-TR-CON-130 AGENDA_SUBJECT_OWNER_LOOKUPS_ARE_INDEXED:
-- Deferred owner validation locates every occurrence of one subject without
-- scanning unrelated agenda rows.
CREATE INDEX council_agenda_item_decision_business_membership
  ON council_agenda_item (council_decision_proposal, council_business)
  WHERE council_decision_proposal IS NOT NULL;

CREATE INDEX council_agenda_item_open_question_business_membership
  ON council_agenda_item (open_question, council_business)
  WHERE open_question IS NOT NULL;
