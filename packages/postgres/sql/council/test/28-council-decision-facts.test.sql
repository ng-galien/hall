BEGIN;
SET LOCAL search_path=hall,public;
SET LOCAL hall.actor_id='decision-clerk';
\ir support/helpers.sql
\ir support/quorum.sql
SELECT no_plan();
-- @verifies-requirement HALL-FR-DEC-010
-- public facts are copied only at confirmation and survive later changes.
SELECT pg_temp.quorum_case('decision-facts',3,3);
UPDATE hall.text_resource SET content='Submitted proposal text' WHERE id=(SELECT text_resource FROM hall.council_decision_proposal_workspace WHERE council_decision_proposal=(SELECT council_decision_proposal FROM hall.council_agenda_item WHERE id=test_uuid('decision-facts:a:agenda-item')));
SELECT test_prepare_notice(test_uuid('decision-facts:meeting'));
SELECT start_council_meeting(test_uuid('decision-facts:meeting'),'2026-01-01 09:00Z');
SELECT start_council_agenda_item(test_uuid('decision-facts:a:agenda-item'),'2026-01-01 09:01Z');
CREATE TEMP TABLE preview AS SELECT hall_api.create_ballot_result_preview(test_uuid('decision-facts:a:agenda-item'),pg_temp.public_candidate('decision-facts',3,2)) payload;
SELECT is((SELECT count(*)::int FROM hall.council_decision_facts),0,'a review does not capture a confirmed decision');
SAVEPOINT missing_text_fixture;
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE hall.council_decision_proposal_workspace DISABLE TRIGGER proposal_workspace_protected;
DELETE FROM hall.council_decision_proposal_workspace WHERE council_decision_proposal=(SELECT council_decision_proposal FROM hall.council_agenda_item WHERE id=test_uuid('decision-facts:a:agenda-item'));
ALTER TABLE hall.council_decision_proposal_workspace ENABLE TRIGGER proposal_workspace_protected;
SET CONSTRAINTS ALL DEFERRED;
SELECT throws_ok($$SELECT hall_api.confirm_ballot_result_preview((SELECT(payload->>'id')::uuid FROM preview))$$,'HV731',NULL,'missing submitted text aborts confirmation atomically');
ROLLBACK TO SAVEPOINT missing_text_fixture;
SELECT hall_api.confirm_ballot_result_preview((SELECT(payload->>'id')::uuid FROM preview));
CREATE TEMP TABLE captured AS SELECT * FROM hall.council_decision_facts;
SELECT is((SELECT count(*)::int FROM captured),1,'confirmation captures exactly one observation');
SELECT is((SELECT facts#>>'{proposal,submittedText}' FROM captured),'Submitted proposal text','original submitted text is copied');
SELECT is((SELECT facts#>>'{ballot,result}' FROM captured),'approve','confirmed result is copied');
SELECT is((SELECT jsonb_array_length(facts#>'{ballot,votes}') FROM captured),3,'public votes retain named members');
SELECT is((SELECT facts#>>'{quorum,presentCount}' FROM captured),'3','reviewed quorum is copied');
UPDATE hall.contact SET last_name='Changed later' WHERE id=(SELECT contact FROM hall.council_member WHERE id=test_uuid('decision-facts:member:1'));
INSERT INTO hall.meeting_attendance_event(meeting_attendance,observed_at,status) VALUES(test_uuid('decision-facts:att:3'),clock_timestamp(),'absent');
SELECT is((SELECT facts FROM hall.council_decision_facts),(SELECT facts FROM captured),'later names and attendance do not rewrite confirmed facts');
SELECT throws_ok($$UPDATE hall.council_decision_facts SET facts='{}'$$,'HV730',NULL,'facts cannot be edited');
SELECT throws_ok($$DELETE FROM hall.council_decision_facts$$,'HV730',NULL,'facts cannot be deleted');
SELECT throws_ok($$TRUNCATE hall.council_decision_facts CASCADE$$,'HV730',NULL,'truncate cannot erase facts');
-- Rejected secret facts remain evidence; this does not decide whether a documentary draft is created.
SELECT pg_temp.quorum_case('decision-secret',3,3);
SELECT test_prepare_notice(test_uuid('decision-secret:meeting'));
SELECT start_council_meeting(test_uuid('decision-secret:meeting'),'2026-01-01 09:00Z');
SELECT start_council_agenda_item(test_uuid('decision-secret:a:agenda-item'),'2026-01-01 09:01Z');
SELECT hall_api.confirm_ballot_result_preview((hall_api.create_ballot_result_preview(test_uuid('decision-secret:a:agenda-item'),
 (pg_temp.public_candidate('decision-secret',3)-'votes'-'nonParticipations')||jsonb_build_object('mode','secret','totals',
 jsonb_build_object('approve',0,'reject',1,'abstain',1,'blank',0,'invalid',0,'nonParticipation',1)))->>'id')::uuid);
SELECT is((SELECT facts#>>'{ballot,result}' FROM hall.council_decision_facts WHERE facts#>>'{ballot,mode}'='secret'),'reject','rejection remains an immutable voting fact');
SELECT ok((SELECT NOT(facts->'ballot' ? 'votes') AND NOT(facts->'ballot' ? 'nonParticipations') FROM hall.council_decision_facts WHERE facts#>>'{ballot,mode}'='secret'),'secret observation contains no named choice');
SELECT is((SELECT facts#>>'{ballot,totals,nonParticipation}' FROM hall.council_decision_facts WHERE facts#>>'{ballot,mode}'='secret'),'1','secret non-participation remains an anonymous total');
SELECT * FROM finish();
ROLLBACK;
