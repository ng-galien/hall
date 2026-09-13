BEGIN;
\ir support/helpers.sql
SELECT no_plan();

INSERT INTO council_meetings (id, scheduled_at, location) VALUES
(test_uuid('snapshot:meeting'), '2026-01-01 09:00Z', 'Chamber');
INSERT INTO meeting_attendance(id, council_member, council_meeting, status)
VALUES(test_uuid('snapshot:attendance'), test_uuid('snapshot:member'), test_uuid('snapshot:meeting'), 'present');
SELECT test_confirm_declared_membership(test_uuid('snapshot:meeting'));
SELECT test_prepare_notice(test_uuid('snapshot:meeting'));
-- HALL-FR-MTG-230 HALL-FR-MTG-240 HALL-FR-MTG-250
SELECT throws_ok($$SELECT start_council_meeting(test_uuid('snapshot:meeting'), '2026-01-01 09:00Z')$$,
 'HV124', NULL, 'start requires designated officers');
SELECT is((SELECT count(*)::integer FROM council_meeting_snapshot), 0, 'failed start produces no snapshot');
-- HALL-FR-MTG-260
SELECT throws_ok($$SELECT hall_api.prepare_council_meeting(test_uuid('snapshot:meeting'), '2026-02-01 09:00Z', 'Other room', test_uuid('missing-officer'), test_uuid('snapshot:member'))$$,
 'HV124', NULL, 'failed officer designation rolls the schedule back too');
SELECT is((SELECT location FROM council_meetings WHERE id=test_uuid('snapshot:meeting')), 'Chamber', 'failed preparation preserves the old location');
SELECT lives_ok($$SELECT set_council_meeting_officers(test_uuid('snapshot:meeting'), test_uuid('snapshot:member'), test_uuid('snapshot:member'))$$,
 'designate the physically present officers before opening');
SELECT lives_ok($$SELECT start_council_meeting(test_uuid('snapshot:meeting'), '2026-01-01 09:00Z')$$,
 'opening captures its snapshot');
SELECT is((SELECT count(*)::integer FROM council_meeting_snapshot), 1, 'one snapshot exists after start');
SELECT throws_ok($$UPDATE council_meeting_snapshot SET payload='{}'$$, 'HV125', NULL, 'snapshots reject updates');
SELECT throws_ok($$DELETE FROM council_meeting_snapshot$$, 'HV125', NULL, 'snapshots reject deletion');
SELECT throws_ok($$TRUNCATE council_meeting_snapshot CASCADE$$, 'HV125', NULL, 'snapshots reject truncate');
SELECT throws_ok($$SELECT adjourn_council_agenda_item(test_uuid('snapshot:unknown'), NULL)$$,
 'HV230', NULL, 'adjournment requires an explicit timestamp');
INSERT INTO council_meetings (id) VALUES
(test_uuid('snapshot:reorder'));
SELECT test_ensure_business(test_uuid('snapshot:business'));
CREATE TEMP TABLE reorder_case AS SELECT
 schedule_open_question(test_uuid('snapshot:business'), test_uuid('snapshot:reorder'), 1) AS first,
 schedule_open_question(test_uuid('snapshot:business'), test_uuid('snapshot:reorder'), 2) AS second,
 schedule_open_question(test_uuid('snapshot:business'), test_uuid('snapshot:reorder'), 6) AS removed;
SELECT deprogram_council_agenda_item(removed) FROM reorder_case;
SELECT lives_ok($$SELECT reorder_council_agenda(test_uuid('snapshot:reorder'), ARRAY[second, first]) FROM reorder_case$$,
 'reordering cannot collide with an occupied negative ordinal');
SELECT * FROM finish();
ROLLBACK;
