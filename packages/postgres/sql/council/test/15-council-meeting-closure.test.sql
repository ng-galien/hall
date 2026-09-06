BEGIN;
\ir support/helpers.sql
SELECT no_plan();

-- HALL-FR-MTG-080
SELECT lives_ok(
  $$INSERT INTO council_meetings (id) VALUES
(test_uuid('closure:unstarted'))$$,
  'a next meeting can be provisioned before its date is fixed'
);

-- HALL-FR-MTG-090
SELECT throws_ok(
  $$UPDATE council_meetings
    SET closed_at = '2026-01-01 10:00:00+00'
    WHERE id = test_uuid('closure:unstarted')$$,
  '23514',
  NULL,
  'the inline shape forbids closure without a start fact'
);

SELECT throws_ok(
  $$SELECT close_council_meeting(
    test_uuid('closure:unstarted'),
    '2026-01-01 10:00:00+00'
  )$$,
  'HV116',
  'only a started council meeting can be closed',
  'the named action rejects an unstarted meeting before writing its closure bundle'
);

-- HALL-FR-MTG-140
SELECT throws_ok(
  $$SELECT test_execute_deferred(ARRAY[
    $statement$
      INSERT INTO council_meetings (id, previous_council_meeting) VALUES
(
        test_uuid('closure:premature-successor'),
        test_uuid('closure:unstarted'))
    $statement$
  ])$$,
  'HV120',
  'a council meeting successor requires a closed predecessor',
  'a successor cannot commit while its predecessor remains open'
);

INSERT INTO council_meetings (id, scheduled_at, location) VALUES
(
  test_uuid('closure:main'),
  '2026-01-01 09:00:00+00',
  'Council chamber'
);
INSERT INTO meeting_attendance (id, council_member, council_meeting, status) VALUES
  (
    test_uuid('closure:attendance:1'),
    test_uuid('closure:member:1'),
    test_uuid('closure:main'),
    'present'
  ),
  (
    test_uuid('closure:attendance:2'),
    test_uuid('closure:member:2'),
    test_uuid('closure:main'),
    'present'
  );
SELECT test_designate_present_officers(id) FROM council_meetings
WHERE started_at IS NULL AND EXISTS (SELECT FROM meeting_attendance WHERE council_meeting=council_meetings.id AND status='present');
UPDATE council_meetings
SET started_at = '2026-01-01 09:05:00+00'
WHERE id = test_uuid('closure:main');

-- HALL-FR-MTG-110
SELECT throws_ok(
  $$UPDATE council_meetings
    SET closed_at = '2026-01-01 10:00:00+00'
    WHERE id = test_uuid('closure:main');
    SET CONSTRAINTS ALL IMMEDIATE$$,
  'HV121',
  'a closed council meeting requires its successor and minutes approval',
  'a naked closure fact cannot commit without the complete structural bundle'
);
SET CONSTRAINTS ALL DEFERRED;

INSERT INTO council_business (id) VALUES
  (test_uuid('closure:unfinished-business')),
  (test_uuid('closure:deferred-business')),
  (test_uuid('closure:completed-business'));

SELECT schedule_council_decision_proposal(
  test_uuid('closure:unfinished-business'),
  test_uuid('closure:main'),
  2
);

SELECT schedule_open_question(
  test_uuid('closure:deferred-business'),
  test_uuid('closure:main'),
  3
);
SELECT start_council_agenda_item(
  (
    SELECT id
    FROM council_agenda_item
    WHERE council_business = test_uuid('closure:deferred-business')
  ),
  '2026-01-01 09:15:00+00'
);
SELECT adjourn_council_agenda_item(
  (
    SELECT id
    FROM council_agenda_item
    WHERE council_business = test_uuid('closure:deferred-business')
  ), '2026-01-01 09:16:00+00'
);

SELECT schedule_open_question(
  test_uuid('closure:completed-business'),
  test_uuid('closure:main'),
  4
);
SELECT start_council_agenda_item(
  (
    SELECT id
    FROM council_agenda_item
    WHERE council_business = test_uuid('closure:completed-business')
  ),
  '2026-01-01 09:20:00+00'
);
SELECT complete_open_question(
  (
    SELECT id
    FROM council_agenda_item
    WHERE council_business = test_uuid('closure:completed-business')
  ),
  '2026-01-01 09:25:00+00'
);

CREATE TEMP TABLE closure_result AS
SELECT close_council_meeting(
  test_uuid('closure:main'),
  '2026-01-01 10:00:00+00'
) AS next_meeting;

SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

-- HALL-TR-CON-140 HALL-FR-MTG-130 HALL-FR-MIN-030
SELECT ok(
  (
    SELECT previous_council_meeting = test_uuid('closure:main')
      AND scheduled_at IS NULL
      AND NOT EXISTS(SELECT FROM meeting_membership_record WHERE council_meeting=council_meetings.id)
      AND started_at IS NULL
      AND closed_at IS NULL
    FROM council_meetings, closure_result
    WHERE id = closure_result.next_meeting
  ),
  'closure provisions one undated successor without inventing the next membership'
);

SELECT ok(
  council_meeting_closure_is_complete(test_uuid('closure:main')),
  'the closed meeting owns minutes whose approval is first on its successor agenda'
);

SELECT throws_ok(
  $$INSERT INTO council_meetings (id, previous_council_meeting) VALUES
(
      test_uuid('closure:duplicate-successor'),
      test_uuid('closure:main'))$$,
  '23505',
  NULL,
  'the predecessor key admits only one successor'
);

-- HALL-FR-AGI-280
SELECT ok(
  (
    SELECT agenda_item.council_meeting = closure_result.next_meeting
      AND agenda_item.position = 2
      AND agenda_item.started_at IS NULL
    FROM council_agenda_item AS agenda_item, closure_result
    WHERE agenda_item.council_business = test_uuid('closure:unfinished-business')
  ),
  'an unstarted occurrence itself moves to the next meeting after minutes approval'
);

SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM council_agenda_item AS agenda_item, closure_result
    WHERE agenda_item.council_business = test_uuid('closure:deferred-business')
      AND (
        (agenda_item.council_meeting = test_uuid('closure:main')
          AND agenda_item.position = -3
          AND agenda_item.started_at IS NOT NULL)
        OR
        (agenda_item.council_meeting = closure_result.next_meeting
          AND agenda_item.position > 0
          AND agenda_item.started_at IS NULL)
      )
  ),
  2,
  'a started deferral keeps its negative history and receives a fresh next occurrence'
);

SELECT ok(
  EXISTS (
    SELECT
    FROM council_agenda_item
    WHERE council_business = test_uuid('closure:completed-business')
      AND council_meeting = test_uuid('closure:main')
      AND position = 4
      AND completed_at IS NOT NULL
  ),
  'a completed occurrence remains unchanged on the closed meeting'
);

-- HALL-FR-AGI-270
SELECT throws_ok(
  format(
    'SELECT schedule_open_question(%L::uuid, %L::uuid, 8)',
    test_uuid('closure:unfinished-business'),
    test_uuid('closure:main')
  ),
  'HV223',
  'a closed council meeting cannot receive agenda changes',
  'a closed meeting rejects a new agenda occurrence'
);

-- HALL-FR-BAL-280
SELECT throws_ok(
  format(
    'INSERT INTO ballots (id, council_agenda_item, mode, chairman) VALUES (%L::uuid, %L::uuid, %L, %L::uuid)',
    test_uuid('closure:late-ballot'),
    (
      SELECT id
      FROM council_agenda_item
      WHERE council_business = test_uuid('closure:completed-business')
    ),
    'public',
    test_uuid('closure:late-chairman')
  ),
  'HV412',
  'a closed council meeting cannot receive a ballot',
  'ballot creation checks meeting closure before agenda eligibility'
);

-- HALL-FR-MTG-100
SELECT throws_ok(
  $$UPDATE council_meetings
    SET closed_at = '2026-01-01 10:01:00+00'
    WHERE id = test_uuid('closure:main')$$,
  'HV114',
  'a closed council meeting is immutable',
  'the closure timestamp cannot be rewritten'
);

-- HALL-FR-MTG-120
INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
SELECT
  test_uuid('closure:next-attendance:' || ordinal),
  test_uuid('closure:next-member:' || ordinal),
  closure_result.next_meeting,
  'present'
FROM closure_result, generate_series(1, 2) AS ordinal;
SELECT schedule_council_meeting(
  closure_result.next_meeting,
  '2026-02-01 09:00:00+00',
  'Council chamber'
)
FROM closure_result;
SELECT test_designate_present_officers(id) FROM council_meetings
WHERE started_at IS NULL AND EXISTS (SELECT FROM meeting_attendance WHERE council_meeting=council_meetings.id AND status='present');
UPDATE council_meetings
SET started_at = '2026-02-01 09:00:00+00'
FROM closure_result
WHERE id = closure_result.next_meeting;

SELECT throws_ok(
  format(
    'SELECT close_council_meeting(%L::uuid, %L::timestamptz)',
    (SELECT next_meeting FROM closure_result),
    '2026-02-01 10:00:00+00'
  ),
  'HV117',
  'the previous council meeting minutes must be approved before closure',
  'the successor cannot close before approving its exact predecessor minutes'
);

-- HALL-FR-BAL-290
SELECT test_prepare_open_ballot('closure:open-ballot', 'public', 2);
SELECT throws_ok(
  $$SELECT close_council_meeting(
    test_uuid('closure:open-ballot:meeting'),
    '2026-01-01 10:00:00+00'
  )$$,
  'HV118',
  'a council meeting with an open ballot cannot be closed',
  'an open ballot prevents meeting closure before any carry-forward write'
);

SELECT ok(
  pg_get_functiondef('close_council_meeting(uuid,timestamp with time zone)'::regprocedure)
    LIKE '%FOR UPDATE%',
  'meeting closure declares the row lock required by its concurrency contract'
);

SELECT * FROM finish();
ROLLBACK;
