BEGIN;
SET LOCAL search_path=hall,public;
SET LOCAL hall.actor_id='closed-session-clerk';
\ir support/helpers.sql
SELECT no_plan();

-- Closed session (huis clos), CGCT L2121-18; user decision of 26 October
-- 2026, point H.
-- @verifies-requirement HALL-FR-MTG-350

-- Ten members: member 1 mayor and chair, member 4 secretary, member 6
-- represented by member 5, member 10 absent; three agenda items.
CREATE FUNCTION pg_temp.closed_meeting(v_label TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE k INTEGER; v_meeting UUID:=test_uuid(v_label||':meeting');
BEGIN
 UPDATE council_meetings SET stale=TRUE WHERE closed_at IS NULL AND NOT stale;
 INSERT INTO council_meetings(id,number,scheduled_at,location)
 VALUES(v_meeting,(SELECT coalesce(max(number),0)+1 FROM council_meetings),'2026-01-01 09:00Z','Chamber');
 FOR k IN 1..10 LOOP
  INSERT INTO meeting_attendance(id,council_member,council_meeting,status,proxy_holder,proxy_document)
  VALUES(test_uuid(v_label||':att:'||k),test_uuid(v_label||':member:'||k),v_meeting,
   CASE WHEN k=6 THEN 'represented' WHEN k=10 THEN 'absent' ELSE 'present' END::meeting_attendance_status,
   CASE WHEN k=6 THEN test_uuid(v_label||':att:5') END,CASE WHEN k=6 THEN test_uuid(v_label||':proxy:6') END);
 END LOOP;
 UPDATE council_member SET role='mayor' WHERE id=test_uuid(v_label||':member:1');
 PERFORM test_confirm_declared_membership(v_meeting);
 PERFORM set_council_meeting_officers(v_meeting,test_uuid(v_label||':member:1'),test_uuid(v_label||':member:4'));
 FOR k IN 1..3 LOOP
  PERFORM test_create_decision_agenda_item(v_label||':'||k,v_meeting,k);
 END LOOP;
 PERFORM test_prepare_notice(v_meeting);
 PERFORM start_council_meeting(v_meeting,'2026-01-01 09:00Z');
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
END $$;
CREATE FUNCTION pg_temp.member(v_label TEXT,v_number INTEGER)
RETURNS UUID LANGUAGE sql IMMUTABLE AS $$ SELECT test_uuid(v_label||':member:'||v_number); $$;
CREATE FUNCTION pg_temp.item(v_label TEXT,v_number INTEGER)
RETURNS UUID LANGUAGE sql IMMUTABLE AS $$ SELECT test_uuid(v_label||':'||v_number||':agenda-item'); $$;

SELECT pg_temp.closed_meeting('huis');
SELECT throws_ok($$SELECT record_meeting_closed_session(test_uuid('huis:meeting'),
 ARRAY[pg_temp.member('huis',2),pg_temp.member('huis',3)],9,true,NULL,'2026-01-01 09:01Z')$$,
 'HV152',NULL,'two members cannot request a closed session');
SELECT throws_ok($$SELECT record_meeting_closed_session(test_uuid('huis:meeting'),
 ARRAY[pg_temp.member('huis',2)],9,true,NULL,'2026-01-01 09:01Z')$$,
 'HV152',NULL,'a single member other than the mayor cannot request a closed session');
SELECT throws_ok($$SELECT record_meeting_closed_session(test_uuid('huis:meeting'),
 ARRAY[pg_temp.member('huis',2),pg_temp.member('huis',3),pg_temp.member('huis',6)],9,true,NULL,'2026-01-01 09:01Z')$$,
 'HV152',NULL,'a represented member cannot take part in the request');
SELECT throws_ok($$SELECT record_meeting_closed_session(test_uuid('huis:meeting'),
 ARRAY[pg_temp.member('huis',1)],4,true,NULL,'2026-01-01 09:01Z')$$,
 'HV152','a closed session requires the absolute majority of the 9 members present or represented',
 'four votes of nine present or represented members are not an absolute majority');
SELECT throws_ok($$SELECT record_meeting_closed_session(test_uuid('huis:meeting'),
 ARRAY[pg_temp.member('huis',2),pg_temp.member('huis',3),pg_temp.member('huis',4)],5,false,ARRAY[]::uuid[],'2026-01-01 09:01Z')$$,
 'HV152',NULL,'a partial closed session designates at least one agenda item');
SELECT lives_ok($$SELECT record_meeting_closed_session(test_uuid('huis:meeting'),
 ARRAY[pg_temp.member('huis',2),pg_temp.member('huis',3),pg_temp.member('huis',4)],5,false,ARRAY[pg_temp.item('huis',2)],'2026-01-01 09:01Z')$$,
 'three members obtain a closed session for one item with five votes of nine');
SELECT is((meeting_conduct_evidence(test_uuid('huis:meeting'))->'closedSessions'->0)-'id'-'recordedAt'-'councilMeetingId',
 jsonb_build_object('requesters',jsonb_build_array(
   jsonb_build_object('councilMemberId',pg_temp.member('huis',2),'name','Test '||pg_temp.member('huis',2)),
   jsonb_build_object('councilMemberId',pg_temp.member('huis',3),'name','Test '||pg_temp.member('huis',3)),
   jsonb_build_object('councilMemberId',pg_temp.member('huis',4),'name','Test '||pg_temp.member('huis',4))),
  'approvals',5,'presentOrRepresented',9,'wholeMeeting',false,'agendaItemIds',jsonb_build_array(pg_temp.item('huis',2)),
  'observedAt','2026-01-01T09:01:00+00:00'::timestamptz,'recordedBy','fixture-clerk'),
 'the closed session keeps its request, vote and items in the conduct evidence');
-- @verifies-requirement HALL-FR-MTG-370
CREATE TEMP TABLE closed_session_reception AS SELECT clock_timestamp() AS received_after;
SELECT lives_ok($$SELECT hall_api.record_meeting_closed_session(test_uuid('huis:meeting'),
 ARRAY[pg_temp.member('huis',1)],9,true,NULL)$$,
 'the mayor obtains a closed session for the whole meeting');
SELECT ok((SELECT max(observed_at) BETWEEN (SELECT received_after FROM closed_session_reception) AND clock_timestamp()
  FROM meeting_closed_session WHERE council_meeting=test_uuid('huis:meeting')),
 'the server clock dates the closed session at reception');
SELECT is(meeting_conduct_evidence(test_uuid('huis:meeting'))#>'{closedSessions,1,agendaItemIds}',
 jsonb_build_array(pg_temp.item('huis',1),pg_temp.item('huis',2),pg_temp.item('huis',3)),
 'the whole meeting covers every agenda item not yet completed');
SELECT ok((hall_api.meeting_conduct(test_uuid('huis:meeting'))->>'canRecordClosedSession')::boolean,
 'the conduct screen may record a closed session during the meeting');
SELECT throws_ok($$UPDATE meeting_closed_session SET approvals=9$$,'HV152',NULL,'a closed session decision is immutable');
SELECT throws_ok($$DELETE FROM meeting_closed_session$$,'HV152',NULL,'a closed session decision cannot be deleted');

SELECT * FROM finish();
ROLLBACK;
