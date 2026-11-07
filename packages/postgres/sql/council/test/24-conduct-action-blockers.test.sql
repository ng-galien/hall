BEGIN;
SET LOCAL search_path=hall,public,pg_catalog;
SET LOCAL hall.roles='["administrator"]';
SET LOCAL hall.actor_id='conduct-blockers-test';
\ir support/helpers.sql
SELECT no_plan();
-- @verifies-requirement HALL-FR-AGI-390
-- @verifies-requirement HALL-FR-MTG-300
-- @verifies-requirement HALL-FR-AGI-350
-- all three subject kinds expose SQL reasons.
SELECT test_ensure_council_member(test_uuid('blockers:member:'||n)) FROM generate_series(1,15)n;
CREATE FUNCTION pg_temp.blocker_attendance(present_count integer) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_agg(jsonb_build_object('council_member_id',test_uuid('blockers:member:'||n),'status',CASE WHEN n<=present_count THEN 'present' ELSE 'absent' END)) FROM generate_series(1,15)n;
$$;
INSERT INTO council_meetings(id,number,scheduled_at,location) VALUES(test_uuid('blockers:first'),1,'2026-01-01 18:00Z','Chamber');
SELECT hall_api.create_and_schedule_open_question('seed','First session','Report','',test_uuid('blockers:first'),1);
SELECT test_prepare_notice(test_uuid('blockers:first'));
SELECT record_meeting_opening(test_uuid('blockers:first'),'2026-01-01 18:01Z',pg_temp.blocker_attendance(15),test_uuid('blockers:member:1'),test_uuid('blockers:member:2'));
SELECT start_council_agenda_item(id,'2026-01-01 18:02Z') FROM council_agenda_item WHERE council_meeting=test_uuid('blockers:first');
SELECT complete_non_voting_agenda_item(id,'2026-01-01 18:03Z') FROM council_agenda_item WHERE council_meeting=test_uuid('blockers:first');
CREATE TEMP TABLE blocker_meeting AS SELECT close_council_meeting(test_uuid('blockers:first'),'2026-01-01 18:04Z') id;
SELECT hall_api.schedule_council_meeting(id,'2026-01-02 18:00Z','Chamber') FROM blocker_meeting;
SELECT hall_api.create_and_schedule_council_decision_proposal('seed','Vote to defer','Report','',(SELECT id FROM blocker_meeting),2);
SELECT hall_api.create_and_schedule_open_question('seed','Information','Report','',(SELECT id FROM blocker_meeting),3);
SELECT test_prepare_notice(id) FROM blocker_meeting;
SELECT record_meeting_opening(id,'2026-01-02 18:01Z',pg_temp.blocker_attendance(7),test_uuid('blockers:member:1'),test_uuid('blockers:member:2')) FROM blocker_meeting;
CREATE TEMP TABLE blocker_items AS SELECT id,subject_kind FROM council_agenda_item WHERE council_meeting=(SELECT id FROM blocker_meeting);
CREATE FUNCTION pg_temp.subject_state(kind hall.council_agenda_subject_kind) RETURNS jsonb LANGUAGE sql AS $$
 SELECT hall_api.open_council_agenda_item(id) FROM blocker_items WHERE subject_kind=kind;
$$;
SELECT is((SELECT count(*)::int FROM blocker_items),3,'the matrix contains all three canonical kinds');
SELECT ok(pg_temp.subject_state('minutesApproval')#>'{conductBlockers,startDiscussion}' @> '[{"code":"quorumNotMet","presentCount":7,"requiredPresent":8}]','minutes approval explains insufficient quorum');
SELECT ok(pg_temp.subject_state('minutesApproval')#>'{conductBlockers,reviewBallot}' @> '[{"code":"quorumNotMet"},{"code":"discussionNotStarted"},{"code":"minutesDocumentMissing"}]','all applicable ballot blockers are exposed together');
SELECT ok(pg_temp.subject_state('councilDecisionProposal')#>'{conductBlockers,startDiscussion}' @> '[{"code":"quorumNotMet"},{"code":"earlierAgendaItemPending"}]','proposal explains quorum and preceding minutes item');
SELECT is(pg_temp.subject_state('minutesApproval')#>'{conductBlockers,adjourn}','[]'::jsonb,'minutes approval may be adjourned without pretending approval');
SELECT throws_ok($$UPDATE council_agenda_item SET position=-1 WHERE id=(SELECT id FROM blocker_items WHERE subject_kind='minutesApproval')$$,
  'HV801', NULL, 'a position change alone cannot remove the previous PV during conduct');
SELECT lives_ok($$SELECT adjourn_council_agenda_item((SELECT id FROM blocker_items WHERE subject_kind='minutesApproval'),'2026-01-02 18:02Z')$$,'minutes approval can be passed by explicit adjournment');
SELECT ok((SELECT position=-1 AND completed_at IS NULL AND adjourned_at IS NOT NULL FROM council_agenda_item WHERE id=(SELECT id FROM blocker_items WHERE subject_kind='minutesApproval')),'adjourned minutes approval remains unapproved in its original slot');
SELECT is((hall_api.open_council_meeting((SELECT id FROM blocker_meeting))->'closureBlockers'),'[]'::jsonb,
  'an unapproved previous PV does not block closure');
SELECT lives_ok($$SELECT adjourn_council_agenda_item((SELECT id FROM blocker_items WHERE subject_kind='councilDecisionProposal'),'2026-01-02 18:03Z')$$,'proposal can also be passed without a ballot');
SELECT lives_ok($$SELECT start_council_agenda_item((SELECT id FROM blocker_items WHERE subject_kind='openQuestion'),'2026-01-02 18:06Z')$$,'open question exchanges start after preceding items are adjourned');
SELECT ok(pg_temp.subject_state('openQuestion')#>'{conductBlockers,reviewBallot}' @> '[{"code":"nonVotingSubject"}]','open question cannot produce a ballot');
SELECT complete_non_voting_agenda_item((SELECT id FROM blocker_items WHERE subject_kind='openQuestion'),'2026-01-02 18:07Z');
SELECT is((SELECT count(*)::int FROM ballots),0,'all three subjects have been passed without a ballot');
CREATE TEMP TABLE closed_blocker_meeting AS
SELECT close_council_meeting((SELECT id FROM blocker_meeting),'2026-01-02 18:08Z') AS successor;
SELECT ok((SELECT closed_at IS NOT NULL FROM council_meetings WHERE id=(SELECT id FROM blocker_meeting)),
  'the meeting closes without approving the preceding PV');
SELECT is((SELECT count(*)::int FROM council_agenda_item WHERE council_meeting=(SELECT successor FROM closed_blocker_meeting)
  AND minutes_approval=(SELECT minutes_approval FROM blocker_items JOIN council_agenda_item USING(id)
    WHERE blocker_items.subject_kind='minutesApproval')),0,'the adjourned PV is not proposed for another vote');
SELECT is((SELECT count(*)::int FROM council_agenda_item WHERE council_meeting=(SELECT successor FROM closed_blocker_meeting)
  AND minutes_approval IS NOT NULL),1,'only the newly closed meeting PV is on the following agenda');
SELECT * FROM finish();
ROLLBACK;
