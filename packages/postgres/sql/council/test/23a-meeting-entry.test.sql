BEGIN;
SET LOCAL search_path=hall,public,pg_catalog;
SET LOCAL hall.roles='["administrator"]';
\ir support/helpers.sql
SELECT no_plan();
INSERT INTO council_meetings(id,number) VALUES(test_uuid('entry:meeting'),1);
SELECT is(hall_api.open_council_meeting(test_uuid('entry:meeting'))->'entryBlockers',
 '[{"code":"meetingNotScheduled"},{"code":"meetingLocationMissing"},{"code":"agendaNotFrozen"},{"code":"currentNoticeMissing"}]'::jsonb,
 'all missing preparation conditions are enumerated before attendance');
SELECT hall.schedule_council_meeting(test_uuid('entry:meeting'),statement_timestamp()+interval '1 day','Chamber');
SELECT is(hall_api.meeting_conduct(test_uuid('entry:meeting'))#>'{meeting,entryBlockers}',
 '[{"code":"agendaNotFrozen"},{"code":"currentNoticeMissing"}]'::jsonb,'scheduled unprepared meeting reports freeze and notice in conduct');
SELECT ok(hall_api.open_council_meeting(test_uuid('entry:meeting'))->'openingBlockers' @> '[{"code":"scheduledTimeNotReached"}]'::jsonb,
 'opening reports the existing scheduled-time guard');
SELECT hall_api.create_and_schedule_open_question('seed','Entry fixture','Report','',test_uuid('entry:meeting'),1);
SELECT hall_api.freeze_council_agenda(test_uuid('entry:meeting'));
SELECT is(hall_api.open_council_meeting(test_uuid('entry:meeting'))->'entryBlockers','[{"code":"currentNoticeMissing"}]'::jsonb,'freezing alone is insufficient');
SELECT hall_api.generate_meeting_notice(test_uuid('entry:meeting'),jsonb_build_object('meeting',hall.meeting_notice_meeting_facts(test_uuid('entry:meeting')),'hall',jsonb_build_object('name','Commune','timeZone','Europe/Paris')),convert_to('%PDF-entry','UTF8'));
SELECT is(hall_api.open_council_meeting(test_uuid('entry:meeting'))->'entryBlockers','[]'::jsonb,'ready meeting permits entry before attendance and officers');
SELECT is(jsonb_array_length(hall_api.open_council_meeting(test_uuid('entry:meeting'))->'openingBlockers'),1,'future time only blocks opening, not entry');
SELECT hall.schedule_council_meeting(test_uuid('entry:meeting'),statement_timestamp()-interval '1 day','Chamber');
SELECT is(hall_api.open_council_meeting(test_uuid('entry:meeting'))->'entryBlockers','[{"code":"currentNoticeMissing"}]'::jsonb,'rescheduling invalidates the current notice');
SELECT hall_api.generate_meeting_notice(test_uuid('entry:meeting'),jsonb_build_object('meeting',hall.meeting_notice_meeting_facts(test_uuid('entry:meeting')),'hall',jsonb_build_object('name','Commune','timeZone','Europe/Paris')),convert_to('%PDF-entry-new','UTF8'));
SELECT is(hall_api.open_council_meeting(test_uuid('entry:meeting'))->'openingBlockers','[]'::jsonb,'ready current meeting exposes the opening command without requiring persisted call');
SELECT hall_api.reopen_council_agenda(test_uuid('entry:meeting'));
SELECT is(hall_api.open_council_meeting(test_uuid('entry:meeting'))->'entryBlockers','[{"code":"agendaNotFrozen"},{"code":"currentNoticeMissing"}]'::jsonb,'reopening restores preparation blockers');
SELECT * FROM finish();
ROLLBACK;
