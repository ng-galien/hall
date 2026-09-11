BEGIN;
\ir support/helpers.sql
SELECT no_plan();

INSERT INTO council_meetings (id, scheduled_at, location)
VALUES (test_uuid('premature:meeting'), '2026-01-01 09:00:00+00', 'Council chamber');
INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
VALUES (test_uuid('premature:attendance'), test_uuid('premature:member'), test_uuid('premature:meeting'), 'present');
SELECT test_designate_present_officers(test_uuid('premature:meeting'));
SELECT test_ensure_business(test_uuid('premature:business'));
SELECT schedule_council_decision_proposal(test_uuid('premature:business'), test_uuid('premature:meeting'), 1);
SELECT test_prepare_notice(test_uuid('premature:meeting'));
UPDATE council_meetings SET started_at = '2026-01-01 09:05:00+00' WHERE id = test_uuid('premature:meeting');
SELECT start_council_agenda_item(
  (SELECT id FROM council_agenda_item WHERE council_business = test_uuid('premature:business')),
  '2026-01-01 09:10:00+00'
);
CREATE TEMP TABLE original_occurrence AS
SELECT * FROM council_agenda_item WHERE council_business = test_uuid('premature:business');
CREATE TEMP TABLE premature_result AS
SELECT close_council_meeting(test_uuid('premature:meeting'), '2026-01-01 09:15:00+00') AS next_meeting;
SET CONSTRAINTS ALL IMMEDIATE;

SELECT is((SELECT closed_at FROM council_meetings WHERE id = test_uuid('premature:meeting')),
  '2026-01-01 09:15:00+00'::timestamptz, 'premature closure records the real closure');
SELECT ok(EXISTS (
  SELECT FROM council_agenda_item a JOIN original_occurrence original ON a.id = original.id
  WHERE a.council_meeting = test_uuid('premature:meeting') AND a.position = -1
    AND a.started_at = original.started_at AND a.completed_at IS NULL AND a.adjourned_at IS NULL
), 'the interrupted discussion remains as negative historical occurrence without invented completion');
SELECT ok(EXISTS (
  SELECT FROM council_agenda_item a CROSS JOIN original_occurrence original
  WHERE a.council_meeting = (SELECT next_meeting FROM premature_result)
    AND a.id <> original.id AND a.council_business = original.council_business
    AND a.council_decision_proposal = original.council_decision_proposal
    AND a.position = 2 AND a.started_at IS NULL AND a.completed_at IS NULL AND a.adjourned_at IS NULL
), 'the successor receives a fresh pending occurrence of the same proposal');
SELECT is((SELECT count(*)::integer FROM council_agenda_item
  WHERE council_meeting = (SELECT next_meeting FROM premature_result)
    AND minutes_approval IS NOT NULL AND position = 1), 1, 'the successor begins with minutes approval');
SELECT throws_ok(
  $$DELETE FROM council_agenda_item
    WHERE council_meeting = (SELECT next_meeting FROM premature_result) AND minutes_approval IS NOT NULL$$,
  'HV126', NULL, 'the successor cannot lose its mandatory previous minutes approval'
);
SELECT * FROM finish();
ROLLBACK;
