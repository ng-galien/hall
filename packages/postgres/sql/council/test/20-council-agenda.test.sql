BEGIN;
\ir support/helpers.sql
SELECT no_plan();

INSERT INTO council_meetings (id, scheduled_at, location) VALUES
(test_uuid('agenda:previous-meeting'), '2026-01-01 08:00:00+00', 'Council chamber'),
(test_uuid('agenda:meeting'), '2026-01-01 08:30:00+00', 'Council chamber'),
(test_uuid('agenda:other-meeting'), '2026-01-01 08:45:00+00', 'Council chamber'),
(test_uuid('agenda:future-meeting'), '2026-02-01 09:00:00+00', 'Council chamber');

INSERT INTO meeting_attendance (id, council_member, council_meeting, status) VALUES
  (test_uuid('agenda:previous-attendance'), test_uuid('agenda:previous-member'), test_uuid('agenda:previous-meeting'), 'present'),
  (test_uuid('agenda:attendance'), test_uuid('agenda:member'), test_uuid('agenda:meeting'), 'present'),
  (test_uuid('agenda:other-attendance'), test_uuid('agenda:other-member'), test_uuid('agenda:other-meeting'), 'present');

SELECT test_ensure_business(test_uuid('agenda:previous-business'));
CREATE TEMP TABLE deferred_open_item AS
SELECT schedule_open_question(
  test_uuid('agenda:previous-business'),
  test_uuid('agenda:previous-meeting'),
  2
) AS id;
SELECT test_designate_present_officers(test_uuid('agenda:previous-meeting'));
SELECT test_prepare_notice(test_uuid('agenda:previous-meeting'));
SELECT start_council_meeting(test_uuid('agenda:previous-meeting'), '2026-01-01 09:00Z');

-- HALL-FR-BUS-010 HALL-FR-AGI-200 HALL-FR-AGI-210
SELECT test_ensure_business(test_uuid('agenda:business'));

CREATE TEMP TABLE scheduled_item (kind TEXT PRIMARY KEY, id UUID NOT NULL);
INSERT INTO scheduled_item VALUES
  ('decision', schedule_council_decision_proposal(
    test_uuid('agenda:business'), test_uuid('agenda:meeting'), 2
  )),
  ('open', schedule_open_question(
    test_uuid('agenda:business'), test_uuid('agenda:meeting'), 3
  ));

SELECT is(
  (SELECT count(*)::INTEGER FROM council_agenda_item WHERE council_business = test_uuid('agenda:business')),
  2,
  'one CouncilBusiness can prepare several decision and open subjects'
);

-- HALL-FR-MIN-010 HALL-FR-MIN-020 HALL-FR-AGI-220
SELECT capture_council_meeting_snapshot(test_uuid('agenda:previous-meeting'), 'closing', '2026-01-01 10:00Z');
INSERT INTO minutes (id, council_meeting)
VALUES (test_uuid('agenda:minutes'), test_uuid('agenda:previous-meeting'));
INSERT INTO minutes_approval (id, minutes)
VALUES (test_uuid('agenda:minutes-approval'), test_uuid('agenda:minutes'));
SELECT lives_ok(
  $$SELECT schedule_minutes_approval(
      test_uuid('agenda:meeting'),
      test_uuid('agenda:minutes-approval')
    )$$,
  'minutes approval is scheduled at position one'
);

SELECT throws_ok(
  $$INSERT INTO minutes (id, council_meeting)
    VALUES (test_uuid('agenda:duplicate-minutes'), test_uuid('agenda:previous-meeting'))$$,
  '23505',
  NULL,
  'one council meeting produces at most one Minutes'
);

SELECT throws_ok(
  $$INSERT INTO minutes_approval (id, minutes)
    VALUES (test_uuid('agenda:duplicate-approval'), test_uuid('agenda:minutes'))$$,
  '23505',
  NULL,
  'one Minutes has at most one MinutesApproval'
);

-- HALL-FR-AGI-290 HALL-TR-CON-190
-- Reordering is one exact, atomic permutation of the programmed agenda. The
-- minutes approval remains first, gaps are preserved and deprogrammed rows do
-- not participate in the command.
CREATE TEMP TABLE reorder_item (kind TEXT PRIMARY KEY, id UUID NOT NULL);
INSERT INTO reorder_item VALUES
  ('minutes', schedule_minutes_approval(
    test_uuid('agenda:future-meeting'),
    test_uuid('agenda:minutes-approval')
  )),
  ('decision', schedule_council_decision_proposal(
    test_uuid('agenda:business'), test_uuid('agenda:future-meeting'), 4
  )),
  ('open', schedule_open_question(
    test_uuid('agenda:business'), test_uuid('agenda:future-meeting'), 7
  )),
  ('deprogrammed', schedule_open_question(
    test_uuid('agenda:business'), test_uuid('agenda:future-meeting'), 9
  ));

SELECT deprogram_council_agenda_item(
  (SELECT id FROM reorder_item WHERE kind = 'deprogrammed')
);

SELECT lives_ok(
  format(
    'SELECT reorder_council_agenda(%L::uuid, ARRAY[%L::uuid, %L::uuid, %L::uuid])',
    test_uuid('agenda:future-meeting'),
    (SELECT id FROM reorder_item WHERE kind = 'minutes'),
    (SELECT id FROM reorder_item WHERE kind = 'open'),
    (SELECT id FROM reorder_item WHERE kind = 'decision')
  ),
  'the complete programmed agenda can be reordered atomically'
);

SELECT results_eq(
  $$SELECT kind, position
    FROM reorder_item
    JOIN council_agenda_item USING (id)
    ORDER BY abs(position)$$,
  $$VALUES
    ('minutes'::text, 1),
    ('open'::text, 4),
    ('decision'::text, 7),
    ('deprogrammed'::text, -9)$$,
  'reorder preserves the position set and leaves the deprogrammed item unchanged'
);

SELECT throws_ok(
  format(
    'SELECT reorder_council_agenda(%L::uuid, ARRAY[%L::uuid, %L::uuid, %L::uuid])',
    test_uuid('agenda:future-meeting'),
    (SELECT id FROM reorder_item WHERE kind = 'minutes'),
    (SELECT id FROM reorder_item WHERE kind = 'open'),
    (SELECT id FROM reorder_item WHERE kind = 'open')
  ),
  'HV224',
  'a council agenda reorder must contain every programmed item exactly once with minutes first',
  'a duplicate item cannot hide a missing programmed item'
);

SELECT throws_ok(
  format(
    'SELECT reorder_council_agenda(%L::uuid, ARRAY[%L::uuid, %L::uuid, %L::uuid])',
    test_uuid('agenda:future-meeting'),
    (SELECT id FROM reorder_item WHERE kind = 'open'),
    (SELECT id FROM reorder_item WHERE kind = 'minutes'),
    (SELECT id FROM reorder_item WHERE kind = 'decision')
  ),
  'HV224',
  'a council agenda reorder must contain every programmed item exactly once with minutes first',
  'minutes approval cannot be moved away from the first position'
);

SELECT throws_ok(
  format(
    'SELECT reorder_council_agenda(%L::uuid, ARRAY[%L::uuid, %L::uuid, %L::uuid])',
    test_uuid('agenda:future-meeting'),
    (SELECT id FROM reorder_item WHERE kind = 'minutes'),
    (SELECT id FROM reorder_item WHERE kind = 'open'),
    (SELECT id FROM scheduled_item WHERE kind = 'decision')
  ),
  'HV224',
  'a council agenda reorder must contain every programmed item exactly once with minutes first',
  'an item from another meeting cannot enter the permutation'
);

SELECT results_eq(
  $$SELECT kind, position
    FROM reorder_item
    JOIN council_agenda_item USING (id)
    ORDER BY abs(position)$$,
  $$VALUES
    ('minutes'::text, 1),
    ('open'::text, 4),
    ('decision'::text, 7),
    ('deprogrammed'::text, -9)$$,
  'every rejected reorder leaves the complete agenda unchanged'
);

-- HALL-FR-AGI-010
SELECT throws_ok(
  $$INSERT INTO council_agenda_item (
      id, council_business, council_meeting, position
    ) VALUES (
      test_uuid('agenda:no-subject'), NULL,
      test_uuid('agenda:other-meeting'), 2
    )$$,
  '23514',
  NULL,
  'an agenda item requires exactly one subject'
);

-- HALL-FR-AGI-020
SELECT throws_ok(
  $$SELECT schedule_open_question(
      test_uuid('agenda:business'), test_uuid('agenda:other-meeting'), 0
    )$$,
  'HV225',
  'agenda programming requires a positive position',
  'agenda position zero has no business meaning'
);

-- HALL-FR-AGI-300
SELECT throws_ok(
  $$SELECT schedule_open_question(
      test_uuid('agenda:business'), test_uuid('agenda:other-meeting'), -8
    )$$,
  'HV225',
  'agenda programming requires a positive position',
  'a named schedule action cannot create a deprogrammed occurrence'
);

-- HALL-FR-AGI-030
SELECT throws_ok(
  $$INSERT INTO council_agenda_item (
      id, council_business, council_meeting, position, minutes_approval
    ) VALUES (
      test_uuid('agenda:minutes-wrong-position'), NULL,
      test_uuid('agenda:other-meeting'), 2, test_uuid('agenda:minutes-approval')
    )$$,
  '23514',
  NULL,
  'minutes approval always occupies absolute position one'
);

UPDATE council_agenda_item
SET position = -1
WHERE minutes_approval = test_uuid('agenda:minutes-approval')
  AND council_meeting = test_uuid('agenda:meeting');
SELECT is(
  (
    SELECT position
    FROM council_agenda_item
    WHERE minutes_approval = test_uuid('agenda:minutes-approval')
      AND council_meeting = test_uuid('agenda:meeting')
  ),
  -1,
  'deprogrammed minutes approval retains absolute position one'
);

-- HALL-FR-AGI-040 HALL-FR-AGI-050
SELECT throws_ok(
  $$UPDATE council_agenda_item
    SET completed_at = '2026-01-01 08:00:00+00'
    WHERE id = (SELECT id FROM scheduled_item WHERE kind = 'open')$$,
  '23514',
  NULL,
  'completion structurally requires a start and a monotonic timestamp'
);

-- HALL-FR-AGI-060
INSERT INTO open_question (id,council_business) VALUES (test_uuid('agenda:absolute-position-question'),test_uuid('agenda:business'));
SELECT throws_ok(
  $$INSERT INTO council_agenda_item (
      id, council_business, council_meeting, position, open_question
    ) VALUES (
      test_uuid('agenda:absolute-position-item'), test_uuid('agenda:business'),
      test_uuid('agenda:meeting'), -2, test_uuid('agenda:absolute-position-question')
    )$$,
  '23505',
  NULL,
  'positive and negative forms of one meeting position cannot coexist'
);

-- HALL-FR-AGI-070
SELECT throws_ok(
  format(
    'INSERT INTO council_agenda_item (id, council_business, council_meeting, position, council_decision_proposal) VALUES (%L::uuid, %L::uuid, %L::uuid, 4, %L::uuid)',
    test_uuid('agenda:duplicate-occurrence'),
    test_uuid('agenda:business'),
    test_uuid('agenda:meeting'),
    (SELECT council_decision_proposal FROM council_agenda_item WHERE id = (SELECT id FROM scheduled_item WHERE kind = 'decision'))
  ),
  '23505',
  NULL,
  'one subject occurs at most once in one meeting'
);

-- HALL-TR-CON-110
SELECT throws_ok(
  $$INSERT INTO council_agenda_item(id,council_business,council_meeting,position,minutes_approval)
    VALUES(test_uuid('agenda:bad-minutes-owner'),test_uuid('agenda:business'),test_uuid('agenda:other-meeting'),1,test_uuid('agenda:minutes-approval'))$$,
  '23514', NULL, 'minutes approval cannot belong to a workspace business'
);

-- HALL-FR-BUS-030 HALL-TR-CON-120
SELECT test_ensure_business(test_uuid('agenda:other-business'));
SELECT throws_ok(
  format(
    'SELECT test_execute_deferred(ARRAY[%L])',
    format(
      'INSERT INTO council_agenda_item (id, council_business, council_meeting, position, council_decision_proposal) VALUES (%L::uuid, %L::uuid, %L::uuid, 2, %L::uuid)',
      test_uuid('agenda:foreign-business-occurrence'),
      test_uuid('agenda:other-business'),
      test_uuid('agenda:future-meeting'),
      (SELECT council_decision_proposal
       FROM council_agenda_item
       WHERE id = (SELECT id FROM scheduled_item WHERE kind = 'decision'))
    )
  ),
  'HV222',
  'an agenda subject belongs to exactly one council business',
  'one prepared subject cannot be reassigned to another CouncilBusiness'
);

-- HALL-TR-CON-130
SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM pg_indexes
    WHERE schemaname = 'hall'
      AND tablename = 'council_agenda_item'
      AND indexname IN (
        'council_agenda_item_decision_business_membership',
        'council_agenda_item_open_question_business_membership'
      )
  ),
  2,
  'each workspace subject-owner assertion has a subject-leading partial index'
);

SELECT throws_ok(
  $$SELECT schedule_open_question(
      test_uuid('agenda:unknown-business'), test_uuid('agenda:meeting'), 4
    )$$,
  'HV905',
  NULL,
  'agenda creation reports an unknown CouncilBusiness explicitly'
);

-- HALL-FR-AGI-090
INSERT INTO council_decision_proposal (id,council_business) VALUES (test_uuid('agenda:insert-active-proposal'),test_uuid('agenda:business'));
SELECT throws_ok(
  $$INSERT INTO council_agenda_item (
      id, council_business, council_meeting, position, council_decision_proposal, started_at
    ) VALUES (
      test_uuid('agenda:insert-active'), test_uuid('agenda:business'),
      test_uuid('agenda:other-meeting'), 2, test_uuid('agenda:insert-active-proposal'),
      '2026-01-01 09:05:00+00'
    )$$,
  'HV212',
  'an agenda item must be inactive on insert',
  'an agenda item is always created inactive'
);

-- HALL-FR-AGI-230 HALL-FR-AGI-240
SELECT is(
  (deprogram_council_agenda_item((SELECT id FROM scheduled_item WHERE kind = 'decision'))).position,
  -2,
  'deprogramming retains the agenda item with a negative position'
);
SELECT throws_ok(
  format(
    'SELECT reprogram_council_agenda_item(%L::uuid, %L::uuid, -2)',
    (SELECT id FROM scheduled_item WHERE kind = 'decision'),
    test_uuid('agenda:other-meeting')
  ),
  'HV225',
  'agenda programming requires a positive position',
  'a named reprogram action cannot retain a negative position'
);
SELECT is(
  (reprogram_council_agenda_item(
    (SELECT id FROM scheduled_item WHERE kind = 'decision'),
    test_uuid('agenda:other-meeting'),
    2
  )).position,
  2,
  'an unstarted agenda item can be reprogrammed on another meeting'
);

-- HALL-FR-AGI-120
SELECT is(
  (deprogram_council_agenda_item((SELECT id FROM scheduled_item WHERE kind = 'decision'))).position,
  -2,
  'the decision fixture is deprogrammed before the start guard'
);
SELECT throws_ok(
  format(
    'SELECT start_council_agenda_item(%L::uuid, %L::timestamptz)',
    (SELECT id FROM scheduled_item WHERE kind = 'decision'),
    '2026-01-01 09:05:00+00'
  ),
  'HV215',
  'a deprogrammed agenda item cannot start',
  'a negative agenda occurrence cannot start'
);

SELECT reprogram_council_agenda_item(
  (SELECT id FROM scheduled_item WHERE kind = 'decision'),
  test_uuid('agenda:future-meeting'),
  2
);
SELECT throws_ok(
  format(
    'SELECT start_council_agenda_item(%L::uuid, %L::timestamptz)',
    (SELECT id FROM scheduled_item WHERE kind = 'decision'),
    '2026-01-01 09:05:00+00'
  ),
  'HV216',
  'an agenda item requires a started council meeting',
  'an agenda item cannot start while its meeting is still in preparation'
);

SELECT reprogram_council_agenda_item(
  (SELECT id FROM scheduled_item WHERE kind = 'decision'),
  test_uuid('agenda:other-meeting'),
  2
);

-- HALL-FR-AGI-080
SELECT reprogram_council_agenda_item(
  (SELECT id FROM scheduled_item WHERE kind = 'open'),
  test_uuid('agenda:other-meeting'),
  3
);


SELECT test_designate_present_officers(test_uuid('agenda:other-meeting'));
SELECT test_prepare_notice(test_uuid('agenda:other-meeting'));
SELECT start_council_meeting(test_uuid('agenda:other-meeting'), '2026-01-01 09:00Z');

-- HALL-FR-AGI-180
SELECT throws_ok(
  format(
    'UPDATE council_agenda_item SET started_at = %L::timestamptz, completed_at = %L::timestamptz WHERE id = %L::uuid',
    '2026-01-01 09:05:00+00', '2026-01-01 09:06:00+00',
    (SELECT id FROM scheduled_item WHERE kind = 'decision')
  ),
  'HV217',
  'an agenda item must start before it completes',
  'start and completion are two distinct business facts'
);

-- HALL-FR-AGI-250
SELECT lives_ok(
  format(
    'SELECT start_council_agenda_item(%L::uuid, %L::timestamptz)',
    (SELECT id FROM scheduled_item WHERE kind = 'decision'),
    '2026-01-01 09:05:00+00'
  ),
  'the named start action opens a positively programmed item'
);

SELECT throws_ok(
  format(
    'SELECT start_council_agenda_item(%L::uuid, %L::timestamptz)',
    (SELECT id FROM scheduled_item WHERE kind = 'open'),
    '2026-01-01 09:06:00+00'
  ),
  '23505',
  NULL,
  'one meeting has at most one active agenda item'
);

-- HALL-FR-AGI-110
SELECT throws_ok(
  format(
    'UPDATE council_agenda_item SET council_business = %L::uuid WHERE id = %L::uuid',
    test_uuid('agenda:other-business'),
    (SELECT id FROM scheduled_item WHERE kind = 'decision')
  ),
  'HV214',
  'an agenda item subject is immutable',
  'a started agenda item cannot change aggregate root'
);

-- HALL-FR-AGI-130
SELECT throws_ok(
  format(
    'UPDATE council_agenda_item SET started_at = %L::timestamptz WHERE id = %L::uuid',
    '2026-01-01 09:07:00+00',
    (SELECT id FROM scheduled_item WHERE kind = 'decision')
  ),
  'HV218',
  'an agenda item start time is immutable',
  'agenda start time cannot be rewritten'
);

-- HALL-FR-AGI-190
SELECT throws_ok(
  format(
    'UPDATE council_agenda_item SET position = 5 WHERE id = %L::uuid',
    (SELECT id FROM scheduled_item WHERE kind = 'decision')
  ),
  'HV220',
  'a started agenda item placement is immutable',
  'a started item cannot change its absolute position'
);

-- HALL-FR-AGI-160
SELECT throws_ok(
  format(
    'UPDATE council_agenda_item SET completed_at = %L::timestamptz WHERE id = %L::uuid',
    '2026-01-01 09:20:00+00',
    (SELECT id FROM scheduled_item WHERE kind = 'decision')
  ),
  'HV221',
  'a ballot-backed agenda item completes only with its completed ballot',
  'a decision proposal cannot be completed directly'
);

SELECT is(
  (adjourn_council_agenda_item((SELECT id FROM scheduled_item WHERE kind = 'decision'), '2026-01-01 09:10Z')).position,
  -2,
  'a started but deferred item retains its original absolute order'
);

-- HALL-FR-AGI-340
SELECT throws_ok(
  format(
    'SELECT reprogram_council_agenda_item(%L::uuid, %L::uuid, 2)',
    (SELECT id FROM scheduled_item WHERE kind = 'decision'),
    test_uuid('agenda:other-meeting')
  ),
  'HV229',
  'a started agenda item deprogramming cannot be reversed',
  'a started deferral remains historical until closure carries its subject forward'
);

-- HALL-FR-AGI-100 HALL-TR-INT-030
SELECT throws_ok(
  format(
    'DELETE FROM council_agenda_item WHERE id = %L::uuid',
    (SELECT id FROM scheduled_item WHERE kind = 'decision')
  ),
  'HV213',
  'a started agenda item cannot be deleted',
  'started agenda history is durable'
);

SET CONSTRAINTS ALL IMMEDIATE;
SELECT throws_ok(
  $$TRUNCATE council_agenda_item CASCADE$$,
  'HV213',
  'council agenda history cannot be truncated',
  'TRUNCATE cannot bypass agenda history'
);
SET CONSTRAINTS ALL DEFERRED;

-- HALL-FR-AGI-150 HALL-FR-AGI-260
SELECT lives_ok(
  format(
    'SELECT start_council_agenda_item(%L::uuid, %L::timestamptz)',
    (SELECT id FROM scheduled_item WHERE kind = 'open'),
    '2026-01-01 09:21:00+00'
  ),
  'the open question starts after the preceding item is deferred'
);
SELECT lives_ok(
  format(
    'SELECT complete_non_voting_agenda_item(%L::uuid, %L::timestamptz)',
    (SELECT id FROM scheduled_item WHERE kind = 'open'),
    '2026-01-01 09:22:00+00'
  ),
  'an open question completes without a ballot'
);

-- HALL-FR-AGI-310
SELECT throws_ok(
  format(
    'UPDATE council_agenda_item SET position = -abs(position) WHERE id = %L::uuid',
    (SELECT id FROM scheduled_item WHERE kind = 'open')
  ),
  'HV226',
  'a completed agenda item cannot be deprogrammed',
  'a completed occurrence remains in the conducted meeting record'
);

-- HALL-FR-AGI-320
SELECT start_council_agenda_item(
  (SELECT id FROM deferred_open_item),
  '2026-01-01 09:23:00+00'
);
SELECT adjourn_council_agenda_item((SELECT id FROM deferred_open_item), '2026-01-01 09:23Z');
SELECT throws_ok(
  format(
    'SELECT complete_non_voting_agenda_item(%L::uuid, %L::timestamptz)',
    (SELECT id FROM deferred_open_item),
    '2026-01-01 09:24:00+00'
  ),
  'HV227',
  'a deprogrammed agenda item cannot complete',
  'a deferred open question remains unfinished for carry-forward'
);

-- HALL-FR-AGI-330
SELECT test_prepare_open_ballot('agenda:open-ballot', 'public', 2);
SELECT throws_ok(
  format(
    'UPDATE council_agenda_item SET position = -abs(position) WHERE id = %L::uuid',
    test_uuid('agenda:open-ballot:agenda-item')
  ),
  'HV228',
  'an agenda item with an open ballot cannot be deprogrammed',
  'deprogramming cannot strand an immutable open ballot'
);

-- HALL-FR-AGI-140
SELECT throws_ok(
  format(
    'UPDATE council_agenda_item SET completed_at = %L::timestamptz WHERE id = %L::uuid',
    '2026-01-01 09:23:00+00',
    (SELECT id FROM scheduled_item WHERE kind = 'open')
  ),
  'HV219',
  'an agenda item completion time is immutable',
  'an agenda completion timestamp cannot change'
);

SELECT * FROM finish();
ROLLBACK;
