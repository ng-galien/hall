CREATE OR REPLACE FUNCTION test_uuid(label TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT md5(label)::UUID;
$$;

CREATE OR REPLACE FUNCTION test_execute_deferred(statements TEXT[])
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  statement TEXT;
BEGIN
  FOREACH statement IN ARRAY statements LOOP
    EXECUTE statement;
  END LOOP;

  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
END;
$$;

CREATE OR REPLACE FUNCTION test_create_decision_agenda_item(
  fixture TEXT,
  meeting_id UUID,
  item_position INTEGER DEFAULT 1
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  business_id UUID := test_uuid(fixture || ':business');
  proposal_id UUID := test_uuid(fixture || ':proposal');
  agenda_item_id UUID := test_uuid(fixture || ':agenda-item');
BEGIN
  INSERT INTO council_business (id) VALUES (business_id);
  INSERT INTO council_decision_proposal (id) VALUES (proposal_id);
  INSERT INTO council_agenda_item (
    id,
    council_business,
    council_meeting,
    position,
    council_decision_proposal
  ) VALUES (
    agenda_item_id,
    business_id,
    meeting_id,
    item_position,
    proposal_id
  );
  RETURN agenda_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION test_prepare_open_ballot(
  fixture TEXT,
  ballot_mode ballot_mode,
  participant_count INTEGER DEFAULT 2
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  participant_number INTEGER;
BEGIN
  INSERT INTO council_meetings (id, quorum)
  VALUES (test_uuid(fixture || ':meeting'), 1);

  FOR participant_number IN 1..participant_count LOOP
    INSERT INTO meeting_attendance (
      id,
      council_member,
      council_meeting,
      status
    ) VALUES (
      test_uuid(fixture || ':attendance:' || participant_number),
      test_uuid(fixture || ':member:' || participant_number),
      test_uuid(fixture || ':meeting'),
      'present'
    );
  END LOOP;

  UPDATE council_meetings
  SET started_at = '2026-01-01 09:00:00+00'
  WHERE id = test_uuid(fixture || ':meeting');

  PERFORM test_create_decision_agenda_item(
    fixture,
    test_uuid(fixture || ':meeting'),
    1
  );

  UPDATE council_agenda_item
  SET started_at = '2026-01-01 09:05:00+00'
  WHERE id = test_uuid(fixture || ':agenda-item');

  INSERT INTO ballots (id, council_agenda_item, mode, chairman)
  VALUES (
    test_uuid(fixture || ':ballot'),
    test_uuid(fixture || ':agenda-item'),
    ballot_mode,
    test_uuid(fixture || ':participation:1')
  );

  FOR participant_number IN 1..participant_count LOOP
    INSERT INTO ballot_participation (id, ballot, meeting_attendance)
    VALUES (
      test_uuid(fixture || ':participation:' || participant_number),
      test_uuid(fixture || ':ballot'),
      test_uuid(fixture || ':attendance:' || participant_number)
    );
  END LOOP;

  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
END;
$$;
