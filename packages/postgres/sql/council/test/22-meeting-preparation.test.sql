-- Preparation regression: real named commands, retained deprogramming facts,
-- agenda revision cycle (establishment with the notice, revision, reset), versioning and start gate. PDF bytes here are storage fixtures;
-- meetingNoticesPostgres.test.ts separately verifies real Chromium and EML.
BEGIN;
SET LOCAL search_path=hall,public,pg_catalog;
SET LOCAL hall.roles='["administrator"]';
\ir support/helpers.sql
SELECT no_plan();
-- @verifies-requirement HALL-FR-NOT-110
-- @verifies-requirement HALL-TR-NOT-020
-- SQL calendar dates, not elapsed hours.
SELECT is(hall.notice_clear_day_deadline('2026-09-11 18:00Z','Europe/Paris',3),DATE '2026-09-07','three clear days exclude transmission and meeting dates');
SELECT is(hall.notice_clear_day_deadline('2026-09-11 18:00Z','Europe/Paris',5),DATE '2026-09-05','five clear days can end on Saturday without workday extension');
SELECT is(hall.notice_clear_day_deadline('2026-03-31 18:00Z','Europe/Paris',3),DATE '2026-03-27','DST does not change the calendar subtraction');
CREATE TEMP TABLE preparation(key text PRIMARY KEY,id uuid);
INSERT INTO council_meetings(id,number,scheduled_at,location) VALUES(test_uuid('preparation:meeting'),1,'2026-01-01 18:00Z','Council chamber');
SELECT throws_ok($$SELECT hall_api.freeze_council_agenda(test_uuid('preparation:meeting'))$$,'HV803',NULL,'an empty agenda revision cannot be established');
SELECT throws_ok($$SELECT hall_api.generate_meeting_notice(test_uuid('preparation:meeting'),'{}'::jsonb,convert_to('%PDF-before','UTF8'))$$,'HV803',NULL,'the notice of an empty open revision is refused');
SELECT is(hall_api.meeting_notice_draft_facts(test_uuid('preparation:meeting')),NULL,'an empty open revision has no notice facts');
SELECT test_ensure_council_member(test_uuid('preparation:member'));
INSERT INTO meeting_attendance(id,council_member,council_meeting,status) VALUES(test_uuid('preparation:attendance'),test_uuid('preparation:member'),test_uuid('preparation:meeting'),'present');
SELECT set_council_meeting_officers(test_uuid('preparation:meeting'),test_uuid('preparation:member'),test_uuid('preparation:member'));
SELECT test_confirm_declared_membership(test_uuid('preparation:meeting'));
INSERT INTO preparation VALUES('business',(hall_api.create_council_business('seed','Preparation regression','Report','Evidence')->>'id')::uuid);
-- @verifies-requirement HALL-FR-AGI-010
-- the database rejects an affair without a prepared subject.
SELECT throws_ok($$INSERT INTO council_agenda_item(id,council_business,council_meeting,position)
  VALUES(gen_random_uuid(),(SELECT id FROM preparation WHERE key='business'),test_uuid('preparation:meeting'),1)$$,
  '23514','new row for relation "council_agenda_item" violates check constraint "council_agenda_item_one_subject"',
  'an affair alone is rejected by the structural exactly-one-subject constraint');
SELECT is(enum_range(NULL::hall.council_agenda_subject_kind)::text[],ARRAY['minutesApproval','councilDecisionProposal','openQuestion'],
  'only the three supported subject kinds exist');
INSERT INTO preparation SELECT 'proposal',(hall_api.create_prepared_council_subject(id,'councilDecisionProposal','Budget proposal','Original proposed text')->>'id')::uuid FROM preparation WHERE key='business';
SELECT ok(
  hall_api.open_prepared_council_subject((SELECT id FROM preparation WHERE key='proposal'),'councilDecisionProposal') ? 'createdAt',
  'prepared subject projection exposes its creation date for newest-first presentation'
);
SELECT is(
  jsonb_array_length(hall_api.list_prepared_council_subjects(NULL,(SELECT id FROM preparation WHERE key='business'))),
  1,
  'prepared subjects can be loaded for one council business only'
);
-- @verifies-requirement HALL-FR-BUS-050
-- prepared identity already belongs to its business.
SELECT throws_ok($$UPDATE council_decision_proposal SET council_business=gen_random_uuid() WHERE id=(SELECT id FROM preparation WHERE key='proposal')$$,'HV809',NULL,'prepared business identity cannot change');
INSERT INTO preparation SELECT 'proposal-item',(hall_api.schedule_prepared_council_subject(test_uuid('preparation:meeting'),id,'councilDecisionProposal',1)->>'id')::uuid FROM preparation WHERE key='proposal';
INSERT INTO preparation SELECT 'question-'||n,(hall_api.create_prepared_council_subject((SELECT id FROM preparation WHERE key='business'),'openQuestion','Question '||n,'Question content '||n)->>'id')::uuid FROM generate_series(2,5)n;
INSERT INTO preparation SELECT key||'-item',(hall_api.schedule_prepared_council_subject(test_uuid('preparation:meeting'),id,'openQuestion',right(key,1)::int)->>'id')::uuid FROM preparation WHERE key IN('question-2','question-3','question-4','question-5') ORDER BY key;
SELECT is((SELECT array_agg(position ORDER BY position) FROM council_agenda_item WHERE council_meeting=test_uuid('preparation:meeting')),ARRAY[1,2,3,4,5],'both prepared natures form an ordered agenda');
SELECT throws_ok($$SELECT hall_api.schedule_prepared_council_subject(test_uuid('preparation:meeting'),(SELECT id FROM preparation WHERE key='proposal'),'councilDecisionProposal',1)$$,'HV810',NULL,'duplicate prepared occurrence is refused');
SELECT throws_ok($$SELECT hall_api.schedule_prepared_council_subject(test_uuid('preparation:meeting'),gen_random_uuid(),'openQuestion',1)$$,'HV910',NULL,'unknown prepared subject is refused');
SELECT hall_api.deprogram_council_agenda_item((SELECT id FROM preparation WHERE key='question-5-item'));
SELECT is((SELECT array_agg(position ORDER BY abs(position)) FROM council_agenda_item WHERE council_meeting=test_uuid('preparation:meeting')),ARRAY[1,2,3,4,-5],'exact live failure fixture retains the withdrawn question at minus five');
-- @verifies-requirement HALL-FR-AGI-380
-- the quick-create command must use the same insertion authority.
SELECT lives_ok($$INSERT INTO preparation SELECT 'quick-item',(hall_api.create_and_schedule_open_question('seed','New question','Report','',test_uuid('preparation:meeting'),5)#>>'{agendaItem,id}')::uuid$$,'quick creation at five shifts the withdrawn occurrence instead of raising 23505');
SELECT is((SELECT array_agg(position ORDER BY abs(position)) FROM council_agenda_item WHERE council_meeting=test_uuid('preparation:meeting')),ARRAY[1,2,3,4,5,-6],'new question occupies five and old occurrence survives at minus six');
SELECT is((SELECT content FROM text_resource WHERE id=(SELECT text_resource FROM open_question_workspace WHERE open_question=(SELECT id FROM preparation WHERE key='question-5'))),'Question content 5','withdrawal and shifting preserve the original question text');
SELECT is((hall_api.schedule_prepared_council_subject(test_uuid('preparation:meeting'),(SELECT id FROM preparation WHERE key='question-5'),'openQuestion',5)->>'id')::uuid,(SELECT id FROM preparation WHERE key='question-5-item'),'reinscription reuses the same occurrence identity');
SELECT is((SELECT count(*)::int FROM council_agenda_item WHERE open_question=(SELECT id FROM preparation WHERE key='question-5')),1,'reinscription creates no duplicate subject occurrence');
SELECT lives_ok($$SELECT hall_api.reorder_council_agenda(test_uuid('preparation:meeting'),ARRAY(SELECT id FROM council_agenda_item WHERE council_meeting=test_uuid('preparation:meeting') AND position>0 ORDER BY CASE WHEN position<=2 THEN position ELSE 9-position END))$$,'reordering questions succeeds atomically');
-- @verifies-requirement HALL-FR-NOT-090
-- an established revision is mandatory at start.
SELECT throws_ok($$SELECT start_council_meeting(test_uuid('preparation:meeting'),'2026-01-01 18:00Z')$$,'HV811',NULL,'an otherwise ready meeting cannot start on an open revision');
SELECT is(hall.council_agenda_revision_projection(test_uuid('preparation:meeting')),'{"number":1,"establishedAt":null,"noticeId":null}'::jsonb,'a meeting starts on revision one, open');
-- @verifies-requirement HALL-FR-NOT-050
-- @verifies-requirement HALL-FR-NOT-160
-- generating the notice establishes the open revision in the same transaction.
SELECT throws_ok($$SELECT hall_api.generate_meeting_notice(test_uuid('preparation:meeting'),jsonb_build_object('meeting',hall_api.meeting_notice_draft_facts(test_uuid('preparation:meeting')),'hall',jsonb_build_object('name','Commune','timeZone','Europe/Paris')),convert_to('not PDF','UTF8'))$$,'HV806',NULL,'artifact must contain PDF bytes');
SELECT is((SELECT count(*)::int FROM council_agenda_freeze WHERE council_meeting=test_uuid('preparation:meeting')),0,'a refused notice establishes no revision');
CREATE TEMP TABLE notice_versions AS SELECT hall_api.generate_meeting_notice(test_uuid('preparation:meeting'),jsonb_build_object('meeting',hall_api.meeting_notice_draft_facts(test_uuid('preparation:meeting')),'hall',jsonb_build_object('name','Commune','timeZone','Europe/Paris')),convert_to('%PDF-first','UTF8')) notice;
SELECT is((SELECT notice->>'revision' FROM notice_versions),'1','the first notice belongs to revision one');
SELECT is(hall.council_agenda_revision_projection(test_uuid('preparation:meeting'))->>'noticeId',(SELECT notice->>'id' FROM notice_versions),'the established revision designates its notice');
-- @verifies-requirement HALL-FR-NOT-010
-- @verifies-requirement HALL-FR-NOT-140
SELECT is((SELECT jsonb_build_object('scheduledAt',scheduled_at,'location',location,'points',jsonb_array_length(agenda)) FROM active_council_agenda_freeze WHERE council_meeting=test_uuid('preparation:meeting')),
  jsonb_build_object('scheduledAt','2026-01-01 18:00Z'::timestamptz,'location','Council chamber','points',6),'the established revision records its points, date and location');
-- @verifies-requirement HALL-FR-NOT-020
SELECT throws_ok($$SELECT hall_api.deprogram_council_agenda_item((SELECT id FROM preparation WHERE key='quick-item'))$$,'HV801',NULL,'an established revision rejects removal');
SELECT throws_ok($$SELECT hall_api.schedule_prepared_council_subject(test_uuid('preparation:meeting'),(SELECT id FROM preparation WHERE key='proposal'),'councilDecisionProposal',1)$$,'HV801',NULL,'an established revision rejects insertion before any duplicate branch');
SELECT throws_ok($$SELECT hall_api.schedule_council_meeting(test_uuid('preparation:meeting'),'2026-01-02 18:00Z','Council chamber')$$,'HV801',NULL,'an established revision keeps its date');
SELECT throws_ok($$SELECT hall_api.schedule_council_meeting(test_uuid('preparation:meeting'),'2026-01-01 18:00Z','New chamber')$$,'HV801',NULL,'an established revision keeps its location');
SELECT lives_ok($$SELECT hall_api.set_council_meeting_officers(test_uuid('preparation:meeting'),test_uuid('preparation:member'),test_uuid('preparation:member'))$$,'officers remain designable under an established revision');
-- the PDF is regenerated under the same revision.
INSERT INTO notice_versions SELECT hall_api.generate_meeting_notice(test_uuid('preparation:meeting'),jsonb_build_object('meeting',hall_api.meeting_notice_draft_facts(test_uuid('preparation:meeting')),'hall',jsonb_build_object('name','Commune','timeZone','Europe/Paris')),convert_to('%PDF-first-again','UTF8'));
SELECT is((SELECT count(DISTINCT agenda_freeze)::int FROM meeting_notice WHERE council_meeting=test_uuid('preparation:meeting')),1,'regeneration keeps the established revision');
SELECT is((SELECT jsonb_agg(jsonb_build_object('revision',entry->'revision','version',entry->'version')) FROM jsonb_array_elements(hall_api.list_meeting_notices(test_uuid('preparation:meeting'))) entry),
  '[{"revision":1,"version":2}]'::jsonb,'the notice list shows the last PDF of each revision');
-- @verifies-requirement HALL-FR-NOT-100
SELECT hall_api.reopen_council_agenda(test_uuid('preparation:meeting'));
SELECT is(hall.council_agenda_revision_projection(test_uuid('preparation:meeting')),'{"number":2,"establishedAt":null,"noticeId":null}'::jsonb,'revising opens revision two');
SELECT is(hall_api.open_council_meeting(test_uuid('preparation:meeting'))->'entryBlockers','[{"code":"agendaRevisionOpen"}]'::jsonb,'an open revision blocks meeting entry');
SELECT lives_ok($$SELECT hall_api.deprogram_council_agenda_item((SELECT id FROM preparation WHERE key='quick-item'))$$,'an open revision permits composition changes');
SELECT lives_ok($$SELECT hall_api.reorder_council_agenda(test_uuid('preparation:meeting'),ARRAY(SELECT id FROM council_agenda_item WHERE council_meeting=test_uuid('preparation:meeting') AND position>0 ORDER BY position DESC))$$,'an open revision permits reordering');
SELECT hall_api.schedule_council_meeting(test_uuid('preparation:meeting'),'2026-01-03 18:00Z','New chamber');
-- @verifies-requirement HALL-FR-NOT-150
-- reset brings back points, positions, date and location of the last established revision.
CREATE TEMP TABLE established_positions AS SELECT (entry->>'id')::uuid id,(entry->>'position')::int position FROM council_agenda_freeze, jsonb_array_elements(agenda) entry WHERE council_meeting=test_uuid('preparation:meeting');
SELECT hall_api.reset_council_agenda_revision(test_uuid('preparation:meeting'));
SELECT is((SELECT array_agg(item.position ORDER BY item.id) FROM council_agenda_item item WHERE item.council_meeting=test_uuid('preparation:meeting') AND item.position>0),
  (SELECT array_agg(position ORDER BY id) FROM established_positions),'reset restores the programmed points and their positions');
SELECT is((SELECT jsonb_build_object('scheduledAt',scheduled_at,'location',location) FROM council_meetings WHERE id=test_uuid('preparation:meeting')),
  jsonb_build_object('scheduledAt','2026-01-01 18:00Z'::timestamptz,'location','Council chamber'),'reset restores date and location');
SELECT is(hall.council_agenda_revision_projection(test_uuid('preparation:meeting'))->>'number','2','the agenda stays on the open revision after reset');
SELECT throws_ok($$SELECT hall_api.reset_council_agenda_revision(gen_random_uuid())$$,'HV901',NULL,'reset requires a known meeting');
INSERT INTO council_meetings(id,number) VALUES(test_uuid('preparation:other'),2);
SELECT reprogram_council_agenda_item((SELECT id FROM preparation WHERE key='quick-item'),test_uuid('preparation:other'),1);
SELECT throws_ok($$SELECT hall_api.reset_council_agenda_revision(test_uuid('preparation:meeting'))$$,'HV813',NULL,'a point moved to another meeting makes reset fail');
SELECT reprogram_council_agenda_item(id,test_uuid('preparation:meeting'),position) FROM established_positions WHERE id=(SELECT id FROM preparation WHERE key='quick-item');
INSERT INTO notice_versions SELECT hall_api.generate_meeting_notice(test_uuid('preparation:meeting'),jsonb_build_object('meeting',hall_api.meeting_notice_draft_facts(test_uuid('preparation:meeting')),'hall',jsonb_build_object('name','Commune','timeZone','Europe/Paris')),convert_to('%PDF-second','UTF8'));
SELECT is((SELECT notice->>'revision' FROM notice_versions ORDER BY (notice->>'version')::int DESC LIMIT 1),'2','the next notice belongs to revision two');
-- @verifies-requirement HALL-FR-NOT-030
-- previous versions remain immutable.
SELECT throws_ok($$DELETE FROM meeting_notice$$,'HV802',NULL,'notice history cannot be deleted');
SELECT is((SELECT array_agg(version ORDER BY version) FROM meeting_notice WHERE council_meeting=test_uuid('preparation:meeting')),ARRAY[1,2,3],'each generation appends a version');
SELECT is((SELECT convert_from(stored.content,'UTF8') FROM meeting_notice notice JOIN binary_object stored ON stored.id=notice.binary_object WHERE notice.council_meeting=test_uuid('preparation:meeting') AND notice.version=1),'%PDF-first','old PDF bytes are retained unchanged');
SELECT is((SELECT count(*)::int FROM council_agenda_freeze WHERE council_meeting=test_uuid('preparation:meeting')),2,'both established revisions survive revision');
SELECT is(jsonb_array_length(hall_api.list_meeting_notices(test_uuid('preparation:meeting'))),2,'one notice is listed per established revision');
SELECT lives_ok($$SELECT start_council_meeting(test_uuid('preparation:meeting'),'2026-01-01 18:00Z')$$,'an established revision permits start');
SELECT throws_ok($$SELECT hall_api.reopen_council_agenda(test_uuid('preparation:meeting'))$$,'HV808',NULL,'started meeting cannot open another revision');
SELECT is((SELECT count(*)::int FROM minutes),0,'preparation and start do not create the current meeting minutes');
SELECT * FROM finish();
ROLLBACK;
