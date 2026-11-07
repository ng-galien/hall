BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
SET LOCAL hall.roles = '["administrator"]';
\ir ../../council/test/support/helpers.sql
SELECT no_plan();
CREATE TEMP TABLE scenario AS SELECT
  (hall.provision_initial_council_meeting()).id meeting,
  create_council_business_workspace('', 'first', 'report', 'Report') business,
  create_council_business_workspace('', 'second', 'report', 'Report') other;
CREATE TEMP TABLE attachment AS SELECT
  (create_document_resource('', 'attachment', 'application/pdf', convert_to('PDF','UTF8'))->>'id')::UUID id;
SELECT associate_council_business_resource(business,id) FROM scenario,attachment;
SELECT ok(resource_business_allows_deletion(id),'single attached document is deletable before council') FROM attachment;
SELECT ok(resource_siren_actions(resource_detail(id)) @> '[{"name":"resource.delete"}]','single attached document offers deletion') FROM attachment;
SELECT associate_council_business_resource(other,id) FROM scenario,attachment;
SELECT ok(NOT resource_business_allows_deletion(id),'shared document is protected') FROM attachment;
SELECT throws_ok($$SELECT delete_resource(id) FROM attachment$$,'HV703',NULL,'shared deletion refused');
SELECT is((SELECT count(*)::int FROM council_business_resource WHERE resource=(SELECT id FROM attachment)),2,'failed deletion preserves both links');
SELECT dissociate_council_business_resource(other,id) FROM scenario,attachment;
SELECT schedule_council_meeting(meeting,'2026-01-01 09:00Z','Chamber') FROM scenario;
SELECT schedule_open_question(business,meeting,1) FROM scenario;
SELECT freeze_council_agenda(meeting) FROM scenario;
SELECT ok(NOT resource_business_allows_deletion(id),'frozen agenda protects attached document') FROM attachment;
SELECT throws_ok($$SELECT delete_resource(id) FROM attachment$$,'HV703',NULL,'frozen deletion refused');
SELECT reopen_council_agenda(meeting) FROM scenario;
SELECT lives_ok($$SELECT delete_resource(id) FROM attachment$$,'deletion after reopening succeeds atomically');
SELECT is((SELECT count(*)::int FROM resource WHERE id=(SELECT id FROM attachment)),0,'document removed');
SELECT is((SELECT count(*)::int FROM council_business_resource WHERE resource=(SELECT id FROM attachment)),0,'attachment removed');
CREATE TEMP TABLE later_attachment AS SELECT
  (create_document_resource('', 'later', 'application/pdf', convert_to('Later PDF','UTF8'))->>'id')::UUID id;
SELECT associate_council_business_resource(business,id) FROM scenario,later_attachment;
INSERT INTO meeting_attendance(id,council_member,council_meeting,status)
SELECT test_uuid('delete:attendance'),test_uuid('delete:member'),meeting,'present' FROM scenario;
SELECT test_designate_present_officers(meeting) FROM scenario;
SELECT test_prepare_notice(meeting) FROM scenario;
UPDATE council_meetings SET started_at='2026-01-01 09:05Z' WHERE id=(SELECT meeting FROM scenario);
SELECT ok(NOT resource_business_allows_deletion(id),'started council protects document') FROM later_attachment;
-- The opening snapshot cites the document: the refusal names that citation.
SELECT throws_ok($$SELECT delete_resource(id) FROM later_attachment$$,'HV715',NULL,'deletion after council start refused');
SELECT is((SELECT count(*)::int FROM council_business_resource WHERE resource=(SELECT id FROM later_attachment)),1,'started council document remains attached');
-- @verifies-requirement HALL-FR-WSP-440 COUNCIL_BUSINESS_REPORT_IS_DELETED_WITH_ITS_BUSINESS:
CREATE TEMP TABLE reports AS SELECT label, report_resource id FROM council_business_workspace
JOIN (SELECT business, 'started' label FROM scenario UNION ALL SELECT other, 'unscheduled' FROM scenario) target
  ON target.business = council_business;
SELECT is(ARRAY(SELECT action->>'name' FROM jsonb_array_elements(resource_siren_actions(resource_detail(id))) action ORDER BY 1),
  ARRAY['resource.relocate','resource.update-content','resource.update-metadata'],
  label||' business report offers exactly relocation, metadata and content updates') FROM reports ORDER BY label;
SELECT throws_ok(format('SELECT delete_resource(%L::uuid)',id),'HV713','a council business report is deleted only with its council business',
  label||' business report deletion is refused by name') FROM reports ORDER BY label;
SELECT is((SELECT count(*)::int FROM resource WHERE resource.id=reports.id),1,label||' business report remains after the refusal') FROM reports ORDER BY label;
SELECT lives_ok($$SELECT delete_council_business(other) FROM scenario$$,'deleting the council business deletes its report');
SELECT is((SELECT count(*)::int FROM resource WHERE resource.id=reports.id),0,'report removed with its council business') FROM reports WHERE label='unscheduled';
SELECT * FROM finish();
ROLLBACK;
