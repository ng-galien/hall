BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
SET LOCAL hall.roles = '["administrator"]';
\ir ../../council/test/support/helpers.sql
SELECT no_plan();
-- @verifies-requirement HALL-FR-WSP-450
CREATE TEMP TABLE scenario AS SELECT
  (hall.provision_initial_council_meeting()).id meeting,
  create_council_business_workspace('', 'empty', 'report', 'Report') empty_business,
  create_council_business_workspace('', 'examined', 'report', 'Report') examined_business,
  create_council_business_workspace('', 'filled', 'report', 'Report') filled_business;
SELECT create_document_resource('filled', 'kept', 'application/pdf', convert_to('PDF','UTF8'));
CREATE TEMP TABLE folders AS SELECT workspace.council_business business, folder.id
FROM council_business_workspace workspace JOIN resource folder ON folder.folder_resource_id = workspace.folder_resource;

SELECT schedule_council_meeting(meeting,'2026-01-01 09:00Z','Chamber') FROM scenario;
SELECT schedule_open_question(examined_business,meeting,1) FROM scenario;
INSERT INTO meeting_attendance(id,council_member,council_meeting,status)
SELECT test_uuid('offer:attendance'),test_uuid('offer:member'),meeting,'present' FROM scenario;
SELECT test_designate_present_officers(meeting) FROM scenario;
SELECT freeze_council_agenda(meeting) FROM scenario;
SELECT test_prepare_notice(meeting) FROM scenario;
UPDATE council_meetings SET started_at='2026-01-01 09:05Z' WHERE id=(SELECT meeting FROM scenario);

SELECT is(deletable_council_businesses(ARRAY[empty_business, examined_business, filled_business]),
  jsonb_build_array(empty_business),
  'only the business without dependency and with only its report in its folder is offered for deletion')
FROM scenario;
SELECT is(deletable_council_businesses(ARRAY[]::uuid[]), '[]'::jsonb, 'no candidate, no deletable business');
SELECT ok(NOT resource_siren_actions(resource_detail(id)) @> '[{"name":"resource.delete"}]',
  'the folder of a council business never offers its deletion') FROM folders ORDER BY business;
SELECT throws_ok(format('SELECT delete_resource(%L::uuid)', id), 'HV714',
  'a council business folder is deleted only with its council business',
  'deleting the folder of a council business is refused by name') FROM folders, scenario WHERE business = examined_business;
SELECT throws_ok($$SELECT delete_council_business(examined_business) FROM scenario$$, '23503', NULL,
  'deleting a business examined in a meeting is still refused');
SELECT throws_ok($$SELECT delete_council_business(filled_business) FROM scenario$$, '23503', NULL,
  'deleting a business whose folder holds another document is still refused');
SELECT lives_ok($$SELECT delete_council_business(empty_business) FROM scenario$$,
  'the business offered for deletion is deleted');
SELECT * FROM finish();
ROLLBACK;
