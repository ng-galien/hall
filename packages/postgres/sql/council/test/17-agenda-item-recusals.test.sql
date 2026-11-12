BEGIN;
\ir support/helpers.sql
SELECT no_plan();
SET LOCAL hall.actor_id = 'recusal-clerk';

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
SELECT test_recusal_case('r');

-- @verifies-requirement HALL-FR-AGI-370

-- two declared legal regimes, no fourth suffrage.
SELECT is((SELECT array_agg(enumlabel::text ORDER BY enumsortorder) FROM pg_enum
 WHERE enumtypid='recusal_legal_basis'::regtype),ARRAY['personalInterest','designatedRepresentativeConflict'],
 'the tranche contains exactly the two declared legal qualifications');
SELECT is((SELECT count(*)::int FROM pg_enum WHERE enumtypid='vote_choice'::regtype),5,'recusal is not a suffrage even with distinct secret blank and invalid choices');
SELECT throws_ok($$INSERT INTO agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at)
 VALUES(test_uuid('missing'),test_uuid('r:member:2'),'personalInterest',now())$$,'HV904',NULL,'unknown occurrence rejected');
SELECT throws_ok($$INSERT INTO agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at)
 VALUES(test_uuid('r:agenda-item'),test_uuid('missing'),'personalInterest',now())$$,'HV233',NULL,'undeclared member rejected');
SELECT lives_ok($$INSERT INTO agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at)
 VALUES(test_uuid('r:agenda-item'),test_uuid('r:member:2'),'personalInterest','2026-01-01 08:55Z')$$,'general recusal before discussion');
SELECT throws_ok($$INSERT INTO agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at)
 VALUES(test_uuid('r:agenda-item'),test_uuid('r:member:2'),'designatedRepresentativeConflict',now())$$,
 '23505',NULL,'same member and occurrence cannot acquire conflicting declarations');
-- @verifies-requirement HALL-FR-MTG-280
-- qualified effects on declarations, not a global quorum verdict.
SELECT is(agenda_item_recusal_state(test_uuid('r:agenda-item'))#>>'{quorumImpact,denominatorReduction}','0','general recusal never reduces denominator');
SELECT is(jsonb_array_length(agenda_item_recusal_state(test_uuid('r:agenda-item'))#>'{quorumImpact,eligibleDeclaredPresentMemberIds}'),5,'general recusal excludes declared presence; proxy not counted');
INSERT INTO agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at)
 VALUES(test_uuid('r:agenda-item'),test_uuid('r:member:3'),'designatedRepresentativeConflict','2026-01-01 08:56Z');
SELECT is(agenda_item_recusal_state(test_uuid('r:agenda-item'))#>>'{quorumImpact,denominatorReduction}','1','only specially qualified recusal reduces denominator');
SELECT is(jsonb_array_length(agenda_item_recusal_state(test_uuid('r:agenda-item'))#>'{quorumImpact,eligibleDeclaredPresentMemberIds}'),4,'both regimes exclude declared presence');
SELECT is(agenda_item_recusal_state(test_uuid('r:agenda-item'))->'eligibleParticipantAttendanceIds',
 (SELECT jsonb_agg(id ORDER BY id) FROM meeting_attendance WHERE id=ANY(ARRAY[test_uuid('r:att:1'),test_uuid('r:att:5'),test_uuid('r:att:6'),test_uuid('r:att:7')])), 'SQL participant list also excludes the recused proxy holder');
SELECT is((SELECT recorded_by FROM agenda_item_recusal LIMIT 1),'recusal-clerk','actor is server context');
SELECT throws_ok($$UPDATE agenda_item_recusal SET legal_basis='personalInterest'$$,'HV231',NULL,'no rewriting a qualification');
SELECT is(agenda_item_recusal_state(test_uuid('r:agenda-item'))->>'canWithdrawRecusal','true','a declaration can be withdrawn before any ballot result');
SELECT throws_ok($$TRUNCATE agenda_item_recusal$$,'HV231',NULL,'truncate cannot erase declarations');
INSERT INTO council_meetings (id) VALUES
(test_uuid('another:meeting'));
SELECT throws_ok($$UPDATE council_agenda_item SET council_meeting=test_uuid('another:meeting') WHERE id=test_uuid('r:agenda-item')$$,
 'HV234',NULL,'declaration cannot follow an occurrence to another meeting');
SELECT test_create_decision_agenda_item('other',test_uuid('r:meeting'),2);
SELECT is(jsonb_array_length(agenda_item_recusal_state(test_uuid('other:agenda-item'))->'recusals'),0,'recusal does not automatically affect another affair');
SELECT test_prepare_notice(test_uuid('r:meeting'));
SELECT start_council_meeting(test_uuid('r:meeting'),'2026-01-01 09:00Z');
SELECT start_council_agenda_item(test_uuid('r:agenda-item'),'2026-01-01 09:01Z');

-- @verifies-requirement HALL-FR-BAL-310

-- both regimes excluded, also through a proxy, public and secret.
SELECT throws_ok($$SELECT create_ballot(test_uuid('r:agenda-item'),'public',
 ARRAY[test_uuid('r:att:1'),test_uuid('r:att:2')],test_uuid('r:att:1'))$$,'HV305',NULL,'general recusal blocks public participation');
SELECT throws_ok($$SELECT create_ballot(test_uuid('r:agenda-item'),'secret',
 ARRAY[test_uuid('r:att:1'),test_uuid('r:att:3')],test_uuid('r:att:1'))$$,'HV305',NULL,'special recusal blocks secret participation');
SELECT throws_ok($$SELECT create_ballot(test_uuid('r:agenda-item'),'public',
 ARRAY[test_uuid('r:att:1'),test_uuid('r:att:4')],test_uuid('r:att:1'))$$,'HV305',NULL,'recused holder cannot exercise a proxy');
SELECT is((SELECT count(*)::int FROM ballots),0,'failed creation rolls back ballot and participations');
CREATE TEMP TABLE allowed_ballot AS SELECT create_ballot(test_uuid('r:agenda-item'),'secret',
 ARRAY[test_uuid('r:att:1'),test_uuid('r:att:5'),test_uuid('r:att:6'),test_uuid('r:att:7')],test_uuid('r:att:1')) AS id;
SELECT throws_ok($$INSERT INTO agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at)
 VALUES(test_uuid('r:agenda-item'),test_uuid('r:member:1'),'personalInterest',now())$$,
 'HV232',NULL,'existing ballot prevents contradictory late declaration');
SELECT is(agenda_item_recusal_state(test_uuid('r:agenda-item'))->>'canRecordRecusal','false','API availability follows ballot boundary');
SELECT record_secret_ballot_votes(id,0,0,1,0,0,3) FROM allowed_ballot;
SELECT test_confirm_ballot(id,'2026-01-01 09:10Z') FROM allowed_ballot;

-- @verifies-requirement HALL-FR-AGI-430
SELECT throws_ok($$SELECT hall_api.withdraw_agenda_item_recusal(test_uuid('r:agenda-item'),test_uuid('r:member:2'))$$,
 'HV239',NULL,'a recorded ballot result keeps the declaration');
SELECT throws_ok($$DELETE FROM agenda_item_recusal WHERE agenda_item=test_uuid('r:agenda-item')$$,
 'HV239',NULL,'no erasing a declaration once the result is recorded');
SELECT is(agenda_item_recusal_state(test_uuid('r:agenda-item'))->>'canWithdrawRecusal','false','API availability of the withdrawal follows the ballot result');
SELECT is((SELECT sum(count)::int FROM votes),1,'abstention remains one recorded choice, recusals add none');
SELECT ok(NOT EXISTS(SELECT FROM votes WHERE ballot_participation IS NOT NULL),'secret votes have no member link');

-- @verifies-requirement HALL-FR-MIN-210

-- product evidence, not a statutory requirement for a named section.
UPDATE hall.contact SET first_name='Changed' WHERE id=test_uuid('r:member:2');
SELECT capture_council_meeting_snapshot(test_uuid('r:meeting'),'closing','2026-01-01 09:20Z');
SELECT is(jsonb_array_length(capture_minutes_facts(test_uuid('r:meeting'))->'recusals'),2,'minutes facts include both declarations');
SELECT ok(NOT EXISTS(SELECT FROM jsonb_array_elements(capture_minutes_facts(test_uuid('r:meeting'))->'recusals') r
 WHERE r->>'memberName' LIKE 'Changed%'),'copied declaration identity survives directory changes');
SELECT ok(NOT EXISTS(SELECT FROM jsonb_array_elements(capture_minutes_facts(test_uuid('r:meeting'))->'recusals') r
 WHERE r ? 'choice'),'nominative recusal evidence contains no secret choice');

SELECT * FROM finish();
ROLLBACK;
