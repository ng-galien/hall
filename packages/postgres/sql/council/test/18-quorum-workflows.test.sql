BEGIN;
SET LOCAL search_path=hall,public;
SET LOCAL hall.actor_id='quorum-clerk';
\ir support/helpers.sql
SELECT no_plan();
\ir support/quorum.sql
SELECT pg_temp.quorum_case('ordinary',15,8);
-- @verifies-requirement HALL-FR-MTG-270
-- explicit membership, never the theoretical seat count.
SELECT is(calculate_meeting_quorum(test_uuid('ordinary:meeting'),NULL,'2026-01-01 09:00Z')->>'memberCount','15','N is the confirmed nominal roster');
SELECT is(calculate_meeting_quorum(test_uuid('ordinary:meeting'),NULL,'2026-01-01 09:00Z')->>'requiredPresent','8','N15 requires8 present');
SELECT test_prepare_notice(test_uuid('ordinary:meeting'));
SELECT lives_ok($$SELECT start_council_meeting(test_uuid('ordinary:meeting'),'2026-01-01 09:00Z')$$,'opening records current quorum');
-- @verifies-requirement HALL-FR-AGI-350
-- @verifies-requirement HALL-FR-AGI-360
-- direct row transition cannot bypass observation.
SELECT lives_ok($$UPDATE council_agenda_item SET started_at='2026-01-01 09:01Z' WHERE id=test_uuid('ordinary:a:agenda-item')$$,'first affair records an authoritative observation');
CREATE TEMP TABLE retained AS SELECT facts FROM meeting_quorum_observation WHERE agenda_item=test_uuid('ordinary:a:agenda-item');
-- @verifies-requirement HALL-FR-ATT-120
-- a departure preserves opening attendance and the first affair.
INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status)
VALUES(test_uuid('ordinary:att:8'),'2026-01-01 09:02Z','absent');
SELECT is((SELECT status::text FROM meeting_attendance WHERE id=test_uuid('ordinary:att:8')),'present','opening roll call is preserved');
SELECT is((SELECT status::text FROM current_meeting_attendance(test_uuid('ordinary:meeting')) WHERE id=test_uuid('ordinary:att:8')),'absent','current presence reflects departure');
SELECT is((SELECT facts FROM meeting_quorum_observation WHERE agenda_item=test_uuid('ordinary:a:agenda-item')),(SELECT facts FROM retained),'departure does not rewrite discussion quorum');
SELECT throws_ok($$SELECT hall_api.create_ballot_result_preview(test_uuid('ordinary:a:agenda-item'),pg_temp.public_candidate('ordinary',7))$$,'HV142',NULL,'product requires current quorum before reviewing the vote, without rewriting discussion history');
SELECT adjourn_council_agenda_item(test_uuid('ordinary:a:agenda-item'),'2026-01-01 09:03Z');
SELECT throws_ok($$UPDATE council_agenda_item SET started_at='2026-01-01 09:04Z' WHERE id=test_uuid('ordinary:b:agenda-item')$$,'HV142',NULL,'next affair is refused at7 of15');
SELECT ok((SELECT started_at IS NULL FROM council_agenda_item WHERE id=test_uuid('ordinary:b:agenda-item')),'refusal leaves affair unstarted');
SELECT is((SELECT count(*)::int FROM meeting_quorum_observation WHERE agenda_item=test_uuid('ordinary:b:agenda-item')),0,'refused transition has no partial successful observation');
CREATE TEMP TABLE failed AS SELECT (record_meeting_quorum(test_uuid('ordinary:meeting'),test_uuid('ordinary:b:agenda-item'),'2026-01-01 09:04Z')).*;
SELECT is((SELECT facts->>'verdict' FROM failed),'notMet','a separate explicit observation durably records failure');
INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status)
VALUES(test_uuid('ordinary:att:8'),'2026-01-01 09:05Z','present');
SELECT lives_ok($$SELECT start_council_agenda_item(test_uuid('ordinary:b:agenda-item'),'2026-01-01 09:06Z')$$,'return permits next affair after a fresh observation');
SELECT is((SELECT facts->>'verdict' FROM meeting_quorum_observation WHERE id=(SELECT id FROM failed)),'notMet','return never rewrites the failed observation');

SELECT pg_temp.quorum_case('personal',14,8);
INSERT INTO agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at)
VALUES(test_uuid('personal:a:agenda-item'),test_uuid('personal:member:8'),'personalInterest','2026-01-01 09:00Z');
SELECT test_prepare_notice(test_uuid('personal:meeting'));
SELECT start_council_meeting(test_uuid('personal:meeting'),'2026-01-01 09:00Z');
SELECT throws_ok($$SELECT start_council_agenda_item(test_uuid('personal:a:agenda-item'),'2026-01-01 09:01Z')$$,'HV142',NULL,'personal interest leaves denominator14 and7 eligible present is insufficient');
SELECT pg_temp.quorum_case('special',14,8);
INSERT INTO agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at)
VALUES(test_uuid('special:a:agenda-item'),test_uuid('special:member:8'),'designatedRepresentativeConflict','2026-01-01 09:00Z');
SELECT test_prepare_notice(test_uuid('special:meeting'));
SELECT start_council_meeting(test_uuid('special:meeting'),'2026-01-01 09:00Z');
SELECT lives_ok($$SELECT start_council_agenda_item(test_uuid('special:a:agenda-item'),'2026-01-01 09:01Z')$$,'qualified special conflict reduces denominator13 and7 present suffice');
SELECT is((SELECT facts->>'denominator' FROM meeting_quorum_observation WHERE agenda_item=test_uuid('special:a:agenda-item')),'13','special denominator reduction is retained');

-- @verifies-requirement HALL-FR-MTG-290

-- ordinary failed first call, clear days, identified affairs.
SELECT pg_temp.quorum_case('renewed',15,7);
CREATE TEMP TABLE first_failure AS SELECT (record_meeting_quorum(test_uuid('renewed:meeting'),NULL,'2026-01-01 09:00Z')).*;
SELECT throws_ok($$INSERT INTO meeting_reconvocation(council_meeting,failed_observation,sent_at,scheduled_at,time_zone,first_notice_evidence,renewed_notice_evidence,agenda_item_ids)
 SELECT test_uuid('renewed:meeting'),id,'2026-01-01 10:00Z','2026-01-04 18:00Z','Europe/Paris','regular first notice','renewed transmission',ARRAY[test_uuid('renewed:a:agenda-item')] FROM first_failure$$,'HV147',NULL,'three elapsed days are not three clear days');
SELECT lives_ok($$INSERT INTO meeting_reconvocation(council_meeting,failed_observation,sent_at,scheduled_at,time_zone,first_notice_evidence,renewed_notice_evidence,agenda_item_ids)
 SELECT test_uuid('renewed:meeting'),id,'2026-01-01 10:00Z','2026-01-05 09:00Z','Europe/Paris','regular first notice','renewed transmission',ARRAY[test_uuid('renewed:a:agenda-item')] FROM first_failure$$,'D+4 satisfies three clear calendar days including weekend');
SELECT throws_ok($$SELECT start_council_meeting(test_uuid('renewed:meeting'),'2026-01-05 09:00Z')$$,'HV149',NULL,'renewed actual meeting requires fresh membership and presence');
INSERT INTO meeting_membership_record(council_meeting,observed_at,source_reference,member_ids) SELECT council_meeting,'2026-01-05 09:00Z','Reconfirmed mandates',member_ids FROM meeting_membership_record WHERE council_meeting=test_uuid('renewed:meeting');
INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status) SELECT id,'2026-01-05 09:00Z',status FROM meeting_attendance WHERE council_meeting=test_uuid('renewed:meeting');
SELECT test_prepare_notice(test_uuid('renewed:meeting'));
SELECT lives_ok($$SELECT start_council_meeting(test_uuid('renewed:meeting'),'2026-01-05 09:00Z')$$,'second call admits opening below ordinary quorum');
SELECT lives_ok($$SELECT start_council_agenda_item(test_uuid('renewed:a:agenda-item'),'2026-01-05 09:01Z')$$,'identified affair has the recorded exemption');
SELECT is((SELECT facts->>'verdict' FROM meeting_quorum_observation WHERE agenda_item=test_uuid('renewed:a:agenda-item')),'exempt','exemption is distinguishable from ordinary quorum met');
SELECT is(calculate_meeting_quorum(test_uuid('renewed:meeting'),test_uuid('renewed:b:agenda-item'),'2026-01-05 09:01Z')->>'verdict','notMet','an affair outside renewed notice has no automatic exemption');
-- Legal review1: no synthetic failure before the actual scheduled meeting.
SELECT pg_temp.quorum_case('bounds',3,1);
SELECT throws_ok($$SELECT record_meeting_quorum(test_uuid('bounds:meeting'),NULL,'2026-01-01 08:59Z')$$,'HV143',NULL,'a premature observation cannot unlock reconvocation');
SELECT throws_ok($$SELECT record_meeting_quorum(test_uuid('bounds:meeting'),NULL,clock_timestamp()+interval '1 day')$$,'HV143',NULL,'future observations are refused');
SELECT throws_ok($$INSERT INTO meeting_membership_record(council_meeting,observed_at,source_reference,member_ids) VALUES(test_uuid('bounds:meeting'),clock_timestamp()+interval '1 day','future roster',ARRAY[test_uuid('bounds:member:1')])$$,'HV133',NULL,'a future membership cannot be attested');
SELECT is((SELECT count(*)::int FROM meeting_quorum_observation WHERE council_meeting=test_uuid('bounds:meeting')),0,'rejected observations leave no failed-convocation evidence');
-- Legal review3: recusal evidence cannot be moved behind a purported earlier quorum.
SELECT pg_temp.quorum_case('recusal-time',3,3);
SELECT throws_ok($$INSERT INTO agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at) VALUES(test_uuid('recusal-time:a:agenda-item'),test_uuid('recusal-time:member:3'),'personalInterest',clock_timestamp()+interval '1 day')$$,'HV143',NULL,'future recusal declarations are refused');
INSERT INTO agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at) VALUES(test_uuid('recusal-time:a:agenda-item'),test_uuid('recusal-time:member:3'),'personalInterest','2026-01-01 09:02Z');
SELECT throws_ok($$SELECT record_meeting_quorum(test_uuid('recusal-time:meeting'),test_uuid('recusal-time:a:agenda-item'),'2026-01-01 09:01Z')$$,'HV143',NULL,'a quorum cannot predate the recusal it incorporates');
-- Legal review2: a real failure followed by closure never authorizes a renewed call.
SELECT pg_temp.quorum_case('closed-call',3,3);
SELECT test_prepare_notice(test_uuid('closed-call:meeting'));
SELECT start_council_meeting(test_uuid('closed-call:meeting'),'2026-01-01 09:00Z');
INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status) VALUES(test_uuid('closed-call:att:2'),'2026-01-01 09:01Z','absent'),(test_uuid('closed-call:att:3'),'2026-01-01 09:01Z','absent');
CREATE TEMP TABLE closed_failure AS SELECT (record_meeting_quorum(test_uuid('closed-call:meeting'),NULL,'2026-01-01 09:02Z')).*;
SELECT close_council_meeting(test_uuid('closed-call:meeting'),'2026-01-01 09:03Z');
SELECT throws_ok($$INSERT INTO meeting_reconvocation(council_meeting,failed_observation,sent_at,scheduled_at,time_zone,first_notice_evidence,renewed_notice_evidence,agenda_item_ids) SELECT test_uuid('closed-call:meeting'),id,'2026-01-01 10:00Z','2026-01-05 09:00Z','Europe/Paris','first notice','renewed notice',ARRAY[test_uuid('closed-call:a:agenda-item')] FROM closed_failure$$,'HV136',NULL,'a closed meeting cannot be reconvened after an earlier failure');
-- The roster in force at the opening is the only reference: no mandate is
-- replaced during the meeting (user decision of 26 October 2026, point E).
SELECT pg_temp.quorum_case('replacement',3,3);
SELECT test_prepare_notice(test_uuid('replacement:meeting'));
SELECT start_council_meeting(test_uuid('replacement:meeting'),'2026-01-01 09:00Z');
SELECT test_ensure_council_member(test_uuid('replacement:member:4'));
SELECT throws_ok($$INSERT INTO meeting_membership_record(council_meeting,observed_at,source_reference,member_ids) VALUES(test_uuid('replacement:meeting'),'2026-01-01 09:01Z','Replacement during the meeting',ARRAY[test_uuid('replacement:member:1'),test_uuid('replacement:member:2'),test_uuid('replacement:member:4')])$$,'HV136',NULL,'no membership roster can be recorded after the opening');
SELECT throws_ok($$SELECT hall_api.record_meeting_attendance_events(test_uuid('replacement:meeting'),'2026-01-01 09:01Z',jsonb_build_array(jsonb_build_object('councilMemberId',test_uuid('replacement:member:4'),'status','present','proxyHolderCouncilMemberId',NULL,'proxyDocumentId',NULL)))$$,'HV150',NULL,'a mandate outside the opening roster cannot attend as a member');
SELECT is((SELECT count(*)::int FROM meeting_membership_record WHERE council_meeting=test_uuid('replacement:meeting')),1,'the meeting keeps the opening roster alone');


-- @verifies-requirement HALL-FR-ATT-130


-- factual holder departure does not invent revocation of the written power.
SELECT pg_temp.quorum_case('power',3,2);
SELECT test_ensure_document_resource(test_uuid('power:document'));
UPDATE meeting_attendance SET status='represented',proxy_holder=test_uuid('power:att:2'),proxy_document=test_uuid('power:document') WHERE id=test_uuid('power:att:3');
SELECT test_prepare_notice(test_uuid('power:meeting'));
SELECT start_council_meeting(test_uuid('power:meeting'),'2026-01-01 09:00Z');
SELECT start_council_agenda_item(test_uuid('power:a:agenda-item'),'2026-01-01 09:01Z');
SELECT is(calculate_meeting_quorum(test_uuid('power:meeting'),test_uuid('power:a:agenda-item'),'2026-01-01 09:01Z')->>'presentCount','2','written power adds no physical presence');
SELECT lives_ok($$SELECT test_execute_deferred(ARRAY[$q$INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status) VALUES(test_uuid('power:att:2'),'2026-01-01 09:02Z','absent')$q$])$$,'holder departure remains recordable with an outstanding power');
SELECT ok(NOT agenda_item_attendance_is_eligible(test_uuid('power:a:agenda-item'),test_uuid('power:att:3')),'absent holder cannot exercise the mandant vote');
SELECT is((SELECT proxy_document FROM current_meeting_attendance(test_uuid('power:meeting')) WHERE id=test_uuid('power:att:3')),test_uuid('power:document'),'departure preserves written power evidence');
INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status) VALUES(test_uuid('power:att:2'),'2026-01-01 09:03Z','present');
SELECT ok(agenda_item_attendance_is_eligible(test_uuid('power:a:agenda-item'),test_uuid('power:att:3')),'return restores eligibility under the retained written power');
SELECT throws_ok($$UPDATE meeting_attendance_event SET status='present'$$,'HV131',NULL,'movement evidence is immutable');
SELECT throws_ok($$UPDATE meeting_membership_record SET source_reference='rewrite'$$,'HV135',NULL,'nominal membership evidence is immutable');
SELECT throws_ok($$UPDATE meeting_quorum_observation SET facts='{}'$$,'HV145',NULL,'quorum facts cannot be rewritten');
SELECT throws_ok($$UPDATE meeting_reconvocation SET first_notice_evidence='rewrite'$$,'HV146',NULL,'renewed notice cannot be rewritten');
SELECT pg_temp.quorum_case('unstarted-movement',1,1);
SELECT throws_ok($$INSERT INTO meeting_membership_record(council_meeting,observed_at,source_reference,member_ids) VALUES(test_uuid('unstarted-movement:meeting'),'2026-01-01 09:04Z','duplicates',ARRAY[test_uuid('unstarted-movement:member:1'),test_uuid('unstarted-movement:member:1')])$$,'HV137',NULL,'nominal record rejects duplicate members');
SELECT throws_ok($$INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status) VALUES(test_uuid('unstarted-movement:att:1'),'2026-01-01 09:00Z','absent')$$,'HV132',NULL,'unstarted first meeting has no live movement');
INSERT INTO council_meetings(id,number,scheduled_at,location) VALUES(test_uuid('no-membership:meeting'),(SELECT max(number)+1 FROM council_meetings),'2026-01-01 09:00Z','Chamber');
SELECT throws_ok($$SELECT record_meeting_quorum(test_uuid('no-membership:meeting'),NULL,'2026-01-01 09:00Z')$$,'HV140',NULL,'quorum has no inferred roster fallback');
SELECT throws_ok($$SELECT test_execute_deferred(ARRAY[$q$INSERT INTO meeting_attendance_event(meeting_attendance,observed_at,status,proxy_holder,proxy_document) VALUES(test_uuid('power:att:1'),'2026-01-01 09:04Z','represented',test_uuid('ordinary:att:1'),test_uuid('power:document'))$q$])$$,'HV134',NULL,'a proxy holder must belong to the same current meeting');
SELECT throws_ok($$INSERT INTO meeting_reconvocation(council_meeting,failed_observation,sent_at,scheduled_at,time_zone,first_notice_evidence,renewed_notice_evidence,agenda_item_ids) SELECT test_uuid('power:meeting'),id,'2026-01-01 10:00Z','2026-01-05 09:00Z','Europe/Paris','first','second',ARRAY[test_uuid('power:a:agenda-item')] FROM meeting_quorum_observation WHERE council_meeting=test_uuid('power:meeting') LIMIT 1$$,'HV144',NULL,'a successful quorum cannot unlock exemption');
SELECT throws_ok($$INSERT INTO meeting_reconvocation(council_meeting,failed_observation,sent_at,scheduled_at,time_zone,first_notice_evidence,renewed_notice_evidence,agenda_item_ids) SELECT test_uuid('renewed:meeting'),id,'2026-01-01 10:00Z','2026-01-05 09:00Z','Europe/Paris','first','second',ARRAY[test_uuid('power:a:agenda-item')] FROM first_failure$$,'HV148',NULL,'renewed notice cannot invent another meeting affair');

SELECT * FROM finish();
ROLLBACK;
