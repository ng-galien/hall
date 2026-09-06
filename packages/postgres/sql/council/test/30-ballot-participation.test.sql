BEGIN;
\ir support/helpers.sql
SELECT no_plan();

-- HALL-TR-CON-050 HALL-FR-BAL-060 HALL-FR-BAL-140
SELECT lives_ok(
  $$SELECT test_prepare_open_ballot('ballot:main', 'public', 2)$$,
  'ballot and chairman participation can be created atomically'
);

SELECT ok(
  ballot_has_valid_chairman(
    test_uuid('ballot:main:ballot'),
    test_uuid('ballot:main:participation:1')
  ),
  'the chairman predicate accepts a present participation of the ballot'
);

-- HALL-FR-BAL-110
SELECT is(
  ballot_participation_count(test_uuid('ballot:main:ballot')),
  2,
  'participation count is derived from participation declarations'
);

-- HALL-FR-BAL-030
SELECT throws_ok(
  $$
    INSERT INTO ballots (id, council_agenda_item, mode, chairman)
    VALUES (
      test_uuid('ballot:second-for-question'),
      test_uuid('ballot:main:agenda-item'),
      'public',
      test_uuid('ballot:main:participation:1')
    )
  $$,
  '23505',
  NULL,
  'an agenda item has at most one ballot'
);

-- HALL-FR-BAL-040
SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM pg_constraint
    WHERE conrelid = 'ballots'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%completed_at IS NULL%result IS NULL%'
  ),
  1,
  'a declarative CHECK couples ballot completion and result'
);

-- HALL-FR-BAL-050
SELECT throws_ok(
  $$
    INSERT INTO ballot_participation (id, ballot, meeting_attendance)
    VALUES (
      test_uuid('ballot:main:participation-duplicate'),
      test_uuid('ballot:main:ballot'),
      test_uuid('ballot:main:attendance:1')
    )
  $$,
  '23505',
  NULL,
  'one attendance participates once in a ballot'
);

-- Missing reference diagnostics used by participation invariants.
SELECT throws_ok(
  $$
    INSERT INTO ballot_participation (id, ballot, meeting_attendance)
    VALUES (
      test_uuid('participation:unknown-ballot'),
      test_uuid('ballot:unknown'),
      test_uuid('attendance:unknown')
    )
  $$,
  'HV902',
  NULL,
  'participation reports an unknown ballot explicitly'
);

SELECT throws_ok(
  $$
    INSERT INTO ballot_participation (id, ballot, meeting_attendance)
    VALUES (
      test_uuid('participation:unknown-attendance'),
      test_uuid('ballot:main:ballot'),
      test_uuid('attendance:unknown')
    )
  $$,
  'HV903',
  NULL,
  'participation reports an unknown attendance explicitly'
);

-- Eligibility fixture: one present chairman, one represented voter, one absent
-- member and one excused member.
INSERT INTO council_meetings (id, scheduled_at, location) VALUES
(test_uuid('ballot:eligibility:meeting'), '2026-01-01 08:30:00+00', 'Council chamber');

INSERT INTO meeting_attendance (id, council_member, council_meeting, status) VALUES
  (
    test_uuid('ballot:eligibility:present'),
    test_uuid('ballot:eligibility:present-member'),
    test_uuid('ballot:eligibility:meeting'),
    'present'
  ),
  (
    test_uuid('ballot:eligibility:absent'),
    test_uuid('ballot:eligibility:absent-member'),
    test_uuid('ballot:eligibility:meeting'),
    'absent'
  ),
  (
    test_uuid('ballot:eligibility:excused'),
    test_uuid('ballot:eligibility:excused-member'),
    test_uuid('ballot:eligibility:meeting'),
    'excused'
  );

SELECT lives_ok(
  $$
    SELECT test_execute_deferred(ARRAY[
      $statement$
        INSERT INTO meeting_attendance (
          id, council_member, council_meeting, status, proxy_holder, proxy_document
        ) VALUES (
          test_uuid('ballot:eligibility:represented'),
          test_uuid('ballot:eligibility:represented-member'),
          test_uuid('ballot:eligibility:meeting'),
          'represented',
          test_uuid('ballot:eligibility:present'),
          test_uuid('ballot:eligibility:proxy-document')
        )
      $statement$
    ])
  $$,
  'the eligibility fixture contains a valid represented attendance'
);

INSERT INTO meeting_attendance(id,council_member,council_meeting,status) SELECT test_uuid('eligibility:extra:'||n),test_uuid('eligibility:extra-member:'||n),test_uuid('ballot:eligibility:meeting'),'present' FROM generate_series(1,3)n;
SELECT test_designate_present_officers(id) FROM council_meetings
WHERE started_at IS NULL AND EXISTS (SELECT FROM meeting_attendance WHERE council_meeting=council_meetings.id AND status='present');
UPDATE council_meetings
SET started_at = '2026-01-01 09:00:00+00'
WHERE id = test_uuid('ballot:eligibility:meeting');

SELECT test_create_decision_agenda_item(
  'ballot:eligibility',
  test_uuid('ballot:eligibility:meeting'),
  1
);

UPDATE council_agenda_item
SET started_at = '2026-01-01 09:05:00+00'
WHERE id = test_uuid('ballot:eligibility:agenda-item');

-- HALL-TR-CON-090: the represented participation exists, but chairman
-- validation remains deferred until the atomic cycle is complete.
SELECT throws_ok(
  $$
    SELECT test_execute_deferred(ARRAY[
      $statement$
        INSERT INTO ballots (id, council_agenda_item, mode, chairman)
        VALUES (
          test_uuid('ballot:represented-chair'),
          test_uuid('ballot:eligibility:agenda-item'),
          'public',
          test_uuid('ballot:represented-chair-participation')
        )
      $statement$,
      $statement$
        INSERT INTO ballot_participation (id, ballot, meeting_attendance)
        VALUES (
          test_uuid('ballot:represented-chair-participation'),
          test_uuid('ballot:represented-chair'),
          test_uuid('ballot:eligibility:represented')
        )
      $statement$
    ])
  $$,
  'HV410',
  'the ballot chairman must be a present ballot participation',
  'a represented participant cannot chair the ballot'
);

SELECT lives_ok(
  $$
    SELECT test_execute_deferred(ARRAY[
      $statement$
        INSERT INTO ballots (id, council_agenda_item, mode, chairman)
        VALUES (
          test_uuid('ballot:eligibility:ballot'),
          test_uuid('ballot:eligibility:agenda-item'),
          'public',
          test_uuid('ballot:eligibility:chair-participation')
        )
      $statement$,
      $statement$
        INSERT INTO ballot_participation (id, ballot, meeting_attendance)
        VALUES (
          test_uuid('ballot:eligibility:chair-participation'),
          test_uuid('ballot:eligibility:ballot'),
          test_uuid('ballot:eligibility:present')
        )
      $statement$,
      $statement$
        INSERT INTO ballot_participation (id, ballot, meeting_attendance)
        VALUES (
          test_uuid('ballot:eligibility:represented-participation'),
          test_uuid('ballot:eligibility:ballot'),
          test_uuid('ballot:eligibility:represented')
        )
      $statement$
    ])
  $$,
  'present and represented attendances can participate while only present chairs'
);

-- HALL-FR-BAL-100
SELECT throws_ok(
  $$
    INSERT INTO ballot_participation (id, ballot, meeting_attendance)
    VALUES (
      test_uuid('ballot:eligibility:absent-participation'),
      test_uuid('ballot:eligibility:ballot'),
      test_uuid('ballot:eligibility:absent')
    )
  $$,
  'HV304',
  'ballot participation requires voting attendance',
  'an absent member cannot participate'
);

SELECT throws_ok(
  $$
    INSERT INTO ballot_participation (id, ballot, meeting_attendance)
    VALUES (
      test_uuid('ballot:eligibility:excused-participation'),
      test_uuid('ballot:eligibility:ballot'),
      test_uuid('ballot:eligibility:excused')
    )
  $$,
  'HV304',
  'ballot participation requires voting attendance',
  'an excused member cannot participate'
);

-- HALL-FR-BAL-090
SELECT throws_ok(
  $$
    INSERT INTO ballot_participation (id, ballot, meeting_attendance)
    VALUES (
      test_uuid('ballot:wrong-meeting-participation'),
      test_uuid('ballot:eligibility:ballot'),
      test_uuid('ballot:main:attendance:2')
    )
  $$,
  'HV303',
  'ballot participation must belong to the ballot meeting',
  'participation cannot cross meeting boundaries'
);

-- HALL-FR-BAL-070 HALL-TR-INT-040
SELECT throws_ok(
  $$
    UPDATE ballot_participation
    SET meeting_attendance = test_uuid('ballot:main:attendance:2')
    WHERE id = test_uuid('ballot:main:participation:1')
  $$,
  'HV301',
  'ballot participation is immutable',
  'ballot participation cannot be updated'
);

SELECT throws_ok(
  $$DELETE FROM ballot_participation WHERE id = test_uuid('ballot:main:participation:1')$$,
  'HV301',
  'ballot participation is immutable',
  'ballot participation cannot be deleted'
);

SET CONSTRAINTS ALL IMMEDIATE;
SELECT throws_ok(
  $$TRUNCATE ballot_participation CASCADE$$,
  'HV301',
  'ballot participation is immutable',
  'TRUNCATE cannot bypass participation immutability'
);
SET CONSTRAINTS ALL DEFERRED;

-- Missing agenda-item diagnostic used by HALL-FR-BAL-230.
SELECT throws_ok(
  $$
    INSERT INTO ballots (id, council_agenda_item, mode, chairman)
    VALUES (
      test_uuid('ballot:unknown-agenda-item'),
      test_uuid('agenda-item:unknown'),
      'public',
      test_uuid('participation:unknown-chair')
    )
  $$,
  'HV904',
  NULL,
  'ballot insertion reports an unknown agenda item explicitly'
);

-- HALL-FR-BAL-230
SELECT lives_ok(
  $$
    INSERT INTO council_meetings (id, scheduled_at, location) VALUES
(test_uuid('ballot:inactive:meeting'), '2026-01-01 08:30:00+00', 'Council chamber')
  $$,
  'inactive-agenda-item fixture meeting is created'
);

INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
VALUES (
  test_uuid('ballot:inactive:attendance'),
  test_uuid('ballot:inactive:member'),
  test_uuid('ballot:inactive:meeting'),
  'present'
);

SELECT test_designate_present_officers(id) FROM council_meetings
WHERE started_at IS NULL AND EXISTS (SELECT FROM meeting_attendance WHERE council_meeting=council_meetings.id AND status='present');
UPDATE council_meetings
SET started_at = '2026-01-01 09:00:00+00'
WHERE id = test_uuid('ballot:inactive:meeting');

SELECT test_create_decision_agenda_item(
  'ballot:inactive',
  test_uuid('ballot:inactive:meeting'),
  1
);

SELECT throws_ok(
  $$
    INSERT INTO ballots (id, council_agenda_item, mode, chairman)
    VALUES (
      test_uuid('ballot:on-inactive-agenda-item'),
      test_uuid('ballot:inactive:agenda-item'),
      'public',
      test_uuid('ballot:on-inactive-agenda-item-chair')
    )
  $$,
  'HV404',
  'a ballot requires an active agenda item',
  'a ballot cannot attach to an inactive agenda item'
);

SELECT schedule_open_question(
  test_uuid('ballot:inactive:business'),
  test_uuid('ballot:inactive:meeting'),
  2
);
UPDATE council_agenda_item
SET started_at = '2026-01-01 09:05:00+00'
WHERE open_question IS NOT NULL
  AND council_business = test_uuid('ballot:inactive:business');

SELECT throws_ok(
  $$
    INSERT INTO ballots (id, council_agenda_item, mode, chairman)
    SELECT
      test_uuid('ballot:on-open-question'),
      id,
      'public',
      test_uuid('ballot:on-open-question-chair')
    FROM council_agenda_item
    WHERE open_question IS NOT NULL
      AND council_business = test_uuid('ballot:inactive:business')
  $$,
  'HV411',
  'an open question cannot receive a ballot',
  'an open question is structurally outside the ballot lifecycle'
);

-- HALL-FR-BAL-220: this defensive branch is exercised against a deliberately
-- inconsistent imported fixture; normal lifecycle operations cannot create a
-- agenda item before its meeting starts.
INSERT INTO council_meetings (id) VALUES
(test_uuid('ballot:unstarted:meeting'));

SELECT test_create_decision_agenda_item(
  'ballot:unstarted',
  test_uuid('ballot:unstarted:meeting'),
  1
);
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE council_agenda_item DISABLE TRIGGER council_agenda_item_enforce_lifecycle;
ALTER TABLE council_agenda_item DISABLE TRIGGER council_agenda_item_quorum;
UPDATE council_agenda_item
SET started_at = '2026-01-01 09:05:00+00'
WHERE id = test_uuid('ballot:unstarted:agenda-item');
ALTER TABLE council_agenda_item ENABLE TRIGGER council_agenda_item_enforce_lifecycle;
ALTER TABLE council_agenda_item ENABLE TRIGGER council_agenda_item_quorum;
SET CONSTRAINTS ALL DEFERRED;

SELECT throws_ok(
  $$
    INSERT INTO ballots (id, council_agenda_item, mode, chairman)
    VALUES (
      test_uuid('ballot:on-unstarted-meeting'),
      test_uuid('ballot:unstarted:agenda-item'),
      'public',
      test_uuid('ballot:on-unstarted-meeting-chair')
    )
  $$,
  'HV403',
  'a ballot requires a started council meeting',
  'the ballot authority rejects an inconsistent unstarted-meeting fixture'
);

-- HALL-FR-BAL-210
SELECT throws_ok(
  $$
    INSERT INTO ballots (id, council_agenda_item, mode, chairman, completed_at, result)
    VALUES (
      test_uuid('ballot:insert-completed'),
      test_uuid('ballot:inactive:agenda-item'),
      'public',
      test_uuid('ballot:insert-completed-chair'),
      '2026-01-01 09:10:00+00',
      'approve'
    )
  $$,
  'HV402',
  'a ballot must be open on insert',
  'a ballot cannot be inserted as completed'
);

-- Native foreign-key SQLSTATE from HALL-TR-ERR-010. The chairman reference is
-- intentionally deferred, so the violation is forced explicitly.
INSERT INTO council_meetings (id, scheduled_at, location) VALUES
(test_uuid('ballot:missing-chair:meeting'), '2026-01-01 08:30:00+00', 'Council chamber');

INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
VALUES (
  test_uuid('ballot:missing-chair:attendance'),
  test_uuid('ballot:missing-chair:member'),
  test_uuid('ballot:missing-chair:meeting'),
  'present'
);

SELECT test_designate_present_officers(id) FROM council_meetings
WHERE started_at IS NULL AND EXISTS (SELECT FROM meeting_attendance WHERE council_meeting=council_meetings.id AND status='present');
UPDATE council_meetings
SET started_at = '2026-01-01 09:00:00+00'
WHERE id = test_uuid('ballot:missing-chair:meeting');

SELECT test_create_decision_agenda_item(
  'ballot:missing-chair',
  test_uuid('ballot:missing-chair:meeting'),
  1
);

UPDATE council_agenda_item
SET started_at = '2026-01-01 09:05:00+00'
WHERE id = test_uuid('ballot:missing-chair:agenda-item');

SELECT throws_ok(
  $$
    SELECT test_execute_deferred(ARRAY[
      $statement$
        INSERT INTO ballots (id, council_agenda_item, mode, chairman)
        VALUES (
          test_uuid('ballot:missing-chair:ballot'),
          test_uuid('ballot:missing-chair:agenda-item'),
          'public',
          test_uuid('ballot:missing-chair:participation')
        )
      $statement$
    ])
  $$,
  '23503',
  NULL,
  'a missing deferred chairman reference keeps the native foreign-key SQLSTATE'
);

-- HALL-FR-BAL-240
SELECT throws_ok(
  $$UPDATE ballots SET mode = 'secret' WHERE id = test_uuid('ballot:main:ballot')$$,
  'HV405',
  'a ballot definition is immutable',
  'ballot mode cannot be rewritten'
);

-- HALL-FR-BAL-260
SELECT throws_ok(
  $$UPDATE ballots SET result = 'approve' WHERE id = test_uuid('ballot:main:ballot')$$,
  'HV407',
  'a ballot result is computed on completion',
  'callers cannot set the ballot result manually'
);

-- HALL-FR-BAL-200 HALL-TR-INT-050
SELECT throws_ok(
  $$DELETE FROM ballots WHERE id = test_uuid('ballot:main:ballot')$$,
  'HV401',
  'a ballot is immutable',
  'a ballot cannot be deleted'
);

SET CONSTRAINTS ALL IMMEDIATE;
SELECT throws_ok(
  $$TRUNCATE ballots CASCADE$$,
  'HV401',
  'a ballot is immutable',
  'TRUNCATE cannot bypass ballot immutability'
);
SET CONSTRAINTS ALL DEFERRED;

-- HALL-TR-CON-060 HALL-TR-CON-080: pgTAP verifies the deterministic lock
-- declarations; a two-session scheduler is required to prove blocking order.
SELECT ok(
  pg_get_functiondef('enforce_ballot_participation_lifecycle()'::regprocedure)
    LIKE '%FOR UPDATE OF ballots%',
  'participation insertion locks its ballot before completion validation'
);

SELECT ok(
  pg_get_functiondef('enforce_ballot_lifecycle()'::regprocedure)
    LIKE '%FOR UPDATE OF council_agenda_item%',
  'ballot creation locks its agenda item before active-state validation'
);

SELECT * FROM finish();
ROLLBACK;
