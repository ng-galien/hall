-- Preparation regression: real named commands, retained deprogramming facts,
-- freeze/reopen/versioning/start gate. PDF bytes here are storage fixtures;
-- meetingNoticesPostgres.test.ts separately verifies real Chromium and EML.
BEGIN;
SET LOCAL search_path=hall,public,pg_catalog;
SET LOCAL hall.roles='["administrator"]';
\ir support/helpers.sql
SELECT no_plan();
-- HALL-FR-NOT-110 HALL-TR-NOT-020: SQL calendar dates, not elapsed hours.
SELECT is(hall.notice_clear_day_deadline('2026-09-11 18:00Z','Europe/Paris',3),DATE '2026-09-07','three clear days exclude transmission and meeting dates');
SELECT is(hall.notice_clear_day_deadline('2026-09-11 18:00Z','Europe/Paris',5),DATE '2026-09-05','five clear days can end on Saturday without workday extension');
SELECT is(hall.notice_clear_day_deadline('2026-03-31 18:00Z','Europe/Paris',3),DATE '2026-03-27','DST does not change the calendar subtraction');
CREATE TEMP TABLE preparation(key text PRIMARY KEY,id uuid);
INSERT INTO council_meetings(id,number,scheduled_at,location) VALUES(test_uuid('preparation:meeting'),1,'2026-01-01 18:00Z','Council chamber');
SELECT throws_ok($$SELECT hall_api.freeze_council_agenda(test_uuid('preparation:meeting'))$$,'HV803',NULL,'empty agenda cannot be frozen');
SELECT throws_ok($$SELECT hall_api.generate_meeting_notice(test_uuid('preparation:meeting'),'{}'::jsonb,convert_to('%PDF-before','UTF8'))$$,'HV804',NULL,'generation before freeze is refused');
SELECT test_ensure_council_member(test_uuid('preparation:member'));
INSERT INTO meeting_attendance(id,council_member,council_meeting,status) VALUES(test_uuid('preparation:attendance'),test_uuid('preparation:member'),test_uuid('preparation:meeting'),'present');
SELECT set_council_meeting_officers(test_uuid('preparation:meeting'),test_uuid('preparation:member'),test_uuid('preparation:member'));
SELECT test_confirm_declared_membership(test_uuid('preparation:meeting'));
INSERT INTO preparation VALUES('business',(hall_api.create_council_business('seed','Preparation regression','Report','Evidence')->>'id')::uuid);
-- HALL-FR-AGI-010: the database rejects an affair without a prepared subject.
SELECT throws_ok($$INSERT INTO council_agenda_item(id,council_business,council_meeting,position)
  VALUES(gen_random_uuid(),(SELECT id FROM preparation WHERE key='business'),test_uuid('preparation:meeting'),1)$$,
  '23514','new row for relation "council_agenda_item" violates check constraint "council_agenda_item_one_subject"',
  'an affair alone is rejected by the structural exactly-one-subject constraint');
SELECT is(enum_range(NULL::hall.council_agenda_subject_kind)::text[],ARRAY['minutesApproval','councilDecisionProposal','openQuestion'],
  'only the three supported subject kinds exist');
INSERT INTO preparation SELECT 'proposal',(hall_api.create_prepared_council_subject(id,'councilDecisionProposal','Budget proposal','Original proposed text')->>'id')::uuid FROM preparation WHERE key='business';
-- HALL-FR-BUS-050: prepared identity already belongs to its business.
SELECT throws_ok($$UPDATE council_decision_proposal SET council_business=gen_random_uuid() WHERE id=(SELECT id FROM preparation WHERE key='proposal')$$,'HV809',NULL,'prepared business identity cannot change');
INSERT INTO preparation SELECT 'proposal-item',(hall_api.schedule_prepared_council_subject(test_uuid('preparation:meeting'),id,'councilDecisionProposal',1)->>'id')::uuid FROM preparation WHERE key='proposal';
INSERT INTO preparation SELECT 'question-'||n,(hall_api.create_prepared_council_subject((SELECT id FROM preparation WHERE key='business'),'openQuestion','Question '||n,'Question content '||n)->>'id')::uuid FROM generate_series(2,5)n;
INSERT INTO preparation SELECT key||'-item',(hall_api.schedule_prepared_council_subject(test_uuid('preparation:meeting'),id,'openQuestion',right(key,1)::int)->>'id')::uuid FROM preparation WHERE key IN('question-2','question-3','question-4','question-5') ORDER BY key;
SELECT is((SELECT array_agg(position ORDER BY position) FROM council_agenda_item WHERE council_meeting=test_uuid('preparation:meeting')),ARRAY[1,2,3,4,5],'both prepared natures form an ordered agenda');
SELECT throws_ok($$SELECT hall_api.schedule_prepared_council_subject(test_uuid('preparation:meeting'),(SELECT id FROM preparation WHERE key='proposal'),'councilDecisionProposal',1)$$,'HV810',NULL,'duplicate prepared occurrence is refused');
SELECT throws_ok($$SELECT hall_api.schedule_prepared_council_subject(test_uuid('preparation:meeting'),gen_random_uuid(),'openQuestion',1)$$,'HV910',NULL,'unknown prepared subject is refused');
SELECT hall_api.deprogram_council_agenda_item((SELECT id FROM preparation WHERE key='question-5-item'));
SELECT is((SELECT array_agg(position ORDER BY abs(position)) FROM council_agenda_item WHERE council_meeting=test_uuid('preparation:meeting')),ARRAY[1,2,3,4,-5],'exact live failure fixture retains the withdrawn question at minus five');
-- HALL-FR-AGI-380: the quick-create command must use the same insertion authority.
SELECT lives_ok($$INSERT INTO preparation SELECT 'quick-item',(hall_api.create_and_schedule_open_question('seed','New question','Report','',test_uuid('preparation:meeting'),5)#>>'{agendaItem,id}')::uuid$$,'quick creation at five shifts the withdrawn occurrence instead of raising 23505');
SELECT is((SELECT array_agg(position ORDER BY abs(position)) FROM council_agenda_item WHERE council_meeting=test_uuid('preparation:meeting')),ARRAY[1,2,3,4,5,-6],'new question occupies five and old occurrence survives at minus six');
SELECT is((SELECT content FROM text_resource WHERE id=(SELECT text_resource FROM open_question_workspace WHERE open_question=(SELECT id FROM preparation WHERE key='question-5'))),'Question content 5','withdrawal and shifting preserve the original question text');
SELECT is((hall_api.schedule_prepared_council_subject(test_uuid('preparation:meeting'),(SELECT id FROM preparation WHERE key='question-5'),'openQuestion',5)->>'id')::uuid,(SELECT id FROM preparation WHERE key='question-5-item'),'reinscription reuses the same occurrence identity');
SELECT is((SELECT count(*)::int FROM council_agenda_item WHERE open_question=(SELECT id FROM preparation WHERE key='question-5')),1,'reinscription creates no duplicate subject occurrence');
SELECT lives_ok($$SELECT hall_api.reorder_council_agenda(test_uuid('preparation:meeting'),ARRAY(SELECT id FROM council_agenda_item WHERE council_meeting=test_uuid('preparation:meeting') AND position>0 ORDER BY CASE WHEN position<=2 THEN position ELSE 9-position END))$$,'reordering questions succeeds atomically');
-- HALL-FR-NOT-090: current notice is mandatory at start.
SELECT throws_ok($$SELECT start_council_meeting(test_uuid('preparation:meeting'),'2026-01-01 18:00Z')$$,'HV807',NULL,'even an otherwise ready meeting cannot start without a current notice');
-- HALL-FR-NOT-010 HALL-FR-NOT-020: questions and composition are frozen.
SELECT hall_api.freeze_council_agenda(test_uuid('preparation:meeting'));
SELECT throws_ok($$SELECT hall_api.deprogram_council_agenda_item((SELECT id FROM preparation WHERE key='quick-item'))$$,'HV801',NULL,'frozen composition rejects removal');
SELECT throws_ok($$SELECT hall_api.schedule_prepared_council_subject(test_uuid('preparation:meeting'),(SELECT id FROM preparation WHERE key='proposal'),'councilDecisionProposal',1)$$,'HV801',NULL,'frozen composition rejects insertion before any duplicate branch');
-- HALL-FR-NOT-050: generation persists a version without proving transmission.
SELECT throws_ok($$SELECT hall_api.generate_meeting_notice(test_uuid('preparation:meeting'),jsonb_build_object('meeting',hall.meeting_notice_meeting_facts(test_uuid('preparation:meeting')),'hall',jsonb_build_object('name','Commune','timeZone','Europe/Paris')),convert_to('not PDF','UTF8'))$$,'HV806',NULL,'artifact must contain PDF bytes');
CREATE TEMP TABLE notice_versions AS SELECT hall_api.generate_meeting_notice(test_uuid('preparation:meeting'),jsonb_build_object('meeting',hall.meeting_notice_meeting_facts(test_uuid('preparation:meeting')),'hall',jsonb_build_object('name','Commune','timeZone','Europe/Paris')),convert_to('%PDF-first','UTF8')) notice;
SELECT ok(current_meeting_notice_id(test_uuid('preparation:meeting')) IS NOT NULL,'generated PDF enables the notice precondition');
SELECT hall_api.schedule_council_meeting(test_uuid('preparation:meeting'),'2026-01-01 18:00Z','New chamber');
SELECT throws_ok($$SELECT hall_api.generate_meeting_notice(test_uuid('preparation:meeting'),(SELECT notice->'facts' FROM notice_versions LIMIT 1),convert_to('%PDF-stale','UTF8'))$$,'HV805',NULL,'generation refuses stale facts after properties change');
SELECT ok(current_meeting_notice_id(test_uuid('preparation:meeting')) IS NULL,'property change leaves old bytes intact but makes the notice stale');
SELECT throws_ok($$SELECT start_council_meeting(test_uuid('preparation:meeting'),'2026-01-01 18:00Z')$$,'HV807',NULL,'stale PDF cannot satisfy the start gate');
SELECT hall_api.reopen_council_agenda(test_uuid('preparation:meeting'));
SELECT lives_ok($$SELECT hall_api.deprogram_council_agenda_item((SELECT id FROM preparation WHERE key='quick-item'))$$,'explicit reopening permits composition changes');
SELECT hall_api.freeze_council_agenda(test_uuid('preparation:meeting'));
INSERT INTO notice_versions SELECT hall_api.generate_meeting_notice(test_uuid('preparation:meeting'),jsonb_build_object('meeting',hall.meeting_notice_meeting_facts(test_uuid('preparation:meeting')),'hall',jsonb_build_object('name','Commune','timeZone','Europe/Paris')),convert_to('%PDF-second','UTF8'));
-- HALL-FR-NOT-030: previous versions remain immutable.
SELECT throws_ok($$DELETE FROM meeting_notice$$,'HV802',NULL,'notice history cannot be deleted');
SELECT is((SELECT array_agg(version ORDER BY version) FROM meeting_notice WHERE council_meeting=test_uuid('preparation:meeting')),ARRAY[1,2],'regeneration appends version two');
SELECT is((SELECT convert_from(stored.content,'UTF8') FROM meeting_notice notice JOIN binary_object stored ON stored.id=notice.binary_object WHERE notice.council_meeting=test_uuid('preparation:meeting') AND notice.version=1),'%PDF-first','old PDF bytes are retained unchanged');
SELECT is((SELECT count(*)::int FROM council_agenda_freeze WHERE council_meeting=test_uuid('preparation:meeting')),2,'both frozen agenda versions survive reopening');
SELECT lives_ok($$SELECT start_council_meeting(test_uuid('preparation:meeting'),'2026-01-01 18:00Z')$$,'current PDF and valid opening facts permit start');
SELECT throws_ok($$SELECT hall_api.reopen_council_agenda(test_uuid('preparation:meeting'))$$,'HV808',NULL,'started meeting cannot reopen preparation');
SELECT is((SELECT count(*)::int FROM minutes),0,'preparation and start do not create the current meeting minutes');
SELECT * FROM finish();
ROLLBACK;
