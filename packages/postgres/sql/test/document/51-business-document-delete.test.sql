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
SELECT throws_ok($$SELECT delete_resource(id) FROM later_attachment$$,'HV703',NULL,'deletion after council start refused');
SELECT is((SELECT count(*)::int FROM council_business_resource WHERE resource=(SELECT id FROM later_attachment)),1,'started council document remains attached');
SELECT * FROM finish();
ROLLBACK;
