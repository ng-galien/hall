BEGIN;
\ir support/helpers.sql
SELECT no_plan();

INSERT INTO council_meetings (id, quorum, scheduled_at, location)
VALUES (test_uuid('actions:public:meeting'), 2, '2026-01-01 08:30:00+00', 'Council chamber');

INSERT INTO meeting_attendance (
  id,
  council_member,
  council_meeting,
  status,
  proxy_holder,
  proxy_document
) VALUES
  (
    test_uuid('actions:public:attendance:1'),
    test_uuid('actions:public:member:1'),
    test_uuid('actions:public:meeting'),
    'present',
    NULL,
    NULL
  ),
  (
    test_uuid('actions:public:attendance:2'),
    test_uuid('actions:public:member:2'),
    test_uuid('actions:public:meeting'),
    'present',
    NULL,
    NULL
  ),
  (
    test_uuid('actions:public:attendance:3'),
    test_uuid('actions:public:member:3'),
    test_uuid('actions:public:meeting'),
    'represented',
    test_uuid('actions:public:attendance:1'),
    test_uuid('actions:public:proxy')
  );

SELECT test_designate_present_officers(id) FROM council_meetings
WHERE started_at IS NULL AND EXISTS (SELECT FROM meeting_attendance WHERE council_meeting=council_meetings.id AND status='present');
UPDATE council_meetings
SET started_at = '2026-01-01 09:00:00+00'
WHERE id = test_uuid('actions:public:meeting');

SELECT test_create_decision_agenda_item(
  'actions:public',
  test_uuid('actions:public:meeting'),
  1
);

UPDATE council_agenda_item
SET started_at = '2026-01-01 09:05:00+00'
WHERE id = test_uuid('actions:public:agenda-item');

-- HALL-TR-CON-150
SELECT lives_ok(
  $$
    SELECT create_ballot(
      test_uuid('actions:public:agenda-item'),
      'public',
      ARRAY[
        test_uuid('actions:public:attendance:1'),
        test_uuid('actions:public:attendance:2'),
        test_uuid('actions:public:attendance:3')
      ],
      test_uuid('actions:public:attendance:1')
    )
  $$,
  'ballot creation atomically creates all participations and its chairman'
);

SELECT is(
  (
    SELECT participation.meeting_attendance
    FROM ballots AS ballot
    JOIN ballot_participation AS participation
      ON participation.id = ballot.chairman
    WHERE ballot.council_agenda_item = test_uuid('actions:public:agenda-item')
  ),
  test_uuid('actions:public:attendance:1'),
  'the ballot chairman is the participation backed by the selected present attendance'
);

-- HALL-TR-CON-160
SELECT lives_ok(
  $$
    SELECT record_public_ballot_votes(
      (
        SELECT id
        FROM ballots
        WHERE council_agenda_item = test_uuid('actions:public:agenda-item')
      ),
      ARRAY(
        SELECT id
        FROM ballot_participation
        WHERE ballot = (
          SELECT id
          FROM ballots
          WHERE council_agenda_item = test_uuid('actions:public:agenda-item')
        )
        ORDER BY id
      ),
      ARRAY['approve', 'reject', 'approve']::vote_choice[]
    )
  $$,
  'public votes are recorded as one atomic nominative batch'
);

-- HALL-FR-BAL-300
SELECT lives_ok(
  $$
    SELECT complete_ballot(
      (
        SELECT id
        FROM ballots
        WHERE council_agenda_item = test_uuid('actions:public:agenda-item')
      ),
      '2026-01-01 09:30:00+00'
    )
  $$,
  'the named completion action derives and records the public ballot result'
);

SELECT is(
  (
    SELECT result
    FROM ballots
    WHERE council_agenda_item = test_uuid('actions:public:agenda-item')
  ),
  'approve'::ballot_result,
  'the public action path retains the derived majority result'
);

INSERT INTO council_meetings (id, quorum, scheduled_at, location)
VALUES (test_uuid('actions:secret:meeting'), 1, '2026-01-02 08:30:00+00', 'Council chamber');

INSERT INTO meeting_attendance (id, council_member, council_meeting, status) VALUES
  (
    test_uuid('actions:secret:attendance:1'),
    test_uuid('actions:secret:member:1'),
    test_uuid('actions:secret:meeting'),
    'present'
  ),
  (
    test_uuid('actions:secret:attendance:2'),
    test_uuid('actions:secret:member:2'),
    test_uuid('actions:secret:meeting'),
    'present'
  ),
  (
    test_uuid('actions:secret:attendance:3'),
    test_uuid('actions:secret:member:3'),
    test_uuid('actions:secret:meeting'),
    'present'
  );

SELECT test_designate_present_officers(id) FROM council_meetings
WHERE started_at IS NULL AND EXISTS (SELECT FROM meeting_attendance WHERE council_meeting=council_meetings.id AND status='present');
UPDATE council_meetings
SET started_at = '2026-01-02 09:00:00+00'
WHERE id = test_uuid('actions:secret:meeting');

SELECT test_create_decision_agenda_item(
  'actions:secret',
  test_uuid('actions:secret:meeting'),
  1
);

UPDATE council_agenda_item
SET started_at = '2026-01-02 09:05:00+00'
WHERE id = test_uuid('actions:secret:agenda-item');

SELECT create_ballot(
  test_uuid('actions:secret:agenda-item'),
  'secret',
  ARRAY[
    test_uuid('actions:secret:attendance:1'),
    test_uuid('actions:secret:attendance:2'),
    test_uuid('actions:secret:attendance:3')
  ],
  test_uuid('actions:secret:attendance:1')
);

-- HALL-TR-CON-170
SELECT lives_ok(
  $$
    SELECT record_secret_ballot_votes(
      (
        SELECT id
        FROM ballots
        WHERE council_agenda_item = test_uuid('actions:secret:agenda-item')
      ),
      2,
      1,
      0
    )
  $$,
  'secret votes are recorded as one atomic anonymous aggregate batch'
);

SELECT lives_ok(
  $$
    SELECT complete_ballot(
      (
        SELECT id
        FROM ballots
        WHERE council_agenda_item = test_uuid('actions:secret:agenda-item')
      ),
      '2026-01-02 09:30:00+00'
    )
  $$,
  'the named completion action derives and records the secret ballot result'
);

SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM votes
    WHERE ballot = (
      SELECT id
      FROM ballots
      WHERE council_agenda_item = test_uuid('actions:secret:agenda-item')
    )
  ),
  2,
  'zero secret totals do not create artificial vote rows'
);

SELECT * FROM finish();
ROLLBACK;
