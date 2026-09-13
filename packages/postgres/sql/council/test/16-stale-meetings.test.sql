BEGIN;
\ir support/helpers.sql
SELECT no_plan();

-- @verifies-requirement HALL-FR-MTG-310
INSERT INTO council_meetings (id, number)
VALUES (test_uuid('active-meeting:first'), 1);

SELECT lives_ok(
  'SET CONSTRAINTS ALL IMMEDIATE',
  'one active meeting satisfies the deferred invariant'
);
SET CONSTRAINTS ALL DEFERRED;

SELECT throws_ok(
  $$SELECT test_execute_deferred(ARRAY[
    $statement$
      INSERT INTO council_meetings (id, number)
      VALUES (test_uuid('active-meeting:second'), 2)
    $statement$
  ])$$,
  '23505',
  NULL,
  'a second active meeting is rejected atomically'
);

UPDATE council_meetings
SET stale = TRUE
WHERE id = test_uuid('active-meeting:first');

INSERT INTO council_meetings (id, number)
VALUES (test_uuid('active-meeting:second'), 2);

SELECT lives_ok(
  'SET CONSTRAINTS ALL IMMEDIATE',
  'marking the previous meeting stale releases the active slot'
);
SET CONSTRAINTS ALL DEFERRED;

UPDATE council_meetings
SET stale = TRUE
WHERE id = test_uuid('active-meeting:second');

INSERT INTO council_meetings (id, number)
VALUES (test_uuid('active-meeting:third'), 3);

SELECT lives_ok(
  'SET CONSTRAINTS ALL IMMEDIATE',
  'multiple stale meetings and one active meeting satisfy the invariant'
);

SELECT is(
  (SELECT count(*)::int FROM council_meetings WHERE stale),
  2,
  'multiple stale meetings are retained'
);
SELECT is(
  (SELECT count(*)::int FROM council_meetings WHERE closed_at IS NULL AND NOT stale),
  1,
  'only one active meeting is retained'
);
SELECT is((SELECT count(*)::int FROM minutes), 0, 'no minutes are fabricated');
SELECT is((SELECT count(*)::int FROM council_agenda_item), 0, 'no agenda item is fabricated');
SELECT is((SELECT count(*)::int FROM ballots), 0, 'no ballot is fabricated');

SELECT * FROM finish();
ROLLBACK;
