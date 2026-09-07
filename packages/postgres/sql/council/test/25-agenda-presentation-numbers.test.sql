-- HALL-FR-AGI-400: one presentation sequence across API, frozen notice and minutes.
BEGIN;
SET LOCAL search_path=hall,public,pg_catalog;
SET LOCAL hall.roles='["administrator"]';
\ir support/helpers.sql
SELECT no_plan();
INSERT INTO council_meetings(id,number,scheduled_at,location)
VALUES(test_uuid('numbers:meeting'),1,'2026-01-01 18:00Z','Council chamber');
CREATE TEMP TABLE numbered_items AS
SELECT n, (hall_api.create_and_schedule_open_question('seed','Question '||n,'Report','',test_uuid('numbers:meeting'),n)#>>'{agendaItem,id}')::uuid id
FROM generate_series(1,6) n;
SELECT hall_api.deprogram_council_agenda_item((SELECT id FROM numbered_items WHERE n=5));
SELECT is((hall_api.open_council_agenda_item((SELECT id FROM numbered_items WHERE n=5))->>'agendaNumber'),NULL,'withdrawn item has no presentation number');
SELECT is((SELECT array_agg(position ORDER BY abs(position)) FROM council_agenda_item WHERE council_meeting=test_uuid('numbers:meeting')),ARRAY[1,2,3,4,-5,6],'withdrawal preserves technical positions');
SELECT is((hall_api.open_council_agenda_item((SELECT id FROM numbered_items WHERE n=6))->>'agendaNumber')::int,5,'technical position six is presented as number five');
SELECT hall_api.reorder_council_agenda(test_uuid('numbers:meeting'),ARRAY(SELECT id FROM numbered_items WHERE n<>5 ORDER BY n DESC));
SELECT is((SELECT array_agg((item->>'agendaNumber')::int ORDER BY (item->>'position')::int) FROM jsonb_array_elements(hall_api.list_council_agenda(test_uuid('numbers:meeting'))) item WHERE (item->>'position')::int>0),ARRAY[1,2,3,4,5],'reordered agenda remains continuously numbered');
SELECT is((hall_api.open_council_agenda_item((SELECT id FROM numbered_items WHERE n=1))->>'agendaNumber')::int,5,'numbers follow the reordered identities');
SELECT is((SELECT array_agg(position ORDER BY abs(position)) FROM council_agenda_item WHERE council_meeting=test_uuid('numbers:meeting')),ARRAY[1,2,3,4,-5,6],'reordering keeps the gap in technical positions');
CREATE TEMP TABLE expected_numbers AS SELECT jsonb_agg(jsonb_build_object('id',item->>'id','agendaNumber',item->'agendaNumber') ORDER BY (item->>'agendaNumber')::int) items
FROM jsonb_array_elements(hall_api.list_council_agenda(test_uuid('numbers:meeting'))) item WHERE item->>'agendaNumber' IS NOT NULL;
SELECT hall_api.freeze_council_agenda(test_uuid('numbers:meeting'));
SELECT is((SELECT jsonb_agg(jsonb_build_object('id',item->>'id','agendaNumber',item->'agendaNumber') ORDER BY (item->>'agendaNumber')::int) FROM jsonb_array_elements(hall.meeting_notice_meeting_facts(test_uuid('numbers:meeting'))->'agenda') item),(SELECT items FROM expected_numbers),'frozen notice has exactly the same identities and numbers');
SELECT test_ensure_council_member(test_uuid('numbers:member'));
INSERT INTO meeting_attendance(id,council_member,council_meeting,status) VALUES(test_uuid('numbers:attendance'),test_uuid('numbers:member'),test_uuid('numbers:meeting'),'present');
SELECT test_designate_present_officers(test_uuid('numbers:meeting'));
SELECT test_prepare_notice(test_uuid('numbers:meeting'));
SELECT start_council_meeting(test_uuid('numbers:meeting'),'2026-01-01 18:00Z');
SELECT adjourn_council_agenda_item((SELECT id FROM numbered_items WHERE n=6),'2026-01-01 18:01Z');
SELECT is((hall_api.open_council_agenda_item((SELECT id FROM numbered_items WHERE n=6))->>'agendaNumber')::int,1,'adjourned point remains part of the presented agenda');
SELECT close_council_meeting(test_uuid('numbers:meeting'),'2026-01-01 19:00Z');
SELECT is((SELECT jsonb_agg(jsonb_build_object('id',item->>'id','agendaNumber',item->'agendaNumber') ORDER BY (item->>'agendaNumber')::int) FROM minutes m,jsonb_array_elements(m.facts->'agenda') item WHERE m.council_meeting=test_uuid('numbers:meeting')),(SELECT items FROM expected_numbers),'minutes preserve the same identities and numbers after carry-over');
SELECT is((SELECT jsonb_agg(jsonb_build_object('id',item->>'id','agendaNumber',item->'agendaNumber') ORDER BY (item->>'agendaNumber')::int) FROM jsonb_array_elements(hall_api.list_council_agenda(test_uuid('numbers:meeting'))) item),(SELECT items FROM expected_numbers),'closed live API uses the closing snapshot after working rows move');
SELECT * FROM finish();
ROLLBACK;
