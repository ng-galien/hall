BEGIN;
\ir support/helpers.sql
SELECT no_plan();

-- HALL-FR-MTG-010
SELECT throws_ok(
  $$INSERT INTO council_meetings (id) VALUES
(NULL)$$,
  '23502',
  NULL,
  'declarative NOT NULL violations keep their native SQLSTATE'
);

-- HALL-FR-MTG-040
SELECT throws_ok(
  $$
    INSERT INTO council_meetings (id, started_at) VALUES
(test_uuid('mtg:insert-started'), '2026-01-01 09:00:00+00')
  $$,
  'HV112',
  'a council meeting must not be started on insert',
  'a meeting is inserted in preparation'
);

INSERT INTO council_meetings (id, scheduled_at, location) VALUES
(test_uuid('mtg:main'), NULL, NULL),
(test_uuid('mtg:other'), NULL, NULL),
(test_uuid('mtg:no-quorum'), '2026-01-01 08:30:00+00', 'Council chamber');

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

-- HALL-FR-ATT-100
SELECT throws_ok(
  $$DELETE FROM hall.council_member WHERE id = test_uuid('member:present-1')$$,
  '23503',
  NULL,
  'an attendance keeps its CouncilMember mandate referenced'
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

-- HALL-FR-ATT-110
SELECT throws_ok(
  $$DELETE FROM hall.document_resource WHERE id = test_uuid('document:proxy-1')$$,
  '23503',
  NULL,
  'represented attendance keeps its written DocumentResource evidence referenced'
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

INSERT INTO council_meetings (id) VALUES
(test_uuid('mtg:attendance-action'));

-- HALL-TR-CON-040 HALL-TR-INT-070
SELECT lives_ok(
  format(
    $sql$
      SELECT hall_api.record_meeting_attendance(
        %L::UUID,
        jsonb_build_array(
          jsonb_build_object(
            'council_member_id', %L::UUID,
            'status', 'represented',
            'proxy_holder_council_member_id', %L::UUID,
            'proxy_document_id', %L::UUID
          ),
          jsonb_build_object(
            'council_member_id', %L::UUID,
            'status', 'present'
          )
        )
      )
    $sql$,
    test_uuid('mtg:attendance-action'),
    test_uuid('member:attendance-action:represented'),
    test_uuid('member:attendance-action:present'),
    test_uuid('document:attendance-action:proxy'),
    test_uuid('member:attendance-action:present')
  ),
  'the named batch action resolves a proxy holder declared later in the same input'
);

SELECT is(
  jsonb_array_length(hall_api.list_meeting_attendance(test_uuid('mtg:attendance-action'))),
  2,
  'the attendance projection returns both immutable declarations'
);

SELECT is(
  (
    SELECT declaration ->> 'proxyHolderCouncilMemberId'
    FROM jsonb_array_elements(
      hall_api.list_meeting_attendance(test_uuid('mtg:attendance-action'))
    ) AS declaration
    WHERE declaration ->> 'status' = 'represented'
  ),
  test_uuid('member:attendance-action:present')::TEXT,
  'the projection exposes the proxy holder CouncilMember rather than its persistence row'
);

-- HALL-FR-ATT-030
SELECT throws_ok(
  $$
    SELECT hall_api.record_meeting_attendance(
      test_uuid('mtg:attendance-action'),
      '{}'::JSONB
    )
  $$,
  'HV104',
  'meeting attendance declarations must be a JSON array',
  'the named action rejects a declaration payload that is not an array'
);

-- HALL-FR-MTG-050
SELECT throws_ok(
  $$UPDATE council_meetings SET number = number + 1000 WHERE id = test_uuid('mtg:main')$$,
  'HV113',
  'a council meeting definition is immutable',
  'meeting identity cannot be rewritten'
);

INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
VALUES (
  test_uuid('att:no-quorum-present'),
  test_uuid('member:no-quorum-present'),
  test_uuid('mtg:no-quorum'),
  'present'
);

-- HALL-FR-MTG-070
INSERT INTO meeting_attendance(id,council_member,council_meeting,status) VALUES(test_uuid('att:no-quorum-absent'),test_uuid('member:no-quorum-absent'),test_uuid('mtg:no-quorum'),'absent');
SELECT test_confirm_declared_membership(test_uuid('mtg:no-quorum'));
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

-- HALL-FR-MTG-160
SELECT throws_ok(
  $$SELECT schedule_council_meeting(test_uuid('mtg:main'), NULL, 'Council chamber')$$,
  'HV122',
  'a council meeting schedule requires a date and location',
  'the named scheduling action requires a date and location'
);

SELECT lives_ok(
  $$SELECT schedule_council_meeting(
      test_uuid('mtg:main'),
      '2026-01-01 08:30:00+00',
      ' Council chamber '
    )$$,
  'the meeting schedule is assigned through its named action'
);

SELECT is(
  (SELECT location FROM council_meetings WHERE id = test_uuid('mtg:main')),
  'Council chamber',
  'the scheduling action normalizes the meeting location'
);

SELECT test_designate_present_officers(test_uuid('mtg:main'));

-- HALL-FR-MTG-170
SELECT lives_ok(
  $$SELECT start_council_meeting(test_uuid('mtg:main'), '2026-01-01 09:00:00+00')$$,
  'a meeting starts through its named action once physical quorum is reached'
);

-- HALL-FR-ATT-080 HALL-TR-INT-010
SELECT throws_ok(
  $$UPDATE meeting_attendance SET status = 'absent' WHERE id = test_uuid('att:present-1')$$,
  'HV102',
  'a started council meeting cannot receive attendance',
  'attendance cannot be updated'
);

SELECT throws_ok(
  $$DELETE FROM meeting_attendance WHERE id = test_uuid('att:present-1')$$,
  'HV102',
  'a started council meeting cannot receive attendance',
  'attendance cannot be deleted'
);

SET CONSTRAINTS ALL IMMEDIATE;
SELECT throws_ok(
  $$TRUNCATE meeting_attendance CASCADE$$,
  'HV101',
  'meeting attendance cannot be truncated',
  'TRUNCATE cannot bypass attendance immutability'
);
SET CONSTRAINTS ALL DEFERRED;


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
