BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
SET LOCAL hall.roles = '["administrator"]';
\ir ../../council/test/support/helpers.sql
SELECT no_plan();

-- Complete production schema: the snapshots reference documentary content.
CREATE TEMP TABLE scenario AS
SELECT (provision_initial_council_meeting()).id AS meeting,
  create_council_business_workspace('', 'lifecycle', 'report', 'Opening report') AS business;
INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
SELECT test_uuid('lifecycle:attendance'), test_uuid('lifecycle:member'), meeting, 'present' FROM scenario;
SELECT set_council_meeting_officers(meeting, test_uuid('lifecycle:member'), test_uuid('lifecycle:member')) FROM scenario;
SELECT test_confirm_declared_membership(meeting) FROM scenario;
SELECT schedule_council_meeting(meeting, '2026-01-01 09:00Z', 'Chamber') FROM scenario;
CREATE TEMP TABLE items AS
SELECT schedule_council_decision_proposal(business, meeting, 1) AS finished,
       schedule_open_question(business, meeting, 2) AS adjourned,
       schedule_open_question(business, meeting, 3) AS untouched,
       schedule_open_question(business, meeting, 4) AS unfinished,
       schedule_open_question(business, meeting, 5) AS removed,
       schedule_open_question(business, meeting, 6) AS adjourned_before_examination
FROM scenario;
SELECT ok((SELECT workspace.text_resource <> business.report_resource
 FROM council_decision_proposal_workspace workspace JOIN council_business_workspace business USING(council_business)),
 'proposal owns text distinct from the primary report');
UPDATE text_resource SET content='Opening proposal' WHERE id IN (SELECT text_resource FROM council_decision_proposal_workspace);
SELECT deprogram_council_agenda_item(removed) FROM items;
SELECT throws_ok($$SELECT adjourn_council_agenda_item(untouched, '2026-01-01 08:59Z') FROM items$$,
 'HV230', NULL, 'adjournment belongs to an opened meeting');
CREATE TEMP TABLE attachment AS SELECT (hall_api.create_document_resource('', 'attachment', 'application/pdf', convert_to('Original bytes', 'UTF8'))->>'id')::UUID AS id;
SELECT hall_api.associate_council_business_resource(business, attachment.id) FROM scenario, attachment;
SELECT test_prepare_notice(meeting) FROM scenario;
SELECT start_council_meeting(meeting, '2026-01-01 09:00Z') FROM scenario;

SELECT has_table('hall', 'council_meeting_snapshot', 'the two lifecycle boundaries have durable snapshots');
SELECT is((SELECT count(*)::integer FROM council_meeting_snapshot), 1, 'start captures exactly one snapshot');
SELECT is((SELECT jsonb_array_length(payload->'agenda') FROM council_meeting_snapshot WHERE phase='opening'),
  5, 'the opening agenda excludes items deprogrammed during preparation');
CREATE TEMP TABLE opening AS SELECT payload FROM council_meeting_snapshot WHERE phase='opening';
SELECT throws_ok(
  $$UPDATE text_resource SET content='Revised proposal' WHERE id IN (SELECT text_resource FROM council_decision_proposal_workspace)$$,
  'HV823',
  'an agenda subject text is immutable during meeting conduct or after its agenda item starts',
  'a prepared proposal source is temporarily locked while the meeting is open'
);
SELECT lives_ok(
  $$UPDATE text_resource SET content='Changed after opening'
    WHERE id=(SELECT report_resource FROM council_business_workspace JOIN scenario ON council_business=business)$$,
  'the business report remains editable after meeting start'
);
SELECT is((SELECT payload FROM council_meeting_snapshot WHERE phase='opening'), (SELECT payload FROM opening),
  'editing the report does not rewrite the opening snapshot');
SELECT ok((SELECT payload::text LIKE '%Opening report%' FROM opening), 'opening stores the report content itself');

SELECT hall_api.replace_document_content(id, 'application/pdf', convert_to('Replacement bytes', 'UTF8')) FROM attachment;
SELECT ok((SELECT payload::text NOT LIKE '%' || encode(convert_to('Original bytes','UTF8'),'hex') || '%' FROM opening),
 'opening references the attachment without copying its bytes');
SELECT is((SELECT decode(meeting_document_content(meeting, attachment.id)->>'contentBase64','base64') FROM scenario, attachment),
 convert_to('Original bytes','UTF8'), 'opening serves the attachment version it references');
SELECT is((SELECT payload FROM council_meeting_snapshot WHERE phase='opening'), (SELECT payload FROM opening),
 'replacing an attachment cannot rewrite its opening version');
SELECT throws_ok($$SELECT deprogram_council_agenda_item(untouched) FROM items$$,
 'HV230', NULL, 'preparation deprogramming is unavailable in session');
SELECT adjourn_council_agenda_item(adjourned_before_examination, '2026-01-01 09:00Z') FROM items;
SELECT start_council_agenda_item(finished, '2026-01-01 09:01Z') FROM items;
CREATE TEMP TABLE recorded_ballot AS SELECT hall.create_ballot(finished, 'public', ARRAY[test_uuid('lifecycle:attendance')], test_uuid('lifecycle:attendance')) AS id FROM items;
SELECT throws_ok($$SELECT adjourn_council_agenda_item(finished, '2026-01-01 09:02Z') FROM items$$,
 'HV230', NULL, 'an open ballot prevents explicit adjournment');
SELECT throws_ok($$SELECT close_council_meeting(meeting, '2026-01-01 09:02Z') FROM scenario$$,
 'HV118', NULL, 'an open ballot prevents closing');
SELECT record_public_ballot_votes(recorded_ballot.id, ARRAY[participation.id], ARRAY['approve']::vote_choice[])
FROM recorded_ballot JOIN ballot_participation participation ON participation.ballot=recorded_ballot.id;
SELECT test_confirm_ballot(id, '2026-01-01 09:02Z') FROM recorded_ballot;
SELECT throws_ok($$SELECT adjourn_council_agenda_item(finished, '2026-01-01 09:03Z') FROM items$$,
 'HV230', NULL, 'a completed point cannot be adjourned');
SELECT start_council_agenda_item(adjourned, '2026-01-01 09:03Z') FROM items;
SELECT lives_ok($$SELECT adjourn_council_agenda_item(adjourned, '2026-01-01 09:04Z') FROM items$$,
  'the council explicitly adjourns an item under consideration');
SELECT start_council_agenda_item(unfinished, '2026-01-01 09:05Z') FROM items;

CREATE TEMP TABLE successor AS SELECT close_council_meeting(meeting, '2026-01-01 10:00Z') AS id FROM scenario;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT is((SELECT count(*)::integer FROM council_meeting_snapshot), 2, 'closure captures the second snapshot atomically');
SELECT is((SELECT payload FROM council_meeting_snapshot WHERE phase='opening'), (SELECT payload FROM opening),
  'carry-forward preserves the original programme');
SELECT ok((SELECT payload::text LIKE '%Changed after opening%' FROM council_meeting_snapshot WHERE phase='closing'),
  'closing captures the report version current at closure');
SELECT is((SELECT count(*)::integer FROM council_agenda_item JOIN successor ON council_meeting=successor.id), 5,
  'successor contains minutes approval and the four unfinished programmed subjects');
SELECT ok(NOT EXISTS(SELECT FROM council_agenda_item a JOIN successor s ON a.council_meeting=s.id JOIN items i ON a.id=i.removed),
  'a preparation deprogramming is not an in-session adjournment');
SELECT ok((SELECT (entry->>'adjourned_at') IS NOT NULL FROM council_meeting_snapshot s,
  jsonb_array_elements(s.payload->'agenda') entry, items i WHERE s.phase='closing' AND entry->>'id'=i.adjourned::text),
  'closing records explicit adjournment');
SELECT ok((SELECT entry->>'adjourned_at' IS NULL AND entry->>'started_at' IS NULL FROM council_meeting_snapshot s,
  jsonb_array_elements(s.payload->'agenda') entry, items i WHERE s.phase='closing' AND entry->>'id'=i.untouched::text),
  'closing distinguishes a point never examined from an explicit adjournment');
SELECT throws_ok($$UPDATE council_meeting_snapshot SET payload='{}'$$, 'HV125', NULL, 'snapshots cannot be rewritten');
SELECT throws_ok($$DELETE FROM council_meeting_snapshot$$, 'HV125', NULL, 'snapshots cannot be deleted');
SELECT throws_ok($$TRUNCATE council_meeting_snapshot$$, '0A000', NULL, 'snapshots cannot be truncated');
SELECT ok(NOT EXISTS (SELECT FROM council_agenda_item a JOIN successor s ON a.council_meeting=s.id
  WHERE a.council_decision_proposal=(SELECT original.council_decision_proposal FROM council_agenda_item original JOIN items ON original.id=items.finished)),
 'the completed subject is not carried forward');
SELECT ok((SELECT payload #>> '{meeting,closed_at}' IS NOT NULL FROM council_meeting_snapshot WHERE phase='closing'),
 'the closing snapshot records the closing timestamp');
SELECT throws_ok($$SELECT close_council_meeting(meeting, '2026-01-01 10:00Z') FROM scenario$$,
 'HV114', NULL, 'a repeated close cannot create another successor or snapshot');
SELECT is((SELECT payload #>> '{ballots,0,result}' FROM council_meeting_snapshot WHERE phase='closing'), 'approve',
 'closing retains the completed ballot result');
SELECT is((SELECT payload #>> '{votes,0,choice}' FROM council_meeting_snapshot WHERE phase='closing'), 'approve',
 'closing retains the recorded vote');
SELECT ok((SELECT payload::text LIKE '%Opening proposal%' FROM opening), 'opening owns the proposal text');
SELECT ok((SELECT payload::text LIKE '%Opening proposal%' FROM council_meeting_snapshot WHERE phase='closing'), 'closing retains the proposal source frozen during conduct');
SELECT throws_ok(
  $$UPDATE text_resource SET content='Later working text' WHERE id IN (SELECT text_resource FROM council_decision_proposal_workspace)$$,
  'HV821',
  'a voted proposal text is immutable',
  'the proposal source remains immutable after meeting closure'
);
SELECT is((SELECT hall_api.open_council_agenda_item(finished) #>> '{subject,content}' FROM items), 'Opening proposal', 'closed proposal reads the source version locked during conduct');
SELECT is((SELECT jsonb_array_length(hall_api.list_council_agenda(meeting)) FROM scenario), 5, 'closed agenda retains all original programmed occurrences after carry forward');
SELECT * FROM finish();
ROLLBACK;
