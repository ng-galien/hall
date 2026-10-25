BEGIN;
\ir support/helpers.sql
SELECT no_plan();

-- @verifies-requirement HALL-FR-MTG-080
SELECT lives_ok(
  $$INSERT INTO council_meetings (id) VALUES
(test_uuid('closure:unstarted'))$$,
  'a next meeting can be provisioned before its date is fixed'
);

-- @verifies-requirement HALL-FR-MTG-090
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

-- @verifies-requirement HALL-FR-MTG-140
SELECT throws_ok(
  $$SELECT test_execute_deferred(ARRAY[
    $statement$
      INSERT INTO council_meetings (id, previous_council_meeting, stale) VALUES
(
        test_uuid('closure:premature-successor'),
        test_uuid('closure:unstarted'),
        TRUE)
    $statement$,
    $statement$
      SET CONSTRAINTS council_meetings_enforce_sequence IMMEDIATE
    $statement$
  ])$$,
  'HV120',
  'a council meeting successor requires a closed predecessor',
  'a successor cannot commit while its predecessor remains open'
);

UPDATE council_meetings SET stale = TRUE WHERE id = test_uuid('closure:unstarted');

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
SELECT test_ensure_business(test_uuid('closure:' || label || '-business')) FROM unnest(ARRAY['unfinished','deferred','completed']) label;

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
SELECT schedule_open_question(
  test_uuid('closure:completed-business'),
  test_uuid('closure:main'),
  4
);
SELECT test_prepare_notice(test_uuid('closure:main'));
UPDATE council_meetings
SET started_at = '2026-01-01 09:05:00+00'
WHERE id = test_uuid('closure:main');

-- @verifies-requirement HALL-FR-MTG-110
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

SELECT start_council_agenda_item(
  (
    SELECT id
    FROM council_agenda_item
    WHERE council_business = test_uuid('closure:completed-business')
  ),
  '2026-01-01 09:20:00+00'
);
SELECT complete_non_voting_agenda_item(
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

-- @verifies-requirement HALL-TR-CON-140

-- @verifies-requirement HALL-FR-MTG-130

-- @verifies-requirement HALL-FR-MIN-030
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

-- @verifies-requirement HALL-FR-AGI-280
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

-- @verifies-requirement HALL-FR-AGI-270
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

-- @verifies-requirement HALL-FR-BAL-280
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

-- @verifies-requirement HALL-FR-MTG-100
SELECT throws_ok(
  $$UPDATE council_meetings
    SET closed_at = '2026-01-01 10:01:00+00'
    WHERE id = test_uuid('closure:main')$$,
  'HV114',
  'a closed council meeting is immutable',
  'the closure timestamp cannot be rewritten'
);

-- @verifies-requirement HALL-FR-MTG-120

-- a previous PV that was not examined never blocks closure
-- and remains a historical point rather than a new vote on the next agenda.
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
SELECT test_prepare_notice(next_meeting) FROM closure_result;
UPDATE council_meetings
SET started_at = '2026-02-01 09:00:00+00'
FROM closure_result
WHERE id = closure_result.next_meeting;

CREATE TEMP TABLE second_closure AS
SELECT close_council_meeting(next_meeting, '2026-02-01 10:00:00+00') AS next_meeting
FROM closure_result;
SELECT ok((SELECT closed_at IS NOT NULL FROM council_meetings JOIN closure_result ON id=next_meeting),
  'the successor closes without completing its previous-PV point');
SELECT ok((SELECT position=-1 AND started_at IS NULL AND completed_at IS NULL
  FROM council_agenda_item JOIN closure_result ON council_meeting=next_meeting
  WHERE minutes_approval IS NOT NULL),
  'the previous PV remains unexamined in its original meeting');
SELECT is((SELECT count(*)::integer FROM council_agenda_item JOIN second_closure ON council_meeting=next_meeting
  WHERE minutes_approval IS NOT NULL),1,'the next meeting has only its own predecessor PV');
SELECT isnt((SELECT minutes_approval FROM council_agenda_item JOIN closure_result ON council_meeting=next_meeting
  WHERE minutes_approval IS NOT NULL),
  (SELECT minutes_approval FROM council_agenda_item JOIN second_closure ON council_meeting=next_meeting
  WHERE minutes_approval IS NOT NULL),'the unexamined PV is not scheduled for a second vote');

-- @verifies-requirement HALL-FR-BAL-290
UPDATE council_meetings SET stale = TRUE WHERE closed_at IS NULL AND NOT stale;
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
