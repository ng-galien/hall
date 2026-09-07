SET LOCAL hall.actor_id='fixture-clerk';
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

CREATE OR REPLACE FUNCTION test_ensure_council_member(member_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  active_term_id UUID;
BEGIN
  SELECT id INTO active_term_id
  FROM hall.council_term
  WHERE ended_on IS NULL;

  IF active_term_id IS NULL THEN
    active_term_id := test_uuid('term:active');
    INSERT INTO hall.council_term (id, expected_member_count, started_on)
    VALUES (active_term_id, 100000, '2020-01-01');
  END IF;

  INSERT INTO hall.contact (id, first_name, last_name)
  VALUES (member_id, 'Test', member_id::TEXT)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO hall.council_member (
    id, contact, council_term, role, term_started_on
  ) VALUES (
    member_id, member_id, active_term_id, 'councillor', '2020-01-01'
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION test_ensure_document_resource(document_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  binary_id UUID := md5('binary:' || document_id::TEXT)::UUID;
  payload BYTEA := convert_to(document_id::TEXT, 'UTF8');
BEGIN
  INSERT INTO hall.binary_object (
    id, content_sha256, media_type, byte_size, content
  ) VALUES (
    binary_id,
    encode(sha256(payload), 'hex'),
    'application/pdf',
    octet_length(payload),
    payload
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO hall.document_resource (id, binary_object_id)
  VALUES (document_id, binary_id)
  ON CONFLICT (id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION test_provision_attendance_references()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM test_ensure_council_member(NEW.council_member);
  IF NEW.proxy_document IS NOT NULL THEN
    PERFORM test_ensure_document_resource(NEW.proxy_document);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER test_meeting_attendance_provision_references
BEFORE INSERT ON hall.meeting_attendance
FOR EACH ROW
EXECUTE FUNCTION test_provision_attendance_references();

-- Complete documentary ownership is part of a valid business fixture.
CREATE OR REPLACE FUNCTION test_ensure_business(business_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE folder_id UUID := test_uuid('folder:' || business_id::text);
 report_id UUID := test_uuid('report:' || business_id::text);
 folder_name TEXT := 'Business ' || business_id::text;
BEGIN
 IF EXISTS(SELECT FROM council_business_workspace WHERE council_business=business_id) THEN RETURN; END IF;
 INSERT INTO council_business(id) VALUES(business_id) ON CONFLICT DO NOTHING;
 INSERT INTO folder_resource(id) VALUES(folder_id);
 INSERT INTO resource(id,path,name,slug,folder_resource_id)
 VALUES(folder_id,'',folder_name,claim_resource_slug(folder_name),folder_id);
 INSERT INTO text_resource(id,content) VALUES(report_id,'Fixture report');
 INSERT INTO resource(id,path,name,slug,text_resource_id)
 VALUES(report_id,folder_name,'Report',claim_resource_slug('Report'),report_id);
 INSERT INTO council_business_workspace(council_business,folder_resource,report_resource)
 VALUES(business_id,folder_id,report_id);
END $$;

-- Explicit preparation before start, with the real freeze and notice APIs.
-- The PDF payload is a storage fixture, not a PDF rendering assertion.
CREATE OR REPLACE FUNCTION test_prepare_notice(meeting_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM council_agenda_item WHERE council_meeting=meeting_id AND position>0) THEN
  PERFORM test_ensure_business(test_uuid('notice-business:'||meeting_id::text));
  PERFORM schedule_open_question(test_uuid('notice-business:'||meeting_id::text),meeting_id,1);
 END IF;
 IF NOT EXISTS(SELECT FROM active_council_agenda_freeze WHERE council_meeting=meeting_id) THEN
  PERFORM hall_api.freeze_council_agenda(meeting_id);
 END IF;
 PERFORM hall_api.generate_meeting_notice(meeting_id,jsonb_build_object(
  'meeting',meeting_notice_meeting_facts(meeting_id),
  'hall',jsonb_build_object('name','Fixture commune','timeZone','Europe/Paris')),
  convert_to('%PDF-fixture-notice','UTF8'));
END $$;

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
  PERFORM test_ensure_business(business_id);
  INSERT INTO council_decision_proposal (id,council_business) VALUES (proposal_id,business_id);
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

-- Test fixtures explicitly attest their declared roster. These helpers do not
-- infer effective mandates in production or bypass the SQL quorum guards.
CREATE OR REPLACE FUNCTION test_confirm_declared_membership(target_meeting UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM meeting_membership_record WHERE council_meeting=target_meeting) THEN
 INSERT INTO meeting_membership_record(council_meeting,observed_at,source_reference,member_ids)
 SELECT target_meeting,coalesce(scheduled_at,'2026-01-01 08:00Z'::timestamptz),'Explicit test roster',
 ARRAY(SELECT council_member FROM meeting_attendance WHERE council_meeting=target_meeting ORDER BY council_member)
 FROM council_meetings WHERE id=target_meeting;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION test_review_ballot(target_ballot UUID)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE preview JSONB;
BEGIN
 preview:=hall_api.create_ballot_result_preview((SELECT council_agenda_item FROM ballots WHERE id=target_ballot),hall.ballot_candidate_from_rows(target_ballot));
 RETURN (preview->>'id')::uuid;
END $$;
CREATE OR REPLACE FUNCTION test_confirm_ballot(target_ballot UUID,completion_time TIMESTAMPTZ)
RETURNS ballots LANGUAGE sql AS $$
 SELECT complete_ballot(target_ballot,completion_time,test_review_ballot(target_ballot));
$$;

-- Explicit fixture preparation; production start checks remain active.
CREATE OR REPLACE FUNCTION test_designate_present_officers(target_meeting UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE member_id UUID;
BEGIN
  SELECT council_member INTO STRICT member_id FROM meeting_attendance
  WHERE council_meeting=target_meeting AND status='present' ORDER BY id LIMIT 1;
  PERFORM set_council_meeting_officers(target_meeting, member_id, member_id);
  PERFORM test_confirm_declared_membership(target_meeting);
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
  INSERT INTO council_meetings (number,id, scheduled_at, location) VALUES
(
    (SELECT coalesce(max(number),0)+1 FROM council_meetings),
    test_uuid(fixture || ':meeting'),
    '2026-01-01 08:30:00+00',
    'Council chamber'
  );

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

  PERFORM test_designate_present_officers(test_uuid(fixture || ':meeting'));
  PERFORM test_create_decision_agenda_item(
    fixture,
    test_uuid(fixture || ':meeting'),
    1
  );

  PERFORM test_prepare_notice(test_uuid(fixture || ':meeting'));
  PERFORM start_council_meeting(test_uuid(fixture || ':meeting'),'2026-01-01 09:00:00+00');

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
