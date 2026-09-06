BEGIN;
SELECT no_plan();

-- HALL-FR-BAL-010 HALL-FR-BAL-020 HALL-FR-VOT-010 HALL-FR-ATT-010
SELECT set_eq(
  $$SELECT typname FROM pg_type
    WHERE typname IN ('ballot_mode', 'ballot_result', 'meeting_attendance_status', 'vote_choice')$$,
  $$VALUES ('ballot_mode'::name), ('ballot_result'::name),
    ('meeting_attendance_status'::name), ('vote_choice'::name)$$,
  'the four closed domain types exist'
);

SELECT ok(
  (SELECT array_agg(enumlabel::TEXT ORDER BY enumsortorder)
   FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
   WHERE pg_type.typname = 'ballot_mode') = ARRAY['public', 'secret']::TEXT[],
  'ballot_mode is exactly public or secret'
);
SELECT ok(
  (SELECT array_agg(enumlabel::TEXT ORDER BY enumsortorder)
   FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
   WHERE pg_type.typname = 'vote_choice') = ARRAY['approve', 'reject', 'abstain']::TEXT[],
  'vote_choice records approve, reject and abstain'
);
SELECT ok(
  (SELECT array_agg(enumlabel::TEXT ORDER BY enumsortorder)
   FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
   WHERE pg_type.typname = 'ballot_result') = ARRAY['approve', 'reject']::TEXT[],
  'ballot_result has no artificial none value'
);
SELECT ok(
  (SELECT array_agg(enumlabel::TEXT ORDER BY enumsortorder)
   FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
   WHERE pg_type.typname = 'meeting_attendance_status')
    = ARRAY['present', 'represented', 'excused', 'absent']::TEXT[],
  'attendance status is explicit and closed'
);

SELECT set_eq(
  $$SELECT relname FROM pg_class
    WHERE relkind = 'r' AND relnamespace = 'hall'::regnamespace
      AND relname IN (
        'ballot_participation', 'ballots', 'council_agenda_item',
        'council_business', 'council_decision_proposal', 'council_meetings',
        'meeting_attendance', 'minutes', 'minutes_approval', 'open_question', 'votes'
      )$$,
  $$VALUES
    ('ballot_participation'::name), ('ballots'::name), ('council_agenda_item'::name),
    ('council_business'::name), ('council_decision_proposal'::name), ('council_meetings'::name),
    ('meeting_attendance'::name), ('minutes'::name), ('minutes_approval'::name),
    ('open_question'::name), ('votes'::name)$$,
  'the council model contains the business root, three agenda subjects, agenda occurrences, meetings and votes'
);

SELECT set_eq(
  $$SELECT proname FROM pg_proc
    WHERE pronamespace = 'hall'::regnamespace
      AND proname IN (
        'ballot_choice_count', 'ballot_has_valid_chairman', 'ballot_participation_count',
        'assert_programmed_council_agenda_position', 'ballot_vote_count', 'complete_ballot_agenda_item', 'complete_open_question',
        'close_council_meeting', 'council_meeting_closure_is_complete',
        'council_agenda_item_has_completed_ballot',
        'council_agenda_item_subject_has_one_business',
        'council_meeting_present_member_count', 'deprogram_council_agenda_item',
        'council_meeting_has_open_ballot',
        'council_meeting_previous_minutes_are_approved',
        'derive_ballot_result', 'enforce_ballot_chairman', 'enforce_ballot_lifecycle',
        'enforce_ballot_participation_lifecycle', 'enforce_council_agenda_item_completion_authority',
        'enforce_council_agenda_item_lifecycle',
        'enforce_council_agenda_item_subject_business',
        'enforce_council_meeting_lifecycle', 'enforce_meeting_attendance_lifecycle',
        'enforce_council_meeting_sequence',
        'enforce_meeting_attendance_proxy_holder', 'enforce_vote_immutability',
        'lock_council_agenda_item_business', 'lock_council_agenda_item_subject',
        'meeting_attendance_is_valid_proxy_holder',
        'provision_initial_council_meeting',
        'reorder_council_agenda', 'reprogram_council_agenda_item', 'schedule_council_decision_proposal',
        'schedule_minutes_approval', 'schedule_open_question', 'start_council_agenda_item'
      )$$,
  $$VALUES
    ('ballot_choice_count'::name), ('ballot_has_valid_chairman'::name),
    ('ballot_participation_count'::name), ('ballot_vote_count'::name),
    ('assert_programmed_council_agenda_position'::name),
    ('complete_ballot_agenda_item'::name), ('complete_open_question'::name),
    ('close_council_meeting'::name), ('council_meeting_closure_is_complete'::name),
    ('council_agenda_item_has_completed_ballot'::name),
    ('council_agenda_item_subject_has_one_business'::name),
    ('council_meeting_has_open_ballot'::name),
    ('council_meeting_previous_minutes_are_approved'::name),
    ('council_meeting_present_member_count'::name), ('deprogram_council_agenda_item'::name),
    ('derive_ballot_result'::name), ('enforce_ballot_chairman'::name),
    ('enforce_ballot_lifecycle'::name), ('enforce_ballot_participation_lifecycle'::name),
    ('enforce_council_agenda_item_completion_authority'::name),
    ('enforce_council_agenda_item_lifecycle'::name),
    ('enforce_council_agenda_item_subject_business'::name),
    ('enforce_council_meeting_lifecycle'::name),
    ('enforce_council_meeting_sequence'::name),
    ('enforce_meeting_attendance_lifecycle'::name),
    ('enforce_meeting_attendance_proxy_holder'::name), ('enforce_vote_immutability'::name),
    ('lock_council_agenda_item_business'::name),
    ('lock_council_agenda_item_subject'::name),
    ('meeting_attendance_is_valid_proxy_holder'::name),
    ('provision_initial_council_meeting'::name),
    ('reorder_council_agenda'::name), ('reprogram_council_agenda_item'::name),
    ('schedule_council_decision_proposal'::name),
    ('schedule_minutes_approval'::name), ('schedule_open_question'::name),
    ('start_council_agenda_item'::name)$$,
  'all council rule, lifecycle and named action functions exist'
);

SELECT set_eq(
  $$SELECT trigger_table.relname::TEXT || '.' || pg_trigger.tgname || ' -> ' || pg_proc.proname
    FROM pg_trigger
    JOIN pg_class AS trigger_table ON trigger_table.oid = pg_trigger.tgrelid
    JOIN pg_proc ON pg_proc.oid = pg_trigger.tgfoid
    WHERE NOT pg_trigger.tgisinternal
      AND trigger_table.relnamespace = 'hall'::regnamespace
      AND trigger_table.relname IN (
        'ballot_participation', 'ballots', 'council_agenda_item',
        'council_meetings', 'meeting_attendance', 'votes'
      )$$,
  $$VALUES
    ('ballot_participation.ballot_participation_enforce_lifecycle -> enforce_ballot_participation_lifecycle'),
    ('ballot_participation.ballot_participation_reject_truncate -> enforce_ballot_participation_lifecycle'),
    ('ballots.ballot_requires_generated_minutes -> require_generated_minutes_for_ballot'),
    ('ballots.ballots_complete_agenda_item -> complete_ballot_agenda_item'),
    ('ballots.ballots_enforce_chairman -> enforce_ballot_chairman'),
    ('ballots.ballots_enforce_lifecycle -> enforce_ballot_lifecycle'),
    ('ballots.ballots_reject_truncate -> enforce_ballot_lifecycle'),
    ('council_agenda_item.council_agenda_item_enforce_completion_authority -> enforce_council_agenda_item_completion_authority'),
    ('council_agenda_item.council_agenda_item_enforce_lifecycle -> enforce_council_agenda_item_lifecycle'),
    ('council_agenda_item.council_agenda_item_enforce_subject_business -> enforce_council_agenda_item_subject_business'),
    ('council_agenda_item.council_agenda_item_lock_business -> lock_council_agenda_item_business'),
    ('council_agenda_item.council_agenda_item_lock_subject -> lock_council_agenda_item_subject'),
    ('council_agenda_item.council_agenda_item_preserve_recusal_meeting -> enforce_recusal_occurrence_meeting'),
    ('council_agenda_item.council_agenda_item_reject_truncate -> enforce_council_agenda_item_lifecycle'),
    ('council_meetings.council_meeting_capture_opening -> snapshot_council_meeting_opening'),
    ('council_meetings.council_meetings_enforce_lifecycle -> enforce_council_meeting_lifecycle'),
    ('council_meetings.council_meetings_enforce_sequence -> enforce_council_meeting_sequence'),
    ('council_meetings.council_meetings_reject_truncate -> enforce_council_meeting_lifecycle'),
    ('meeting_attendance.meeting_attendance_enforce_lifecycle -> enforce_meeting_attendance_lifecycle'),
    ('meeting_attendance.meeting_attendance_enforce_proxy_holder -> enforce_meeting_attendance_proxy_holder'),
    ('meeting_attendance.meeting_attendance_reject_truncate -> enforce_meeting_attendance_lifecycle'),
    ('votes.votes_enforce_immutability -> enforce_vote_immutability'),
    ('votes.votes_reject_truncate -> enforce_vote_immutability')$$,
  'each lifecycle authority is wired to its owning relation'
);

-- HALL-TR-ERR-010 HALL-TR-ERR-020 HALL-TR-ERR-030
-- HALL-TR-TRC-010 HALL-TR-TRC-020
SELECT pass('the traceability preflight matched every requirement and Hall SQLSTATE before pgTAP started');

SELECT * FROM finish();
ROLLBACK;
