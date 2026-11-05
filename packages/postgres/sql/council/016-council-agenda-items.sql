-- Council agenda mapping
-- ======================
--
-- One row places a prepared subject in one CouncilMeeting. Ordinary subjects
-- belong to CouncilBusiness; minutes approval references standalone Minutes.
-- The row owns ordering and
-- examination timestamps; there is no intermediate Question entity.
CREATE TABLE hall.council_agenda_item (
  id UUID PRIMARY KEY,
  council_business UUID REFERENCES council_business (id),
  council_meeting UUID NOT NULL REFERENCES council_meetings (id),
  position INTEGER NOT NULL,

  minutes_approval UUID REFERENCES minutes_approval (id),
  council_decision_proposal UUID REFERENCES council_decision_proposal (id),
  open_question UUID REFERENCES open_question (id),
  subject_kind council_agenda_subject_kind GENERATED ALWAYS AS (
    CASE
    WHEN (minutes_approval IS NOT NULL) THEN 'minutesApproval'::hall.council_agenda_subject_kind
    WHEN (council_decision_proposal IS NOT NULL) THEN 'councilDecisionProposal'::hall.council_agenda_subject_kind
    WHEN (open_question IS NOT NULL) THEN 'openQuestion'::hall.council_agenda_subject_kind
    ELSE NULL::hall.council_agenda_subject_kind
END
  ) STORED,
  discussion_summary TEXT NOT NULL DEFAULT ''::text,

  -- @implements-requirement HALL-FR-MIN-050
  CONSTRAINT "council_agenda_item_business_scope" CHECK ((minutes_approval IS NOT NULL) = (council_business IS NULL)),

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  adjourned_at TIMESTAMPTZ,
  CONSTRAINT "council_agenda_item_adjournment_shape" CHECK (adjourned_at IS NULL OR "position" < 0 AND completed_at IS NULL AND (started_at IS NULL OR adjourned_at >= started_at)),

  -- @implements-requirement HALL-FR-AGI-010
  CONSTRAINT "council_agenda_item_one_subject" CHECK (num_nonnulls(minutes_approval, council_decision_proposal, open_question) = 1),

  -- @implements-requirement HALL-FR-AGI-020
  -- Positive positions are programmed. Negative positions retain a
  -- deprogrammed association for automatic placement on the next agenda.
  CONSTRAINT "council_agenda_item_position_is_nonzero" CHECK ("position" <> 0),

  -- @implements-requirement HALL-FR-AGI-030
  CONSTRAINT "council_agenda_item_minutes_is_first" CHECK (minutes_approval IS NULL OR abs("position") = 1),

  -- @implements-requirement HALL-FR-AGI-040
  CONSTRAINT "council_agenda_item_completion_requires_start" CHECK (completed_at IS NULL OR started_at IS NOT NULL),

  -- @implements-requirement HALL-FR-AGI-050
  CONSTRAINT "council_agenda_item_time_is_monotonic" CHECK (completed_at IS NULL OR completed_at >= started_at)
);

-- @implements-requirement HALL-FR-AGI-060
-- Positive and negative forms of one ordinal cannot coexist. Gaps are valid;
-- ordering never requires global renumbering.
CREATE UNIQUE INDEX council_agenda_item_absolute_position_unique ON hall.council_agenda_item USING btree (council_meeting, abs("position"));

-- @implements-requirement HALL-FR-AGI-070
CREATE UNIQUE INDEX council_agenda_item_minutes_once_per_meeting ON hall.council_agenda_item USING btree (council_meeting, minutes_approval) WHERE (minutes_approval IS NOT NULL);

CREATE UNIQUE INDEX council_agenda_item_decision_once_per_meeting ON hall.council_agenda_item USING btree (council_meeting, council_decision_proposal) WHERE (council_decision_proposal IS NOT NULL);

CREATE UNIQUE INDEX council_agenda_item_open_question_once_per_meeting ON hall.council_agenda_item USING btree (council_meeting, open_question) WHERE (open_question IS NOT NULL);

-- @implements-requirement HALL-FR-AGI-080
CREATE UNIQUE INDEX council_agenda_item_one_active_per_meeting ON hall.council_agenda_item USING btree (council_meeting) WHERE (("position" > 0) AND (started_at IS NOT NULL) AND (completed_at IS NULL));

-- Supports the single-table CouncilBusiness membership assertion and locks
-- only the small agenda slice of the affected aggregate.
CREATE INDEX council_agenda_item_business_membership ON hall.council_agenda_item USING btree (council_business);

-- @implements-requirement HALL-TR-CON-130
-- Deferred owner validation locates every occurrence of one subject without
-- scanning unrelated agenda rows.
CREATE INDEX council_agenda_item_decision_business_membership ON hall.council_agenda_item USING btree (council_decision_proposal, council_business) WHERE (council_decision_proposal IS NOT NULL);

CREATE INDEX council_agenda_item_open_question_business_membership ON hall.council_agenda_item USING btree (open_question, council_business) WHERE (open_question IS NOT NULL);

-- An occurrence is treated once completed, or once programmed in a meeting
-- marked stale: such a meeting was held outside Hall.
-- @implements-requirement HALL-FR-AGI-280
-- @implements-requirement HALL-FR-WSP-280
CREATE FUNCTION hall.council_agenda_item_is_treated(item hall.council_agenda_item)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT item.completed_at IS NOT NULL
    OR (item.position > 0 AND EXISTS (
      SELECT
      FROM hall.council_meetings AS meeting
      WHERE meeting.id = item.council_meeting
        AND meeting.stale
    ))
$function$;
