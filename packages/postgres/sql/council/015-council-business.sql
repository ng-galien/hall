-- Council business preparation model
-- ==================================
--
-- CouncilBusiness is the aggregate root that gives one documentary workspace
-- a durable business identity. Its possible agenda subjects remain independent
-- entities: one business may prepare many decision proposals and open questions.
-- Each prepared subject owns its business association before any agenda occurrence.

-- @functional-requirement HALL-FR-BUS-010 COUNCIL_BUSINESS_IS_THE_PREPARATION_ROOT:
CREATE TABLE council_business (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp()
);

-- Entity: the minutes produced by exactly one council meeting. Approval is a
-- distinct subject because minutes exist before the following council examines
-- them.
-- @functional-requirement HALL-FR-MIN-010 ONE_MINUTES_PER_COUNCIL_MEETING:
CREATE TABLE minutes (
  id UUID PRIMARY KEY,
  council_meeting UUID NOT NULL UNIQUE REFERENCES council_meetings (id),
  -- @functional-requirement HALL-FR-MIN-160 MINUTES_FACTS_ARE_CAPTURED_AT_CLOSURE:
  facts JSONB NOT NULL CHECK (jsonb_typeof(facts) = 'object'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp()
);

-- @functional-requirement HALL-FR-MIN-040 GENERATED_MINUTES_ARE_A_DISTINCT_IMMUTABLE_DOCUMENT:
-- A generated PDF is not a workspace resource. The shared binary object owns
-- its bytes; this row owns its identity and immutable relation to the draft.
CREATE TABLE minutes_document (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  minutes UUID NOT NULL UNIQUE REFERENCES minutes(id),
  binary_object UUID NOT NULL REFERENCES hall.binary_object(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp()
);

-- Entity: the approval of one previous meeting's minutes. The same approval
-- may be placed successively on several agendas when it is not examined.
-- @functional-requirement HALL-FR-MIN-020 ONE_APPROVAL_PER_MINUTES:
CREATE TABLE minutes_approval (
  id UUID PRIMARY KEY,
  minutes UUID NOT NULL UNIQUE REFERENCES minutes (id)
);

-- Entity: one proposal prepared for a decision by the council. Its documentary
-- content is attached through the workspace boundary, not duplicated here.
-- @functional-requirement HALL-FR-BUS-050 PREPARED_SUBJECT_OWNS_ITS_BUSINESS_BEFORE_SCHEDULING:
CREATE TABLE council_decision_proposal (
  id UUID PRIMARY KEY,
  council_business UUID NOT NULL REFERENCES council_business(id)
);

-- Entity: one open subject which can be considered without a ballot.
CREATE TABLE open_question (
  id UUID PRIMARY KEY,
  council_business UUID NOT NULL REFERENCES council_business(id)
);
