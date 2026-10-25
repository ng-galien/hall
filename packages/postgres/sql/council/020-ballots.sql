-- Entity: one ballot held for one ballot-eligible CouncilAgendaItem. The
-- chairman is the identifier of
-- a BallotParticipation, not a council member or attendance declaration. Its
-- deferred foreign key is added after ballot_participation exists.
CREATE TABLE hall.ballots (
  id UUID PRIMARY KEY,
  council_agenda_item UUID NOT NULL REFERENCES council_agenda_item (id),
  mode ballot_mode NOT NULL,
  chairman UUID NOT NULL,
  completed_at TIMESTAMPTZ,
  result ballot_result,

  -- @implements-requirement HALL-FR-BAL-030
  -- produce at most one ballot. Its meeting is already carried by the agenda
  -- mapping and is never repeated here.
  UNIQUE (council_agenda_item),

  -- @implements-requirement HALL-FR-BAL-040
  -- has neither completion fact nor result; a
  -- completed ballot has both.
  CONSTRAINT "ballots_check" CHECK ((completed_at IS NULL) = (result IS NULL))
);
