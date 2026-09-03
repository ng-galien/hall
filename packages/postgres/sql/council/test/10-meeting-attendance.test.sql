BEGIN;
\ir support/helpers.sql
SELECT no_plan();

-- HALL-FR-MTG-010
SELECT throws_ok(
  $$INSERT INTO council_meetings (id, quorum) VALUES (test_uuid('mtg:bad-quorum'), 0)$$,
  '23514',
  NULL,
  'a meeting quorum must be positive and keeps the native CHECK SQLSTATE'
);

SELECT throws_ok(
  $$INSERT INTO council_meetings (id, quorum) VALUES (NULL, 1)$$,
  '23502',
  NULL,
  'declarative NOT NULL violations keep their native SQLSTATE'
);

-- HALL-FR-MTG-040
SELECT throws_ok(
  $$
    INSERT INTO council_meetings (id, quorum, started_at)
    VALUES (test_uuid('mtg:insert-started'), 1, '2026-01-01 09:00:00+00')
  $$,
  'HV112',
  'a council meeting must not be started on insert',
  'a meeting is inserted in preparation'
);

INSERT INTO council_meetings (id, quorum) VALUES
  (test_uuid('mtg:main'), 2),
  (test_uuid('mtg:other'), 1),
  (test_uuid('mtg:no-quorum'), 2);

-- Missing reference diagnostic used by HALL-FR-ATT-090.
SELECT throws_ok(
  $$
    INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
    VALUES (
      test_uuid('att:unknown-meeting'),
      test_uuid('member:unknown-meeting'),
      test_uuid('mtg:unknown'),
      'present'
    )
  $$,
  'HV901',
  NULL,
  'attendance reports an unknown meeting before the foreign key does'
);

INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
VALUES (
  test_uuid('att:present-1'),
  test_uuid('member:present-1'),
  test_uuid('mtg:main'),
  'present'
);

-- HALL-TR-CON-010 HALL-TR-CON-030 HALL-FR-ATT-070
SELECT lives_ok(
  $$
    SELECT test_execute_deferred(ARRAY[
      $statement$
        INSERT INTO meeting_attendance (
          id, council_member, council_meeting, status, proxy_holder, proxy_document
        ) VALUES (
          test_uuid('att:represented'),
          test_uuid('member:represented'),
          test_uuid('mtg:main'),
          'represented',
          test_uuid('att:present-2'),
          test_uuid('document:proxy-1')
        )
      $statement$,
      $statement$
        INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
        VALUES (
          test_uuid('att:present-2'),
          test_uuid('member:present-2'),
          test_uuid('mtg:main'),
          'present'
        )
      $statement$
    ])
  $$,
  'represented and holder attendances can be inserted atomically in reverse order'
);

-- HALL-FR-ATT-030
SELECT throws_ok(
  $$
    INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
    VALUES (
      test_uuid('att:represented-without-proxy'),
      test_uuid('member:represented-without-proxy'),
      test_uuid('mtg:main'),
      'represented'
    )
  $$,
  '23514',
  NULL,
  'a represented attendance requires both holder and document'
);

SELECT throws_ok(
  $$
    INSERT INTO meeting_attendance (
      id, council_member, council_meeting, status, proxy_holder, proxy_document
    ) VALUES (
      test_uuid('att:present-with-proxy'),
      test_uuid('member:present-with-proxy'),
      test_uuid('mtg:main'),
      'present',
      test_uuid('att:present-1'),
      test_uuid('document:present-proxy')
    )
  $$,
  '23514',
  NULL,
  'a non-represented attendance cannot carry proxy data'
);

-- HALL-FR-ATT-040
SELECT throws_ok(
  $$
    INSERT INTO meeting_attendance (
      id, council_member, council_meeting, status, proxy_holder, proxy_document
    ) VALUES (
      test_uuid('att:self-proxy'),
      test_uuid('member:self-proxy'),
      test_uuid('mtg:main'),
      'represented',
      test_uuid('att:self-proxy'),
      test_uuid('document:self-proxy')
    )
  $$,
  '23514',
  NULL,
  'a member cannot hold their own proxy'
);

-- HALL-FR-ATT-020
SELECT throws_ok(
  $$
    INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
    VALUES (
      test_uuid('att:duplicate-member'),
      test_uuid('member:present-1'),
      test_uuid('mtg:main'),
      'absent'
    )
  $$,
  '23505',
  NULL,
  'one member has one attendance per meeting'
);

SELECT lives_ok(
  $$
    INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
    VALUES (
      test_uuid('att:same-member-other-meeting'),
      test_uuid('member:present-1'),
      test_uuid('mtg:other'),
      'present'
    )
  $$,
  'the same member can have attendance in another meeting'
);

-- HALL-FR-ATT-050
SELECT throws_ok(
  $$
    INSERT INTO meeting_attendance (
      id, council_member, council_meeting, status, proxy_holder, proxy_document
    ) VALUES (
      test_uuid('att:second-proxy-for-holder'),
      test_uuid('member:second-proxy-for-holder'),
      test_uuid('mtg:main'),
      'represented',
      test_uuid('att:present-2'),
      test_uuid('document:proxy-2')
    )
  $$,
  '23505',
  NULL,
  'one present attendance holds at most one proxy in a meeting'
);

-- HALL-FR-ATT-060
SELECT throws_ok(
  $$
    INSERT INTO meeting_attendance (
      id, council_member, council_meeting, status, proxy_holder, proxy_document
    ) VALUES (
      test_uuid('att:second-use-document'),
      test_uuid('member:second-use-document'),
      test_uuid('mtg:main'),
      'represented',
      test_uuid('att:present-1'),
      test_uuid('document:proxy-1')
    )
  $$,
  '23505',
  NULL,
  'one proxy document is used once per meeting'
);

INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
VALUES (
  test_uuid('att:other-present'),
  test_uuid('member:other-present'),
  test_uuid('mtg:other'),
  'present'
);

SELECT throws_ok(
  $$
    SELECT test_execute_deferred(ARRAY[
      $statement$
        INSERT INTO meeting_attendance (
          id, council_member, council_meeting, status, proxy_holder, proxy_document
        ) VALUES (
          test_uuid('att:wrong-meeting-proxy'),
          test_uuid('member:wrong-meeting-proxy'),
          test_uuid('mtg:main'),
          'represented',
          test_uuid('att:other-present'),
          test_uuid('document:wrong-meeting-proxy')
        )
      $statement$
    ])
  $$,
  'HV103',
  'a proxy holder must be present in the represented member meeting',
  'deferred validation rejects a holder from another meeting'
);

SELECT ok(
  meeting_attendance_is_valid_proxy_holder(
    test_uuid('mtg:main'),
    test_uuid('att:present-2')
  ),
  'the proxy predicate accepts a present holder in the same meeting'
);

SELECT ok(
  NOT meeting_attendance_is_valid_proxy_holder(
    test_uuid('mtg:main'),
    test_uuid('att:represented')
  ),
  'the proxy predicate rejects a represented holder'
);

-- HALL-FR-MTG-020
SELECT is(
  council_meeting_present_member_count(test_uuid('mtg:main')),
  2,
  'quorum counts only the two physically present members'
);

-- HALL-FR-ATT-080 HALL-TR-INT-010
SELECT throws_ok(
  $$UPDATE meeting_attendance SET status = 'absent' WHERE id = test_uuid('att:present-1')$$,
  'HV101',
  'meeting attendance is immutable',
  'attendance cannot be updated'
);

SELECT throws_ok(
  $$DELETE FROM meeting_attendance WHERE id = test_uuid('att:present-1')$$,
  'HV101',
  'meeting attendance is immutable',
  'attendance cannot be deleted'
);

SET CONSTRAINTS ALL IMMEDIATE;
SELECT throws_ok(
  $$TRUNCATE meeting_attendance CASCADE$$,
  'HV101',
  'meeting attendance is immutable',
  'TRUNCATE cannot bypass attendance immutability'
);
SET CONSTRAINTS ALL DEFERRED;

-- HALL-FR-MTG-050
SELECT throws_ok(
  $$UPDATE council_meetings SET quorum = 3 WHERE id = test_uuid('mtg:main')$$,
  'HV113',
  'a council meeting definition is immutable',
  'meeting quorum cannot be rewritten'
);

INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
VALUES (
  test_uuid('att:no-quorum-present'),
  test_uuid('member:no-quorum-present'),
  test_uuid('mtg:no-quorum'),
  'present'
);

-- HALL-FR-MTG-070
SELECT throws_ok(
  $$
    UPDATE council_meetings
    SET started_at = '2026-01-01 09:00:00+00'
    WHERE id = test_uuid('mtg:no-quorum')
  $$,
  'HV115',
  'the council meeting quorum is not reached',
  'a meeting cannot start below its physical-presence quorum'
);

SELECT lives_ok(
  $$
    UPDATE council_meetings
    SET started_at = '2026-01-01 09:00:00+00'
    WHERE id = test_uuid('mtg:main')
  $$,
  'a meeting starts once its physical quorum is reached'
);

-- HALL-FR-ATT-090
SELECT throws_ok(
  $$
    INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
    VALUES (
      test_uuid('att:after-start'),
      test_uuid('member:after-start'),
      test_uuid('mtg:main'),
      'present'
    )
  $$,
  'HV102',
  'a started council meeting cannot receive attendance',
  'attendance closes when its meeting starts'
);

-- HALL-FR-MTG-060
SELECT throws_ok(
  $$
    UPDATE council_meetings
    SET started_at = '2026-01-01 09:01:00+00'
    WHERE id = test_uuid('mtg:main')
  $$,
  'HV114',
  'a started council meeting lifecycle is immutable',
  'a started meeting timestamp cannot change'
);

SELECT lives_ok(
  $$UPDATE council_meetings SET started_at = started_at WHERE id = test_uuid('mtg:main')$$,
  'an observationally harmless meeting no-op remains legal'
);

-- HALL-FR-MTG-030 HALL-TR-INT-020
SELECT throws_ok(
  $$DELETE FROM council_meetings WHERE id = test_uuid('mtg:main')$$,
  'HV111',
  'a council meeting is immutable',
  'a meeting cannot be deleted'
);

SET CONSTRAINTS ALL IMMEDIATE;
SELECT throws_ok(
  $$TRUNCATE council_meetings CASCADE$$,
  'HV111',
  'a council meeting is immutable',
  'TRUNCATE cannot bypass meeting immutability'
);
SET CONSTRAINTS ALL DEFERRED;

-- HALL-TR-CON-020: pgTAP cannot prove two-session scheduling; it does verify
-- that the insertion authority locks the meeting row used by the invariant.
SELECT ok(
  pg_get_functiondef('enforce_meeting_attendance_lifecycle()'::regprocedure)
    LIKE '%FOR UPDATE%',
  'attendance insertion declares a meeting-row lock before start validation'
);

SELECT * FROM finish();
ROLLBACK;
