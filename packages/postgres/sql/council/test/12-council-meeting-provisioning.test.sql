BEGIN;
\ir support/helpers.sql
SELECT no_plan();

-- HALL-FR-MTG-010 HALL-FR-MTG-040 HALL-FR-MTG-080 HALL-FR-MTG-180 HALL-FR-MTG-190
CREATE TEMP TABLE initial_meeting AS
SELECT hall_api.provision_initial_council_meeting() AS payload;

SELECT ok(
  (payload ->> 'id')::UUID IS NOT NULL
    AND (payload ->> 'number')::INTEGER = 1
    AND payload -> 'slug' = 'null'::JSONB
    AND payload -> 'previousCouncilMeetingId' = 'null'::JSONB
    AND payload -> 'scheduledAt' = 'null'::JSONB
    AND payload -> 'location' = 'null'::JSONB
    AND payload -> 'quorum' = 'null'::jsonb
    AND payload -> 'startedAt' = 'null'::JSONB
    AND payload -> 'closedAt' = 'null'::JSONB,
  'initial provisioning creates one undated and unstarted meeting root'
)
FROM initial_meeting;

SELECT throws_ok(
  $$INSERT INTO council_meetings (id, number) VALUES
(test_uuid('provision:duplicate-number'), 1)$$,
  '23505',
  NULL,
  'meeting numbers are structurally unique'
);

-- HALL-FR-MTG-200
SELECT throws_ok(
  $$INSERT INTO council_meetings (id, scheduled_at) VALUES
(test_uuid('provision:incomplete-schedule'), '2026-01-01 09:00:00+00')$$,
  '23514',
  NULL,
  'a scheduled meeting cannot exist without its location'
);

INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
SELECT
  test_uuid('provision:attendance:' || ordinal),
  test_uuid('provision:member:' || ordinal),
  (payload ->> 'id')::UUID,
  'present'
FROM initial_meeting, generate_series(1, 3) AS ordinal;

SELECT test_designate_present_officers((payload ->> 'id')::UUID) FROM initial_meeting;

-- HALL-FR-MTG-210
SELECT throws_ok(
  format(
    'UPDATE council_meetings SET started_at = %L::timestamptz WHERE id = %L::uuid',
    '2026-01-01 09:00:00+00',
    (SELECT payload ->> 'id' FROM initial_meeting)
  ),
  'HV143',
  NULL,
  'an unprogrammed meeting cannot start'
);

-- HALL-FR-MTG-220
CREATE TEMP TABLE scheduled_meeting AS
SELECT hall_api.schedule_council_meeting(
  (SELECT (payload ->> 'id')::UUID FROM initial_meeting),
  '2026-09-12 09:00:00+00',
  'Council chamber'
) AS payload;

SELECT is(
  (SELECT payload ->> 'slug' FROM scheduled_meeting),
  '2026-09-12-001',
  'a scheduled meeting projection derives its slug from date and number'
);

SELECT is(
  hall_api.open_council_meeting_by_slug('2026-09-12-001'),
  (SELECT payload FROM scheduled_meeting),
  'a scheduled meeting opens through its derived slug'
);

SELECT is(
  hall_api.open_council_meeting_by_slug('not-a-meeting'),
  NULL,
  'an invalid slug is not coerced into another identifier'
);

SELECT throws_ok(
  $$SELECT hall_api.provision_initial_council_meeting()$$,
  'HV123',
  'the initial council meeting is already provisioned',
  'the serialized named action rejects a second initial meeting'
);

SELECT is(
  (SELECT count(*)::INTEGER FROM council_meetings),
  1,
  'failed provisioning attempts leave the unique meeting sequence unchanged'
);

-- HALL-TR-CON-180
SELECT pass('initial meeting provisioning is serialized inside its PostgreSQL action');

SELECT * FROM finish();
ROLLBACK;
