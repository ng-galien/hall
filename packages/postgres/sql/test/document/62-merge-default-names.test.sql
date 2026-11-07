BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
SET LOCAL hall.roles = '["administrator"]';
\ir ../../council/test/support/helpers.sql
SELECT no_plan();

-- @verifies-requirement HALL-FR-BUS-090
-- Default names: the report is named « Rapport » and the question text takes
-- the business name; the kept report receives the next free business name.
CREATE TEMP TABLE scenario AS
SELECT (provision_initial_council_meeting()).id AS meeting,
  (hall_api.create_council_business('', 'Voirie', 'Rapport', 'Texte du rapport')->>'id')::UUID AS absorbed,
  (hall_api.create_council_business('', 'Travaux', 'Rapport', 'Texte d''arrivée')->>'id')::UUID AS target;
INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
SELECT test_uuid('merge-default:attendance'), test_uuid('merge-default:member'), meeting, 'present' FROM scenario;
SELECT set_council_meeting_officers(meeting, test_uuid('merge-default:member'), test_uuid('merge-default:member')) FROM scenario;
SELECT test_confirm_declared_membership(meeting) FROM scenario;
SELECT schedule_council_meeting(meeting, '2026-01-01 09:00Z', 'Chamber') FROM scenario;
CREATE TEMP TABLE question AS SELECT schedule_open_question(absorbed, meeting, 1) AS item FROM scenario;
CREATE TEMP TABLE texts AS SELECT
  (SELECT report_resource FROM council_business_workspace JOIN scenario ON council_business = absorbed) AS report,
  (SELECT workspace.text_resource FROM open_question_workspace workspace JOIN scenario ON workspace.council_business = absorbed) AS question_text;
SELECT is((SELECT name FROM resource JOIN texts ON resource.id = question_text), 'Voirie', 'the question text takes the business name by default');
SELECT test_prepare_notice(meeting) FROM scenario;
SELECT start_council_meeting(meeting, '2026-01-01 09:00Z') FROM scenario;
SELECT close_council_meeting(meeting, '2026-01-01 10:00Z') FROM scenario;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
CREATE TEMP TABLE snapshots_before AS SELECT council_meeting, phase, payload FROM council_meeting_snapshot;

SELECT is((SELECT hall_api.merge_council_business(absorbed, target, true)->'blockers' FROM scenario), '[]'::jsonb,
  'a business presented at a meeting with default names can be merged');
SELECT is((SELECT hall_api.merge_council_business(absorbed, target, true)#>'{report,movedTo}' FROM scenario),
  '{"folderPath": "Travaux", "name": "Voirie (2)"}'::jsonb, 'the preview announces the next free business name for the kept report');
SELECT lives_ok($$SELECT hall_api.merge_council_business(absorbed, target, false) FROM scenario$$, 'the merge is applied');
SELECT is((SELECT full_path FROM resource JOIN texts ON resource.id = question_text), 'Travaux/Voirie', 'the question text moves under its name');
SELECT is((SELECT full_path FROM resource JOIN texts ON resource.id = report), 'Travaux/Voirie (2)', 'the kept report moves under the next free name');
SELECT set_eq($$SELECT council_meeting, phase, payload FROM council_meeting_snapshot$$,
  $$SELECT council_meeting, phase, payload FROM snapshots_before$$, 'the meeting snapshots are unchanged');

SELECT * FROM finish();
ROLLBACK;
