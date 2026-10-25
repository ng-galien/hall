BEGIN;
\ir support/helpers.sql
SELECT no_plan();

SELECT lives_ok(
  $$SELECT test_prepare_open_ballot('vote:public', 'public', 4)$$,
  'public vote fixture is open with four participants'
);

SELECT lives_ok(
  $$SELECT test_prepare_open_ballot('vote:other', 'public', 1)$$,
  'second public ballot provides a foreign participation fixture'
);

-- Missing ballot diagnostic used by HALL-FR-VOT-070.
SELECT throws_ok(
  $$
    INSERT INTO votes (ballot, mode, choice, ballot_participation, count)
    VALUES (
      test_uuid('vote:missing-ballot'),
      'public',
      'approve',
      test_uuid('vote:public:participation:1'),
      1
    )
  $$,
  'HV902',
  NULL,
  'vote insertion reports an unknown ballot explicitly'
);

-- @verifies-requirement HALL-FR-VOT-030
SELECT throws_ok(
  $$
    INSERT INTO votes (ballot, mode, choice, ballot_participation, count)
    VALUES (test_uuid('vote:public:ballot'), 'public', 'approve', NULL, 1)
  $$,
  '23514',
  NULL,
  'a public vote must identify one participation'
);

SELECT throws_ok(
  $$
    INSERT INTO votes (ballot, mode, choice, ballot_participation, count)
    VALUES (
      test_uuid('vote:public:ballot'),
      'public',
      'approve',
      test_uuid('vote:public:participation:1'),
      2
    )
  $$,
  '23514',
  NULL,
  'a public vote always counts exactly once'
);

-- @verifies-requirement HALL-FR-VOT-020
SELECT throws_ok(
  $$
    INSERT INTO votes (ballot, mode, choice, ballot_participation, count)
    VALUES (
      test_uuid('vote:public:ballot'),
      'public',
      'approve',
      test_uuid('vote:public:participation:1'),
      0
    )
  $$,
  '23514',
  NULL,
  'a vote count must be strictly positive'
);

-- @verifies-requirement HALL-FR-VOT-080
SELECT throws_ok(
  $$
    INSERT INTO votes (ballot, mode, choice, ballot_participation, count)
    VALUES (test_uuid('vote:public:ballot'), 'secret', 'approve', NULL, 1)
  $$,
  'HV503',
  'vote mode must match ballot mode',
  'a secret-shaped vote cannot be recorded in a public ballot'
);

-- @verifies-requirement HALL-FR-VOT-090
SELECT throws_ok(
  $$
    INSERT INTO votes (ballot, mode, choice, ballot_participation, count)
    VALUES (
      test_uuid('vote:public:ballot'),
      'public',
      'approve',
      test_uuid('vote:other:participation:1'),
      1
    )
  $$,
  'HV504',
  'vote participation must belong to the ballot',
  'a public vote cannot use another ballot participation'
);

INSERT INTO votes (ballot, mode, choice, ballot_participation, count)
VALUES (
  test_uuid('vote:public:ballot'),
  'public',
  'approve',
  test_uuid('vote:public:participation:1'),
  1
);

-- @verifies-requirement HALL-FR-VOT-040
SELECT throws_ok(
  $$
    INSERT INTO votes (ballot, mode, choice, ballot_participation, count)
    VALUES (
      test_uuid('vote:public:ballot'),
      'public',
      'reject',
      test_uuid('vote:public:participation:1'),
      1
    )
  $$,
  '23505',
  NULL,
  'one public participation records at most one vote'
);

INSERT INTO votes (ballot, mode, choice, ballot_participation, count) VALUES
  (
    test_uuid('vote:public:ballot'),
    'public',
    'reject',
    test_uuid('vote:public:participation:2'),
    1
  ),
  (
    test_uuid('vote:public:ballot'),
    'public',
    'approve',
    test_uuid('vote:public:participation:3'),
    1
  ),
  (
    test_uuid('vote:public:ballot'),
    'public',
    'abstain',
    test_uuid('vote:public:participation:4'),
    1
  );

-- @verifies-requirement HALL-FR-BAL-120
SELECT is(
  ballot_vote_count(test_uuid('vote:public:ballot')),
  4,
  'public vote count sums four singular recorded votes'
);

-- @verifies-requirement HALL-FR-BAL-130
SELECT is(
  ballot_choice_count(test_uuid('vote:public:ballot'), 'approve'),
  2,
  'choice count filters and sums approve votes'
);

SELECT is(
  ballot_choice_count(test_uuid('vote:public:ballot'), 'abstain'),
  1,
  'abstention remains a recorded choice'
);

-- @verifies-requirement HALL-FR-VOT-060

-- @verifies-requirement HALL-TR-INT-060
SELECT throws_ok(
  $$
    UPDATE votes
    SET choice = 'reject'
    WHERE ballot = test_uuid('vote:public:ballot')
      AND ballot_participation = test_uuid('vote:public:participation:1')
  $$,
  'HV501',
  'a vote is immutable',
  'a recorded vote cannot be updated'
);

SELECT throws_ok(
  $$
    DELETE FROM votes
    WHERE ballot = test_uuid('vote:public:ballot')
      AND ballot_participation = test_uuid('vote:public:participation:1')
  $$,
  'HV501',
  'a vote is immutable',
  'a recorded vote cannot be deleted'
);

SELECT throws_ok(
  $$TRUNCATE votes$$,
  'HV501',
  'a vote is immutable',
  'TRUNCATE cannot bypass vote immutability'
);

-- @verifies-requirement HALL-FR-BAL-150

-- @verifies-requirement HALL-FR-BAL-160

-- @verifies-requirement HALL-FR-VOT-010
SELECT is(
  derive_ballot_result(test_uuid('vote:public:ballot')),
  'approve'::ballot_result,
  'approve majority adopts while abstention is excluded'
);

SELECT throws_ok(
  $$SELECT derive_ballot_result(test_uuid('vote:unknown-ballot'))$$,
  'HV902',
  NULL,
  'result derivation reports an unknown ballot explicitly'
);

-- @verifies-requirement HALL-FR-AGI-170

-- @verifies-requirement HALL-TR-CON-070
SELECT lives_ok(
  $$
    UPDATE ballots
    SET result_preview=test_review_ballot(id),completed_at = '2026-01-01 09:30:00+00'
    WHERE id = test_uuid('vote:public:ballot')
  $$,
  'ballot and agenda-item completion succeed atomically'
);

SELECT is(
  (
    SELECT result
    FROM ballots
    WHERE id = test_uuid('vote:public:ballot')
  ),
  'approve'::ballot_result,
  'completion persists the derived approve result'
);

SELECT is(
  (
    SELECT council_agenda_item.completed_at
    FROM council_agenda_item
    WHERE id = test_uuid('vote:public:agenda-item')
  ),
  (
    SELECT ballots.completed_at
    FROM ballots
    WHERE id = test_uuid('vote:public:ballot')
  ),
  'agenda-item completion uses the exact ballot completion timestamp'
);

-- @verifies-requirement HALL-FR-AGI-160
SELECT ok(
  council_agenda_item_has_completed_ballot(
    test_uuid('vote:public:agenda-item'),
    '2026-01-01 09:30:00+00'
  ),
  'agenda-item completion authority recognizes its completed ballot'
);

-- @verifies-requirement HALL-FR-AGI-140
SELECT throws_ok(
  $$
    UPDATE council_agenda_item
    SET completed_at = '2026-01-01 09:31:00+00'
    WHERE id = test_uuid('vote:public:agenda-item')
  $$,
  'HV219',
  'an agenda item completion time is immutable',
  'a completed agenda-item timestamp cannot change'
);

-- @verifies-requirement HALL-FR-VOT-070
SELECT throws_ok(
  $$
    INSERT INTO votes (ballot, mode, choice, ballot_participation, count)
    VALUES (
      test_uuid('vote:public:ballot'),
      'public',
      'approve',
      test_uuid('vote:public:participation:4'),
      1
    )
  $$,
  'HV502',
  'a completed ballot cannot receive votes',
  'ballot completion freezes votes before uniqueness is considered'
);

-- @verifies-requirement HALL-FR-BAL-080
SELECT throws_ok(
  $$
    INSERT INTO ballot_participation (id, ballot, meeting_attendance)
    VALUES (
      test_uuid('vote:public:late-participation'),
      test_uuid('vote:public:ballot'),
      test_uuid('vote:public:attendance:4')
    )
  $$,
  'HV302',
  'a completed ballot cannot receive participation',
  'ballot completion freezes participation before uniqueness is considered'
);

-- @verifies-requirement HALL-FR-BAL-250
SELECT throws_ok(
  $$
    UPDATE ballots
    SET completed_at = '2026-01-01 09:31:00+00'
    WHERE id = test_uuid('vote:public:ballot')
  $$,
  'HV406',
  'a completed ballot is immutable',
  'a completed ballot timestamp cannot change'
);

SELECT lives_ok(
  $$UPDATE ballots SET completed_at = completed_at WHERE id = test_uuid('vote:public:ballot')$$,
  'an observationally harmless completed-ballot no-op remains legal'
);

-- @verifies-requirement HALL-FR-BAL-270
SELECT lives_ok(
  $$SELECT test_prepare_open_ballot('vote:mismatch', 'public', 2)$$,
  'vote mismatch fixture is open with two participants'
);

INSERT INTO votes (ballot, mode, choice, ballot_participation, count)
VALUES (
  test_uuid('vote:mismatch:ballot'),
  'public',
  'approve',
  test_uuid('vote:mismatch:participation:1'),
  1
);

SELECT throws_ok(
  $$
    UPDATE ballots
    SET completed_at = '2026-01-01 09:30:00+00'
    WHERE id = test_uuid('vote:mismatch:ballot')
  $$,
  'HV408',
  'every ballot participation must be accounted for by a vote or non-participation',
  'completion rejects a missing participant vote'
);

-- @verifies-requirement HALL-FR-BAL-170
SELECT lives_ok(
  $$SELECT test_prepare_open_ballot('result:reject', 'public', 3)$$,
  'reject-majority fixture is open'
);

INSERT INTO votes (ballot, mode, choice, ballot_participation, count) VALUES
  (test_uuid('result:reject:ballot'), 'public', 'approve', test_uuid('result:reject:participation:1'), 1),
  (test_uuid('result:reject:ballot'), 'public', 'reject', test_uuid('result:reject:participation:2'), 1),
  (test_uuid('result:reject:ballot'), 'public', 'reject', test_uuid('result:reject:participation:3'), 1);

SELECT is(
  derive_ballot_result(test_uuid('result:reject:ballot')),
  'reject'::ballot_result,
  'reject majority rejects the ballot'
);

-- @verifies-requirement HALL-FR-BAL-180
SELECT lives_ok(
  $$SELECT test_prepare_open_ballot('result:chair-approve', 'public', 2)$$,
  'public chairman tie fixture is open'
);

INSERT INTO votes (ballot, mode, choice, ballot_participation, count) VALUES
  (
    test_uuid('result:chair-approve:ballot'),
    'public',
    'approve',
    test_uuid('result:chair-approve:participation:1'),
    1
  ),
  (
    test_uuid('result:chair-approve:ballot'),
    'public',
    'reject',
    test_uuid('result:chair-approve:participation:2'),
    1
  );

SELECT is(
  derive_ballot_result(test_uuid('result:chair-approve:ballot')),
  'approve'::ballot_result,
  'public tie follows the chairman approve choice'
);

SELECT lives_ok(
  $$SELECT test_prepare_open_ballot('result:chair-abstain', 'public', 3)$$,
  'public undecided tie fixture is open'
);

INSERT INTO votes (ballot, mode, choice, ballot_participation, count) VALUES
  (
    test_uuid('result:chair-abstain:ballot'),
    'public',
    'abstain',
    test_uuid('result:chair-abstain:participation:1'),
    1
  ),
  (
    test_uuid('result:chair-abstain:ballot'),
    'public',
    'approve',
    test_uuid('result:chair-abstain:participation:2'),
    1
  ),
  (
    test_uuid('result:chair-abstain:ballot'),
    'public',
    'reject',
    test_uuid('result:chair-abstain:participation:3'),
    1
  );

-- @verifies-requirement HALL-FR-BAL-190
SELECT is(
  derive_ballot_result(test_uuid('result:chair-abstain:ballot')),
  'reject'::ballot_result,
  'a public tie with an abstaining chairman is rejected'
);

SELECT lives_ok(
  $$SELECT test_prepare_open_ballot('vote:secret-tie', 'secret', 4)$$,
  'secret aggregate fixture is open with four participants'
);

-- @verifies-requirement HALL-FR-VOT-020

-- on the anonymous shape, where only the positive-count CHECK
-- can reject the row.
SELECT throws_ok(
  $$
    INSERT INTO votes (ballot, mode, choice, ballot_participation, count)
    VALUES (test_uuid('vote:secret-tie:ballot'), 'secret', 'abstain', NULL, 0)
  $$,
  '23514',
  NULL,
  'a secret aggregate count must also be strictly positive'
);

-- Secret shape of HALL-FR-VOT-030.
SELECT throws_ok(
  $$
    INSERT INTO votes (ballot, mode, choice, ballot_participation, count)
    VALUES (
      test_uuid('vote:secret-tie:ballot'),
      'secret',
      'approve',
      test_uuid('vote:secret-tie:participation:1'),
      1
    )
  $$,
  '23514',
  NULL,
  'a secret vote cannot identify a participant'
);

INSERT INTO votes (ballot, mode, choice, ballot_participation, count) VALUES
  (test_uuid('vote:secret-tie:ballot'), 'secret', 'approve', NULL, 2),
  (test_uuid('vote:secret-tie:ballot'), 'secret', 'reject', NULL, 2);

-- @verifies-requirement HALL-FR-VOT-050
SELECT throws_ok(
  $$
    INSERT INTO votes (ballot, mode, choice, ballot_participation, count)
    VALUES (test_uuid('vote:secret-tie:ballot'), 'secret', 'approve', NULL, 1)
  $$,
  '23505',
  NULL,
  'one secret aggregate exists per ballot and choice'
);

SELECT is(
  ballot_vote_count(test_uuid('vote:secret-tie:ballot')),
  4,
  'secret vote count sums aggregate counts rather than rows'
);

SELECT is(
  derive_ballot_result(test_uuid('vote:secret-tie:ballot')),
  'reject'::ballot_result,
  'a secret tie is rejected without a casting vote'
);

SELECT lives_ok(
  $$
    UPDATE ballots
    SET result_preview=test_review_ballot(id),completed_at = '2026-01-01 09:30:00+00'
    WHERE id = test_uuid('vote:secret-tie:ballot')
  $$,
  'a secret ballot closes from anonymous aggregate rows'
);

-- @verifies-requirement HALL-TR-CON-070

-- rollback branch: the fixture deliberately bypasses only the
-- agenda-item completion authority, then proves a failed synchronization leaves
-- the ballot open and result-less.
SELECT lives_ok(
  $$SELECT test_prepare_open_ballot('result:atomic-rollback', 'public', 1)$$,
  'atomic rollback fixture is open'
);

INSERT INTO votes (ballot, mode, choice, ballot_participation, count)
VALUES (
  test_uuid('result:atomic-rollback:ballot'),
  'public',
  'approve',
  test_uuid('result:atomic-rollback:participation:1'),
  1
);

SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE council_agenda_item DISABLE TRIGGER council_agenda_item_enforce_completion_authority;
UPDATE council_agenda_item
SET completed_at = '2026-01-01 09:20:00+00'
WHERE id = test_uuid('result:atomic-rollback:agenda-item');
ALTER TABLE council_agenda_item ENABLE TRIGGER council_agenda_item_enforce_completion_authority;
SET CONSTRAINTS ALL DEFERRED;

SELECT throws_ok(
  $$
    UPDATE ballots
    SET completed_at = '2026-01-01 09:30:00+00'
    WHERE id = test_uuid('result:atomic-rollback:ballot')
  $$,
  'HV409',
  'a completed ballot requires an active agenda item',
  'failed agenda-item synchronization aborts ballot completion'
);

SELECT ok(
  (
    SELECT completed_at IS NULL AND result IS NULL
    FROM ballots
    WHERE id = test_uuid('result:atomic-rollback:ballot')
  ),
  'failed synchronization rolls back both ballot completion fields'
);

-- @verifies-requirement HALL-TR-CON-100

-- pgTAP verifies the deterministic lock declaration; a
-- multi-connection barrier harness is needed to prove the scheduling race.
SELECT ok(
  pg_get_functiondef('enforce_vote_immutability()'::regprocedure)
    LIKE '%FOR UPDATE%',
  'vote insertion locks its ballot before completion validation'
);

SELECT * FROM finish();
ROLLBACK;
