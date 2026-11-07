BEGIN;
\ir support/helpers.sql
SELECT no_plan();

-- @verifies-requirement HALL-FR-MIN-160

-- @verifies-requirement HALL-FR-MIN-060

-- @verifies-requirement HALL-FR-MIN-080

-- @verifies-requirement HALL-FR-MIN-140
SELECT test_prepare_open_ballot('minutes', 'public', 2);
UPDATE council_agenda_item SET discussion_summary = 'Notes with a typo.' WHERE id = test_uuid('minutes:agenda-item');
INSERT INTO votes(ballot, mode, choice, ballot_participation, count) VALUES
  (test_uuid('minutes:ballot'), 'public', 'approve', test_uuid('minutes:participation:1'), 1),
  (test_uuid('minutes:ballot'), 'public', 'abstain', test_uuid('minutes:participation:2'), 1);
UPDATE ballots SET result_preview=test_review_ballot(id),completed_at = '2026-01-01 09:30Z' WHERE id = test_uuid('minutes:ballot');
CREATE TEMP TABLE minutes_closure AS SELECT hall_api.close_council_meeting(test_uuid('minutes:meeting')) payload;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
CREATE TEMP TABLE minutes_fixture AS SELECT (payload#>>'{minutes,id}')::UUID id, (payload#>>'{nextMeeting,id}')::UUID next_meeting FROM minutes_closure;
-- @verifies-requirement HALL-FR-MIN-220
SELECT ok((SELECT hall_api.open_minutes(id)->>'settledAt' IS NULL FROM minutes_fixture), 'a newly created PV is not stopped by document creation');
SELECT is((SELECT count(*) FROM minutes WHERE council_meeting = test_uuid('minutes:meeting')), 1::BIGINT, 'closure creates exactly one standalone draft');
SELECT is((SELECT content FROM minutes_section JOIN minutes_fixture ON minutes = id WHERE agenda_item = test_uuid('minutes:agenda-item')), 'Notes with a typo.', 'draft starts from recorded discussion notes');
-- @verifies-requirement HALL-FR-MIN-250
SELECT ok(NOT (SELECT (facts#>'{agenda,0}') ? 'discussionSummary' FROM minutes JOIN minutes_fixture USING(id)), 'minutes facts do not duplicate discussion notes');
SELECT is((SELECT hall_api.open_minutes(id)#>>'{facts,agenda,0,discussionSummary}' FROM minutes_fixture), 'Notes with a typo.', 'minutes API reads immutable notes from the agenda item');
SELECT throws_ok($$UPDATE council_agenda_item SET discussion_summary = 'Changed after closure' WHERE id = test_uuid('minutes:agenda-item')$$, 'HV223', 'a closed council meeting cannot receive agenda changes', 'closed meeting notes cannot be changed');
SELECT is((SELECT facts#>>'{ballots,0,result}' FROM minutes JOIN minutes_fixture USING(id)), 'approve', 'result is copied from the immutable ballot');
SELECT is((SELECT jsonb_array_length(facts#>'{ballots,0,votes}') FROM minutes JOIN minutes_fixture USING(id)), 2, 'public recorded votes are copied');
SELECT is((SELECT facts#>>'{meeting,chair,name}' FROM minutes JOIN minutes_fixture USING(id)), 'Test ' || (SELECT chair_member::TEXT FROM council_meetings WHERE id=test_uuid('minutes:meeting')), 'chair name is frozen');
UPDATE contact SET first_name = 'Changed' WHERE id = (SELECT chair_member FROM council_meetings WHERE id=test_uuid('minutes:meeting'));
SELECT is((SELECT facts#>>'{meeting,chair,name}' FROM minutes JOIN minutes_fixture USING(id)), 'Test ' || (SELECT chair_member::TEXT FROM council_meetings WHERE id=test_uuid('minutes:meeting')), 'directory changes cannot alter minutes facts');

-- @verifies-requirement HALL-FR-MIN-050
SELECT ok((SELECT council_business IS NULL FROM council_agenda_item JOIN minutes_fixture ON council_meeting = next_meeting WHERE minutes_approval IS NOT NULL), 'approval has no workspace business');
-- @verifies-requirement HALL-FR-MIN-090
SELECT throws_ok($$UPDATE minutes SET facts = '{}' WHERE id = (SELECT id FROM minutes_fixture)$$, 'HV703', NULL, 'facts cannot be replaced');
-- @verifies-requirement HALL-FR-MIN-070
SELECT throws_ok($$DELETE FROM minutes WHERE id = (SELECT id FROM minutes_fixture)$$, 'HV701', NULL, 'minutes cannot be deleted');
SELECT throws_ok($$TRUNCATE minutes CASCADE$$, 'HV701', NULL, 'truncation cannot erase minutes');
SELECT throws_ok($$INSERT INTO minutes(id,council_meeting) VALUES(test_uuid('minutes:missing-snapshot'),(SELECT next_meeting FROM minutes_fixture))$$, 'HV702', NULL, 'unclosed meetings cannot create a draft');

-- @verifies-requirement HALL-TR-MIN-020
-- @verifies-requirement HALL-FR-MIN-170
-- @verifies-requirement HALL-FR-MIN-180
-- @verifies-requirement HALL-FR-MIN-190
-- @verifies-requirement HALL-FR-MIN-200
-- @verifies-requirement HALL-TR-MIN-040
SELECT is((SELECT count(*) FROM minutes_section JOIN minutes_fixture ON minutes=id), 1::BIGINT, 'one section is initialized per captured point');
SELECT throws_ok($$DELETE FROM minutes_section$$, 'HV710', NULL, 'sections cannot be removed');
SELECT throws_ok($$TRUNCATE minutes_section$$, 'HV710', NULL, 'section truncate is forbidden');
SELECT throws_ok($$UPDATE minutes_section SET agenda_item=test_uuid('other')$$, 'HV711', NULL, 'section identity cannot change');
SELECT throws_ok($$INSERT INTO minutes_section SELECT id,test_uuid('other'),'x' FROM minutes_fixture$$, 'HV712', NULL, 'section must belong to snapshot agenda');
SELECT throws_ok($$SELECT hall_api.update_minutes_draft((SELECT id FROM minutes_fixture),1,test_uuid('other'),'x')$$, 'HV712', NULL, 'unknown section cannot be added through update');
SELECT throws_ok($$INSERT INTO minutes_section SELECT minutes,agenda_item,content FROM minutes_section$$, '23505', NULL, 'a captured point has at most one section');
SELECT lives_ok($$SELECT hall_api.update_minutes_draft((SELECT id FROM minutes_fixture),1,test_uuid('minutes:agenda-item'),'Corrected section.')$$, 'draft section can be corrected');
SELECT is((SELECT version FROM minutes JOIN minutes_fixture USING(id)), 2, 'successful draft save increments version');
SELECT throws_ok($$SELECT hall_api.update_minutes_draft((SELECT id FROM minutes_fixture),1,test_uuid('minutes:agenda-item'),'Stale section')$$, 'HV708', NULL, 'stale edits cannot overwrite newer text');
SELECT throws_ok($$SELECT hall_api.update_minutes_draft(test_uuid('missing'),1,test_uuid('minutes:agenda-item'),'x')$$, 'HV707', NULL, 'unknown draft is explicit');
SELECT throws_ok($$SELECT hall_api.generate_minutes((SELECT id FROM minutes_fixture),1,convert_to('%PDF-1.4 test','UTF8'))$$, 'HV708', NULL, 'stale rendering cannot be published');

-- @verifies-requirement HALL-FR-MIN-130
SELECT throws_ok($$INSERT INTO ballots(id,council_agenda_item,mode,chairman)
  SELECT test_uuid('minutes:approval-ballot'), item.id, 'public', test_uuid('minutes:approval-chair')
  FROM council_agenda_item item JOIN minutes_fixture ON item.council_meeting = next_meeting WHERE minutes_approval IS NOT NULL$$,
  'HV709', NULL, 'approval ballot requires the generated PDF');

-- @verifies-requirement HALL-FR-MIN-120
SELECT throws_ok($$SELECT hall_api.generate_minutes((SELECT id FROM minutes_fixture),2,convert_to('not a pdf','UTF8'))$$, 'HV706', NULL, 'generation rejects non-PDF content');
-- @verifies-requirement HALL-FR-MIN-040
-- @verifies-requirement HALL-TR-MIN-010
-- @verifies-requirement HALL-TR-MIN-030
SELECT lives_ok($$SELECT hall_api.generate_minutes((SELECT id FROM minutes_fixture),2,convert_to('%PDF-1.4 test','UTF8'))$$, 'generation freezes the exact observed draft');
SELECT ok((SELECT hall_api.open_minutes(id)->>'documentId' IS NOT NULL FROM minutes_fixture), 'generated document identity is exposed');
SELECT is((SELECT decode(hall_api.minutes_content(id)->>'contentBase64','base64') FROM minutes_fixture), convert_to('%PDF-1.4 test','UTF8'), 'content API returns original PDF bytes');
-- @verifies-requirement HALL-FR-MIN-100
SELECT throws_ok($$SELECT hall_api.update_minutes_draft((SELECT id FROM minutes_fixture),2,test_uuid('minutes:agenda-item'),'After generation')$$, 'HV704', NULL, 'generated draft cannot be edited');
SELECT throws_ok($$SELECT hall_api.generate_minutes((SELECT id FROM minutes_fixture),2,convert_to('%PDF-1.4 second','UTF8'))$$, 'HV704', NULL, 'generation cannot replace an existing document');
-- @verifies-requirement HALL-FR-MIN-110
SELECT throws_ok($$UPDATE minutes_document SET generated_at = now() + interval '1 minute'$$, 'HV705', NULL, 'generated identity cannot be changed');
SELECT throws_ok($$DELETE FROM minutes_document$$, 'HV705', NULL, 'generated document cannot be deleted');
SELECT throws_ok($$TRUNCATE minutes_document$$, 'HV705', NULL, 'generated document cannot be truncated');
SELECT * FROM finish();
ROLLBACK;
