BEGIN;
SET LOCAL search_path=hall,public;
SET LOCAL hall.actor_id='proxy-limit-clerk';
\ir support/helpers.sql
SELECT no_plan();

-- A written proxy is valid for three consecutive meetings at most, except
-- for duly established illness or maternity leave (CGCT L2121-20; user
-- decision of 26 October 2026, point H).
-- @verifies-requirement HALL-FR-ATT-160

-- Four meetings in sequence; member 2 is represented by member 1 with the same
-- written proxy in each of the first three.
CREATE FUNCTION pg_temp.sequence_meeting(v_number INTEGER)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_meeting UUID:=test_uuid('limit:meeting:'||v_number);
BEGIN
 UPDATE council_meetings SET stale=TRUE WHERE closed_at IS NULL AND NOT stale;
 INSERT INTO council_meetings(id,number,scheduled_at,location,previous_council_meeting)
 VALUES(v_meeting,(SELECT coalesce(max(number),0)+1 FROM council_meetings),'2026-01-01 09:00Z','Chamber',
  CASE WHEN v_number>1 THEN test_uuid('limit:meeting:'||(v_number-1)) END);
 INSERT INTO meeting_attendance(id,council_member,council_meeting,status)
 VALUES(test_uuid('limit:att:1:'||v_number),test_uuid('limit:member:1'),v_meeting,'present');
 RETURN v_meeting;
END $$;
CREATE FUNCTION pg_temp.represent(v_number INTEGER,v_document TEXT)
RETURNS VOID LANGUAGE sql AS $$
 INSERT INTO meeting_attendance(id,council_member,council_meeting,status,proxy_holder,proxy_document)
 VALUES(test_uuid('limit:att:2:'||v_number),test_uuid('limit:member:2'),test_uuid('limit:meeting:'||v_number),'represented',
  test_uuid('limit:att:1:'||v_number),test_uuid(v_document));
$$;

SELECT pg_temp.sequence_meeting(k) FROM generate_series(1,3) k;
SELECT pg_temp.represent(k,'limit:proxy') FROM generate_series(1,3) k;
SELECT is(proxy_document_consecutive_meetings(test_uuid('limit:meeting:3'),test_uuid('limit:proxy')),2,
 'the third meeting follows two meetings with the same written proxy');
SELECT pg_temp.sequence_meeting(4);
SELECT is(proxy_document_consecutive_meetings(test_uuid('limit:meeting:4'),test_uuid('limit:proxy')),3,
 'the fourth meeting follows three consecutive meetings with the same written proxy');
SELECT throws_ok($$SELECT pg_temp.represent(4,'limit:proxy')$$,'HV151',NULL,
 'the same written proxy is refused at the fourth consecutive meeting');
SELECT lives_ok($$SELECT pg_temp.represent(4,'limit:proxy:new')$$,'a new written proxy starts a new count');
DELETE FROM meeting_attendance WHERE id=test_uuid('limit:att:2:4');
INSERT INTO meeting_proxy_exception(council_meeting,proxy_document,basis,declared_at)
VALUES(test_uuid('limit:meeting:4'),test_uuid('limit:proxy'),'illness','2026-01-01 08:00Z');
SELECT lives_ok($$SELECT pg_temp.represent(4,'limit:proxy')$$,
 'a declared illness exception admits the same written proxy at the fourth meeting');
SELECT is(meeting_conduct_evidence(test_uuid('limit:meeting:4'))#>>'{proxyExceptions,0,basis}','illness',
 'the exception is part of the conduct evidence');
SELECT throws_ok($$UPDATE meeting_proxy_exception SET basis='maternityLeave'$$,'HV151',NULL,'a declared exception is not rewritten');

-- A meeting without the proxy breaks the sequence.
SELECT pg_temp.sequence_meeting(5);
SELECT pg_temp.sequence_meeting(6);
SELECT is(proxy_document_consecutive_meetings(test_uuid('limit:meeting:6'),test_uuid('limit:proxy')),0,
 'a meeting where the written proxy did not serve interrupts the consecutive meetings');

SELECT * FROM finish();
ROLLBACK;
