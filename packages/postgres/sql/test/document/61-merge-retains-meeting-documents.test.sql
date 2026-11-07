BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
SET LOCAL hall.roles = '["administrator"]';
\ir ../../council/test/support/helpers.sql
SELECT no_plan();

-- @verifies-requirement HALL-FR-BUS-090
-- @verifies-requirement HALL-FR-MIN-160
-- A business presented at a meeting merges into another one: the documents
-- referenced by the meeting snapshot are moved, never deleted.
CREATE TEMP TABLE scenario AS
SELECT (provision_initial_council_meeting()).id AS meeting,
  (hall_api.create_council_business('', 'Absorbed affair', 'Absorbed report', 'Absorbed evidence')->>'id')::UUID AS absorbed,
  (hall_api.create_council_business('', 'Target affair', 'Target report', 'Target evidence')->>'id')::UUID AS target;
CREATE TEMP TABLE absorbed_resources AS SELECT
  (SELECT report_resource FROM council_business_workspace JOIN scenario ON council_business = absorbed) AS report,
  (hall_api.create_document_resource('Absorbed affair', 'evidence.pdf', 'application/pdf', convert_to('Evidence bytes', 'UTF8'))->>'id')::UUID AS attachment;
SELECT hall_api.associate_council_business_resource(absorbed, attachment) FROM scenario, absorbed_resources;
INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
SELECT test_uuid('merge-retained:attendance'), test_uuid('merge-retained:member'), meeting, 'present' FROM scenario;
SELECT set_council_meeting_officers(meeting, test_uuid('merge-retained:member'), test_uuid('merge-retained:member')) FROM scenario;
SELECT test_confirm_declared_membership(meeting) FROM scenario;
SELECT schedule_council_meeting(meeting, '2026-01-01 09:00Z', 'Chamber') FROM scenario;
SELECT schedule_open_question(absorbed, meeting, 1) FROM scenario;
SELECT hall_api.rename_resource(workspace.text_resource, 'Absorbed question')
FROM open_question_workspace workspace JOIN scenario ON workspace.council_business = scenario.absorbed;
SELECT test_prepare_notice(meeting) FROM scenario;
SELECT start_council_meeting(meeting, '2026-01-01 09:00Z') FROM scenario;
SELECT close_council_meeting(meeting, '2026-01-01 10:00Z') FROM scenario;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
CREATE TEMP TABLE snapshots_before AS SELECT council_meeting, phase, payload FROM council_meeting_snapshot;

SELECT ok(meeting_snapshot_references_resource(report), 'the absorbed report is referenced by the meeting snapshot') FROM absorbed_resources;

-- Preview: the report fate announces the move, and its name must be free.
CREATE TEMP TABLE blocking AS SELECT (hall_api.create_text_resource('Target affair', 'Absorbed affair', 'Same name')->>'id')::UUID AS id;
SELECT ok((SELECT hall_api.merge_council_business(absorbed, target, true)->'blockers' ? 'nameTaken:Absorbed affair' FROM scenario),
  'the preview refuses the merge when the target folder already holds the absorbed business name');
SELECT hall_api.delete_resource(id) FROM blocking;
SELECT is((SELECT hall_api.merge_council_business(absorbed, target, true)->'report' FROM scenario),
  (SELECT jsonb_build_object('resourceId', report, 'name', 'Absorbed report', 'fate', 'appendedToTargetReportAndMoved',
    'movedTo', jsonb_build_object('folderPath', 'Target affair', 'name', 'Absorbed affair'),
    'targetReportResourceId', (SELECT report_resource FROM council_business_workspace JOIN scenario ON council_business = target),
    'heading', '# Absorbed affair') FROM absorbed_resources),
  'the preview announces that the referenced report is appended and moved under the absorbed business name');
SELECT is((SELECT jsonb_array_length(hall_api.merge_council_business(absorbed, target, true)->'blockers') FROM scenario), 0,
  'the preview has no blocker');

-- Application.
SELECT lives_ok($$SELECT hall_api.merge_council_business(absorbed, target, false) FROM scenario$$,
  'a business presented at a closed meeting merges into another one');
SELECT is((SELECT full_path FROM resource JOIN absorbed_resources ON resource.id = report), 'Target affair/Absorbed affair',
  'the referenced report is kept in the target folder under the absorbed business name');
SELECT is((SELECT content FROM text_resource JOIN absorbed_resources ON text_resource.id = report), 'Absorbed evidence',
  'the kept report keeps its text');
SELECT ok((SELECT content LIKE '%# Absorbed affair%Absorbed evidence%' FROM text_resource
  WHERE id = (SELECT report_resource FROM council_business_workspace JOIN scenario ON council_business = target)),
  'the absorbed report text is appended to the target report');
SELECT is((SELECT full_path FROM resource JOIN absorbed_resources ON resource.id = attachment), 'Target affair/evidence.pdf',
  'a document of the absorbed folder referenced by the snapshot is moved, not deleted');
SELECT ok(NOT EXISTS (SELECT FROM council_business JOIN scenario ON council_business.id = absorbed), 'the absorbed business is deleted');
SELECT ok(NOT EXISTS (SELECT FROM resource WHERE full_path = 'Absorbed affair'), 'the absorbed folder is deleted');
SELECT set_eq($$SELECT council_meeting, phase, payload FROM council_meeting_snapshot$$,
  $$SELECT council_meeting, phase, payload FROM snapshots_before$$, 'the meeting snapshots are unchanged');
SELECT is((SELECT meeting_document_resource(meeting, report) #>> '{resource,content}' FROM scenario, absorbed_resources),
  'Absorbed evidence', 'the closed meeting still presents the absorbed report');
SELECT is((SELECT jsonb_agg(business->>'title') FROM scenario,
    jsonb_array_elements(meeting_documents(meeting)->'groups') grouped, jsonb_array_elements(grouped->'businesses') business
  WHERE grouped->>'kind' = 'businesses'), '["Target affair"]'::jsonb,
  'the meeting documents group the point under its current business, not the deleted folder');

-- A business whose report is not referenced still loses its report.
CREATE TEMP TABLE unreferenced AS SELECT
  (hall_api.create_council_business('', 'Unreferenced affair', 'Unreferenced report', 'Unreferenced evidence')->>'id')::UUID AS business;
CREATE TEMP TABLE unreferenced_report AS SELECT report_resource AS id FROM council_business_workspace JOIN unreferenced ON council_business = business;
SELECT is((SELECT hall_api.merge_council_business(business, target, false)#>>'{report,fate}' FROM unreferenced, scenario),
  'appendedToTargetReport', 'an unreferenced report is appended without being kept');
SELECT ok(NOT EXISTS (SELECT FROM resource JOIN unreferenced_report USING (id)), 'an unreferenced report is deleted');

SELECT * FROM finish();
ROLLBACK;
