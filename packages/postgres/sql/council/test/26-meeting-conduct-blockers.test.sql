-- @verifies-requirement HALL-FR-AGI-390
-- explain unavailable conduct actions from current meeting facts.
BEGIN;
SET LOCAL search_path=hall,public,pg_catalog;
SET LOCAL hall.roles='["administrator"]';
\ir support/helpers.sql
SELECT no_plan();
INSERT INTO council_meetings(id,number,scheduled_at,location)
VALUES(test_uuid('rail:meeting'),1,'2026-01-01 18:00Z','Council chamber');
SELECT is(hall_api.meeting_conduct(test_uuid('rail:meeting'))#>'{meetingActionBlockers,recordAttendanceEvents}','[{"code":"meetingNotStarted"}]'::jsonb,'movements explain why opening must precede them');
SELECT is(hall_api.meeting_conduct(test_uuid('rail:meeting'))#>'{meetingActionBlockers,addAgendaItem}','[{"code":"meetingNotStarted"}]'::jsonb,'addition requires an opened meeting');
SELECT test_ensure_council_member(test_uuid('rail:member'));
INSERT INTO meeting_attendance(id,council_member,council_meeting,status) VALUES(test_uuid('rail:attendance'),test_uuid('rail:member'),test_uuid('rail:meeting'),'present');
SELECT test_designate_present_officers(test_uuid('rail:meeting'));
SELECT test_prepare_notice(test_uuid('rail:meeting'));
SELECT is(hall_api.meeting_conduct(test_uuid('rail:meeting'))#>'{meetingActionBlockers,addAgendaItem}','[{"code":"meetingNotStarted"}]'::jsonb,'a frozen preparation still requires meeting opening');
SELECT start_council_meeting(test_uuid('rail:meeting'),'2026-01-01 18:00Z');
SELECT is(hall_api.meeting_conduct(test_uuid('rail:meeting'))#>'{meetingActionBlockers,recordAttendanceEvents}','[]'::jsonb,'ongoing meeting enables attendance movements');
SELECT is(hall_api.meeting_conduct(test_uuid('rail:meeting'))->'canRecordAttendanceEvents','true'::jsonb,'attendance capability derives from the same empty reasons');
SELECT close_council_meeting(test_uuid('rail:meeting'),'2026-01-01 19:00Z');
SELECT is(hall_api.meeting_conduct(test_uuid('rail:meeting'))#>'{meetingActionBlockers,recordAttendanceEvents}','[{"code":"meetingClosed"}]'::jsonb,'closed meeting explains unavailable attendance movements');
SELECT is(hall_api.meeting_conduct(test_uuid('rail:meeting'))->'canRecordAttendanceEvents','false'::jsonb,'closed capability agrees with reasons');
SELECT * FROM finish();
ROLLBACK;
