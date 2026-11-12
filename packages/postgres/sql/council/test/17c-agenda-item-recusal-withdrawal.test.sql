BEGIN;
\ir support/helpers.sql
SELECT no_plan();
SET LOCAL hall.actor_id = 'recusal-withdrawal-clerk';

CREATE FUNCTION test_recusal_case(label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO council_meetings (id,scheduled_at,location) VALUES
(test_uuid(label||':meeting'),'2026-01-01 09:00Z','Chamber');
  INSERT INTO meeting_attendance(id,council_member,council_meeting,status)
  SELECT test_uuid(label||':att:'||n),test_uuid(label||':member:'||n),test_uuid(label||':meeting'),'present'
  FROM generate_series(1,3) n;
  INSERT INTO meeting_attendance(id,council_member,council_meeting,status,proxy_holder,proxy_document)
  VALUES(test_uuid(label||':att:4'),test_uuid(label||':member:4'),test_uuid(label||':meeting'),'represented',
    test_uuid(label||':att:3'),test_uuid(label||':proxy'));
  INSERT INTO meeting_attendance(id,council_member,council_meeting,status) SELECT test_uuid(label||':att:'||n),test_uuid(label||':member:'||n),test_uuid(label||':meeting'),'present' FROM generate_series(5,7)n;
  PERFORM test_confirm_declared_membership(test_uuid(label||':meeting'));
  PERFORM set_council_meeting_officers(test_uuid(label||':meeting'),test_uuid(label||':member:1'),test_uuid(label||':member:1'));
  PERFORM test_create_decision_agenda_item(label,test_uuid(label||':meeting'));
END;
$$;
-- @verifies-requirement HALL-FR-AGI-430
-- withdrawal before the result: the member votes again; refused once the meeting is closed.
SELECT test_recusal_case('w');
SELECT test_prepare_notice(test_uuid('w:meeting'));
SELECT start_council_meeting(test_uuid('w:meeting'),'2026-01-01 09:00Z');
SELECT start_council_agenda_item(test_uuid('w:agenda-item'),'2026-01-01 09:01Z');
SELECT lives_ok($$SELECT hall_api.record_agenda_item_recusal(test_uuid('w:agenda-item'),test_uuid('w:member:2'),'designatedRepresentativeConflict')$$,
 'a recusal is declared during the discussion');
SELECT ok(NOT agenda_item_recusal_state(test_uuid('w:agenda-item'))->'eligibleParticipantAttendanceIds' ? test_uuid('w:att:2')::text,
 'the recused member is not a voter');
SELECT is(agenda_item_recusal_state(test_uuid('w:agenda-item'))#>>'{quorumImpact,denominatorReduction}','1','the declaration reduces the denominator');
SELECT is(hall_api.withdraw_agenda_item_recusal(test_uuid('w:agenda-item'),test_uuid('w:member:2'))->'recusals','[]'::jsonb,
 'the withdrawal removes the declaration');
SELECT ok(agenda_item_recusal_state(test_uuid('w:agenda-item'))->'eligibleParticipantAttendanceIds' ? test_uuid('w:att:2')::text,
 'the member votes again after the withdrawal');
SELECT is(jsonb_array_length(agenda_item_recusal_state(test_uuid('w:agenda-item'))#>'{quorumImpact,eligibleDeclaredPresentMemberIds}'),6,
 'the member counts again among admissible present members');
SELECT is(agenda_item_recusal_state(test_uuid('w:agenda-item'))#>>'{quorumImpact,denominatorReduction}','0','the denominator is restored');
SELECT is(agenda_item_recusal_state(test_uuid('w:agenda-item'))->>'canWithdrawRecusal','false','nothing remains to withdraw');
SELECT ok(NOT EXISTS(SELECT FROM agenda_item_recusal WHERE agenda_item=test_uuid('w:agenda-item')),'no trace of the withdrawn declaration remains');
SELECT lives_ok($$SELECT hall_api.record_agenda_item_recusal(test_uuid('w:agenda-item'),test_uuid('w:member:2'),'personalInterest')$$,
 'the member can declare again after a withdrawal');
SELECT close_council_meeting(test_uuid('w:meeting'),'2026-01-01 09:15Z');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT throws_ok($$SELECT hall_api.withdraw_agenda_item_recusal(test_uuid('w:agenda-item'),test_uuid('w:member:2'))$$,
 'HV239',NULL,'a closed meeting keeps the declaration');
SELECT is(agenda_item_recusal_state(test_uuid('w:agenda-item'))->>'canWithdrawRecusal','false','API availability of the withdrawal follows the meeting closure');
SELECT * FROM finish();
ROLLBACK;
