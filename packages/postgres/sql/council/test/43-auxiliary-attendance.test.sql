BEGIN;
SET LOCAL search_path=hall,public;
SET LOCAL hall.actor_id='auxiliary-clerk';
\ir support/helpers.sql
SELECT no_plan();

-- Other persons present, per the user decisions of 26 October 2026
-- (question 4 and point I) and CGCT L2121-15 paragraph 2 and L2121-18.
-- @verifies-requirement HALL-FR-ATT-140

UPDATE council_meetings SET stale=TRUE WHERE closed_at IS NULL AND NOT stale;
INSERT INTO council_meetings(id,number,scheduled_at,location)
VALUES(test_uuid('aux:meeting'),(SELECT coalesce(max(number),0)+1 FROM council_meetings),'2026-01-01 09:00Z','Chamber');
INSERT INTO meeting_attendance(id,council_member,council_meeting,status)
SELECT test_uuid('aux:att:'||k),test_uuid('aux:member:'||k),test_uuid('aux:meeting'),'present' FROM generate_series(1,3) k;
SELECT test_confirm_declared_membership(test_uuid('aux:meeting'));
SELECT set_council_meeting_officers(test_uuid('aux:meeting'),test_uuid('aux:member:1'),test_uuid('aux:member:2'));
SELECT test_create_decision_agenda_item('aux:1',test_uuid('aux:meeting'),1);
SELECT test_prepare_notice(test_uuid('aux:meeting'));
INSERT INTO contact(id,first_name,last_name) VALUES
 (test_uuid('aux:contact:secretary'),'Claire','Martin'),
 (test_uuid('aux:contact:expert'),'Paul','Durand'),
 (test_uuid('aux:contact:archived'),'Anne','Petit');
UPDATE contact SET archived_at='2025-12-31' WHERE id=test_uuid('aux:contact:archived');

SELECT lives_ok($$SELECT declare_meeting_auxiliary_attendance(test_uuid('aux:meeting'),test_uuid('aux:contact:secretary'),NULL,NULL,'secrétaire de mairie','2026-01-01 08:55Z')$$,
 'an existing contact is entered at roll call with a free-text quality');
SELECT start_council_meeting(test_uuid('aux:meeting'),'2026-01-01 09:00Z');
CREATE TEMP TABLE quorum_before AS SELECT calculate_meeting_quorum(test_uuid('aux:meeting'),NULL,clock_timestamp())-'attendance' facts;
SELECT lives_ok($$SELECT declare_meeting_auxiliary_attendance(test_uuid('aux:meeting'),test_uuid('aux:contact:expert'),NULL,NULL,NULL,'2026-01-01 09:10Z')$$,
 'a person is entered during the meeting without quality');
SELECT lives_ok($$SELECT declare_meeting_auxiliary_attendance(test_uuid('aux:meeting'),NULL,' Jeanne ','Libre','  ','2026-01-01 09:10:30Z')$$,
 'a free name creates the contact');
SELECT is((SELECT count(*)::int FROM contact WHERE first_name='Jeanne' AND last_name='Libre'),1,'the free name is now a contact');
SELECT is((SELECT jsonb_agg(entry-'id'-'recordedAt'-'contactId' ORDER BY entry->>'declaredAt') FROM jsonb_array_elements(hall_api.meeting_conduct(test_uuid('aux:meeting'))->'auxiliaryAttendances') entry),
 jsonb_build_array(
  jsonb_build_object('councilMeetingId',test_uuid('aux:meeting'),'name','Claire Martin',
   'quality','secrétaire de mairie','declaredAt','2026-01-01T08:55:00+00:00'::timestamptz,'recordedBy','fixture-clerk'),
  jsonb_build_object('councilMeetingId',test_uuid('aux:meeting'),'name','Paul Durand',
   'quality',NULL,'declaredAt','2026-01-01T09:10:00+00:00'::timestamptz,'recordedBy','fixture-clerk'),
  jsonb_build_object('councilMeetingId',test_uuid('aux:meeting'),'name','Jeanne Libre',
   'quality',NULL,'declaredAt','2026-01-01T09:10:30+00:00'::timestamptz,'recordedBy','fixture-clerk')),
 'the meeting shows each attending person with name, optional quality and entry time');
SELECT is(calculate_meeting_quorum(test_uuid('aux:meeting'),NULL,clock_timestamp())-'attendance',(SELECT facts FROM quorum_before),
 'attending persons do not change the quorum');
SELECT is(jsonb_array_length(current_attendance_json(test_uuid('aux:meeting'))),3,'attending persons are not member attendances');
SELECT is(jsonb_array_length(meeting_conduct_evidence(test_uuid('aux:meeting'))->'auxiliaryAttendances'),3,
 'attending persons are part of the conduct evidence carried to the minutes');

SELECT throws_ok($$SELECT declare_meeting_auxiliary_attendance(test_uuid('aux:meeting'),test_uuid('aux:member:3'),NULL,NULL,NULL,'2026-01-01 09:11Z')$$,
 'HV128',format('Test %s is a council member and attends as a member',test_uuid('aux:member:3')),
 'a council member cannot be entered as another attending person');
SELECT throws_ok($$SELECT declare_meeting_auxiliary_attendance(test_uuid('aux:meeting'),test_uuid('aux:contact:archived'),NULL,NULL,NULL,'2026-01-01 09:11Z')$$,
 'HV128',NULL,'an archived contact cannot be entered');
SELECT throws_ok($$SELECT declare_meeting_auxiliary_attendance(test_uuid('aux:meeting'),test_uuid('aux:contact:expert'),NULL,NULL,NULL,'2026-01-01 09:11Z')$$,
 '23505',NULL,'a person is entered once per meeting');
SELECT throws_ok($$SELECT declare_meeting_auxiliary_attendance(test_uuid('aux:meeting'),NULL,'Seul',NULL,NULL,'2026-01-01 09:11Z')$$,
 'HV128',NULL,'a new person requires a first and a last name');
SELECT lives_ok($$SELECT hall_api.update_meeting_auxiliary_attendance(test_uuid('aux:meeting'),(SELECT id FROM meeting_auxiliary_attendance WHERE contact=test_uuid('aux:contact:expert')),'expert en urbanisme')$$,
 'the quality is corrected before closure');
SELECT is((SELECT quality FROM meeting_auxiliary_attendance WHERE contact=test_uuid('aux:contact:expert')),'expert en urbanisme','the corrected quality is kept');
SELECT throws_ok($$UPDATE meeting_auxiliary_attendance SET contact=test_uuid('aux:contact:archived') WHERE contact=test_uuid('aux:contact:expert')$$,
 'HV128',NULL,'only the quality can be corrected');
SELECT lives_ok($$SELECT hall_api.remove_meeting_auxiliary_attendance(test_uuid('aux:meeting'),(SELECT a.id FROM meeting_auxiliary_attendance a JOIN contact c ON c.id=a.contact WHERE c.last_name='Libre'))$$,
 'an entry is removed before closure');
SELECT is(jsonb_array_length(hall_api.meeting_conduct(test_uuid('aux:meeting'))->'auxiliaryAttendances'),2,'the removed person is no longer listed');

-- Excluded from votes, proxies and recusals.
SELECT start_council_agenda_item(test_uuid('aux:1:agenda-item'),'2026-01-01 09:12Z');
SELECT throws_ok($$SELECT hall_api.create_ballot_result_preview(test_uuid('aux:1:agenda-item'),jsonb_build_object('procedure','ordinaryMajority','mode','public',
 'participantAttendanceIds',jsonb_build_array(test_uuid('aux:att:1'),(SELECT id FROM meeting_auxiliary_attendance WHERE contact=test_uuid('aux:contact:expert'))),
 'votes',jsonb_build_array(jsonb_build_object('meetingAttendanceId',test_uuid('aux:att:1'),'choice','approve'),
  jsonb_build_object('meetingAttendanceId',(SELECT id FROM meeting_auxiliary_attendance WHERE contact=test_uuid('aux:contact:expert')),'choice','approve')),
 'nonParticipations','[]'::jsonb))$$,'HV305',NULL,'an attending person cannot vote');
SELECT throws_ok($$SELECT record_meeting_attendance_events(test_uuid('aux:meeting'),clock_timestamp(),jsonb_build_array(jsonb_build_object(
 'councilMemberId',test_uuid('aux:member:3'),'status','represented','proxyHolderCouncilMemberId',test_uuid('aux:contact:expert'),'proxyDocumentId',NULL)))$$,
 'HV134',NULL,'an attending person cannot hold a proxy');
SELECT throws_ok($$INSERT INTO agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at)
 VALUES(test_uuid('aux:1:agenda-item'),test_uuid('aux:contact:expert'),'personalInterest',clock_timestamp())$$,
 'HV233',NULL,'an attending person cannot recuse');

-- @verifies-requirement HALL-FR-MTG-370
CREATE TEMP TABLE auxiliary_reception AS SELECT clock_timestamp() AS received_after;
SELECT lives_ok($$SELECT hall_api.declare_meeting_auxiliary_attendance(test_uuid('aux:meeting'),NULL,'Marc','Tardif',NULL)$$,
 'a person is entered without a client instant');
SELECT ok((SELECT a.declared_at BETWEEN (SELECT received_after FROM auxiliary_reception) AND clock_timestamp()
  FROM meeting_auxiliary_attendance a JOIN contact c ON c.id=a.contact WHERE c.last_name='Tardif'),
 'the server clock dates the entry at reception');

-- Immutable once the meeting is closed.
UPDATE council_meetings SET closed_at=clock_timestamp() WHERE id=test_uuid('aux:meeting');
SELECT throws_ok($$SELECT hall_api.update_meeting_auxiliary_attendance(test_uuid('aux:meeting'),(SELECT id FROM meeting_auxiliary_attendance WHERE contact=test_uuid('aux:contact:expert')),'invité')$$,
 'HV128',NULL,'a closed meeting keeps its attending persons as recorded');
SELECT throws_ok($$SELECT hall_api.remove_meeting_auxiliary_attendance(test_uuid('aux:meeting'),(SELECT id FROM meeting_auxiliary_attendance WHERE contact=test_uuid('aux:contact:expert')))$$,
 'HV128',NULL,'an entry of a closed meeting cannot be removed');
SELECT throws_ok($$SELECT declare_meeting_auxiliary_attendance(test_uuid('aux:meeting'),NULL,'Tard','Venu',NULL,clock_timestamp())$$,
 'HV128',NULL,'a closed meeting receives no new attending person');

SELECT * FROM finish();
ROLLBACK;
