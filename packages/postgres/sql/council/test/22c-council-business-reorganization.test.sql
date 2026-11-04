-- A prepared subject moves to another business with its text, whatever its
-- state, voted included; a business merges into another one and disappears.
-- Previews write nothing; refused plans write nothing; the meeting record
-- (snapshot, minutes, ballot, seal) is never rewritten.
BEGIN;
SET LOCAL search_path=hall,public,pg_catalog;
SET LOCAL hall.roles='["administrator"]';
\ir support/helpers.sql
SELECT no_plan();

SELECT test_prepare_open_ballot('reorg', 'public', 2);
INSERT INTO votes(ballot, mode, choice, ballot_participation, count) VALUES
  (test_uuid('reorg:ballot'), 'public', 'approve', test_uuid('reorg:participation:1'), 1),
  (test_uuid('reorg:ballot'), 'public', 'approve', test_uuid('reorg:participation:2'), 1);
UPDATE ballots SET result_preview=test_review_ballot(id), completed_at='2026-01-01 09:30Z' WHERE id=test_uuid('reorg:ballot');
CREATE TEMP TABLE reorg_closure AS SELECT hall_api.close_council_meeting(test_uuid('reorg:meeting'), '2026-01-01 10:00Z') payload;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

SELECT hall_api.create_folder('','seed') WHERE NOT EXISTS(SELECT FROM resource WHERE full_path='seed');
CREATE TEMP TABLE reorg(key TEXT PRIMARY KEY, id UUID);
INSERT INTO reorg VALUES
  ('voted', test_uuid('reorg:proposal')),
  ('voted-business', test_uuid('reorg:business')),
  ('next-meeting', (SELECT (payload#>>'{nextMeeting,id}')::UUID FROM reorg_closure)),
  ('source', (hall_api.create_council_business('seed','Source affair','Source report','Source evidence')->>'id')::UUID),
  ('target', (hall_api.create_council_business('seed','Target affair','Target report','Target evidence')->>'id')::UUID),
  ('absorbed', (hall_api.create_council_business('seed','Absorbed affair','Absorbed report','Absorbed evidence')->>'id')::UUID),
  ('empty', (hall_api.create_council_business('seed','Empty affair','Empty report','')->>'id')::UUID);
INSERT INTO reorg SELECT 'fresh', (hall_api.create_prepared_council_subject(id,'councilDecisionProposal','Fresh proposal','Fresh text')->>'id')::UUID FROM reorg WHERE key='source';
INSERT INTO reorg SELECT 'taken', (hall_api.create_prepared_council_subject(id,'openQuestion','Taken title','Source question')->>'id')::UUID FROM reorg WHERE key='source';
INSERT INTO reorg SELECT 'taken-twin', (hall_api.create_prepared_council_subject(id,'openQuestion','Taken title','Target question')->>'id')::UUID FROM reorg WHERE key='target';
INSERT INTO reorg SELECT 'absorbed-subject', (hall_api.create_prepared_council_subject(id,'openQuestion','Absorbed question','Absorbed text')->>'id')::UUID FROM reorg WHERE key='absorbed';
INSERT INTO reorg SELECT 'absorbed-document', (hall_api.create_text_resource('seed/Absorbed affair','Absorbed note','Note')->>'id')::UUID;
INSERT INTO reorg SELECT 'shared-document', (hall_api.create_text_resource('seed','Shared note','Shared')->>'id')::UUID;
SELECT hall_api.associate_council_business_resource((SELECT id FROM reorg WHERE key='absorbed'), (SELECT id FROM reorg WHERE key='shared-document'));
SELECT hall_api.associate_council_business_resource((SELECT id FROM reorg WHERE key='target'), (SELECT id FROM reorg WHERE key='shared-document'));
SELECT hall_api.associate_council_business_resource((SELECT id FROM reorg WHERE key='absorbed'), (SELECT id FROM reorg WHERE key='absorbed-document'));

CREATE TEMP TABLE reorg_record AS SELECT
  (SELECT md5(string_agg(payload::TEXT, '|' ORDER BY council_meeting, phase)) FROM council_meeting_snapshot) snapshots,
  (SELECT md5(string_agg(to_jsonb(minutes)::TEXT, '|' ORDER BY id)) FROM minutes) minutes,
  (SELECT md5(string_agg(to_jsonb(seal)::TEXT, '|' ORDER BY council_decision_proposal)) FROM proposal_text_seal seal) seals,
  (SELECT md5(to_jsonb(ballots)::TEXT) FROM ballots WHERE id=test_uuid('reorg:ballot')) ballot,
  (SELECT md5(t.content || r.name) FROM council_decision_proposal_workspace w JOIN resource r ON r.id=w.text_resource
    JOIN text_resource t ON t.id=w.text_resource WHERE w.council_decision_proposal=test_uuid('reorg:proposal')) voted_text;

CREATE FUNCTION pg_temp.reorg(label TEXT) RETURNS UUID LANGUAGE sql AS $$ SELECT id FROM reorg WHERE key=label $$;
CREATE FUNCTION pg_temp.folder(label TEXT) RETURNS TEXT LANGUAGE sql AS $$
  SELECT folder.full_path FROM council_business_workspace w JOIN resource folder ON folder.id=w.folder_resource
  WHERE w.council_business=pg_temp.reorg(label) $$;
CREATE FUNCTION pg_temp.text_path(label TEXT) RETURNS TEXT LANGUAGE sql AS $$
  SELECT r.path FROM prepared_council_subject s JOIN resource r ON r.id=s.text_resource WHERE s.id=pg_temp.reorg(label) $$;

-- Subject move.
SELECT is(
  hall_api.move_prepared_council_subject(pg_temp.reorg('fresh'),'councilDecisionProposal',pg_temp.reorg('target'),true)
    - ARRAY['subjectId','from','to','text','agenda'],
  '{"kind":"councilDecisionProposal","title":"Fresh proposal","voted":false,"blockers":[],"applied":false}'::JSONB,
  'the move preview describes the subject without blockers'
);
SELECT is(
  (SELECT council_business FROM council_decision_proposal WHERE id=pg_temp.reorg('fresh')),
  pg_temp.reorg('source'),
  'the preview writes nothing'
);
SELECT is(
  hall_api.move_prepared_council_subject(pg_temp.reorg('fresh'),'councilDecisionProposal',pg_temp.reorg('target'),false)->>'applied',
  'true',
  'a never scheduled proposal moves'
);
SELECT ok(
  (SELECT council_business=pg_temp.reorg('target') FROM council_decision_proposal WHERE id=pg_temp.reorg('fresh'))
  AND (SELECT council_business=pg_temp.reorg('target') FROM council_decision_proposal_workspace WHERE council_decision_proposal=pg_temp.reorg('fresh'))
  AND pg_temp.text_path('fresh')=pg_temp.folder('target'),
  'the proposal, its text mapping and its text file belong to the target business'
);
SELECT is(
  (SELECT array_agg(link.council_business=pg_temp.reorg('target')) FROM council_business_resource link
   JOIN prepared_council_subject s ON s.text_resource=link.resource WHERE s.id=pg_temp.reorg('fresh')),
  ARRAY[true],
  'the proposal text leaves the source pieces and joins the target pieces'
);

-- @verifies-requirement HALL-FR-BUS-050
SELECT throws_ok(
  format('UPDATE council_decision_proposal SET council_business=%L WHERE id=%L',pg_temp.reorg('source'),pg_temp.reorg('fresh')),
  'HV809',NULL,'outside a move the proposal business stays immutable'
);
-- @verifies-requirement HALL-FR-WSP-220
SELECT throws_ok(
  format('UPDATE council_decision_proposal_workspace SET council_business=%L WHERE council_decision_proposal=%L',pg_temp.reorg('source'),pg_temp.reorg('fresh')),
  'HV820',NULL,'outside a move the proposal text ownership stays immutable'
);
SELECT throws_ok(
  format('UPDATE council_agenda_item SET council_business=%L WHERE council_decision_proposal=%L',pg_temp.reorg('source'),pg_temp.reorg('voted')),
  'HV223',NULL,'outside a move a closed meeting item keeps its business'
);

SELECT throws_ok(
  format('SELECT hall_api.move_prepared_council_subject(%L,''councilDecisionProposal'',%L,false)',pg_temp.reorg('fresh'),pg_temp.reorg('target')),
  'HV826',NULL,'a subject cannot move to its own business'
);
SELECT is(
  hall_api.move_prepared_council_subject(pg_temp.reorg('taken'),'openQuestion',pg_temp.reorg('target'),true)->'blockers',
  '["nameTaken"]'::JSONB,
  'the preview reports a text name already used in the target folder'
);
SELECT throws_ok(
  format('SELECT hall_api.move_prepared_council_subject(%L,''openQuestion'',%L,false)',pg_temp.reorg('taken'),pg_temp.reorg('target')),
  'HV826',NULL,'a name conflict refuses the move'
);
SELECT is(pg_temp.text_path('taken'),pg_temp.folder('source'),'a refused move leaves the text in place');

-- @verifies-requirement HALL-FR-AGI-110
SELECT is(
  (hall_api.move_prepared_council_subject(pg_temp.reorg('voted'),'councilDecisionProposal',pg_temp.reorg('target'),false)#>'{agenda,0}') - 'agendaItemId'::TEXT,
  '{"position":1,"treated":true,"meetingClosed":true,"meetingStale":false,"meetingNumber":1}'::JSONB,
  'a proposal voted in a closed meeting moves'
);
SELECT is(
  (SELECT array_agg(DISTINCT council_business) FROM council_agenda_item WHERE council_decision_proposal=pg_temp.reorg('voted')),
  ARRAY[pg_temp.reorg('target')],
  'the business copied in its agenda items follows the subject'
);
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT is(
  (SELECT ROW(
    (SELECT md5(string_agg(payload::TEXT, '|' ORDER BY council_meeting, phase)) FROM council_meeting_snapshot),
    (SELECT md5(string_agg(to_jsonb(minutes)::TEXT, '|' ORDER BY id)) FROM minutes),
    (SELECT md5(string_agg(to_jsonb(seal)::TEXT, '|' ORDER BY council_decision_proposal)) FROM proposal_text_seal seal),
    (SELECT md5(to_jsonb(ballots)::TEXT) FROM ballots WHERE id=test_uuid('reorg:ballot')),
    (SELECT md5(t.content || r.name) FROM council_decision_proposal_workspace w JOIN resource r ON r.id=w.text_resource
      JOIN text_resource t ON t.id=w.text_resource WHERE w.council_decision_proposal=test_uuid('reorg:proposal')))::TEXT),
  (SELECT ROW(snapshots, minutes, seals, ballot, voted_text)::TEXT FROM reorg_record),
  'snapshot, minutes, seal, ballot and voted text are unchanged'
);
SELECT is(pg_temp.text_path('voted'),pg_temp.folder('target'),'the voted text moved to the target folder');
SELECT throws_ok(
  format('UPDATE text_resource SET content=''changed'' WHERE id=(SELECT text_resource FROM prepared_council_subject WHERE id=%L)',pg_temp.reorg('voted')),
  'HV821',NULL,'the moved voted text stays sealed'
);

INSERT INTO reorg SELECT 'running', (hall_api.create_prepared_council_subject(pg_temp.reorg('source'),'openQuestion','Running question','Running text')->>'id')::UUID;
SELECT hall_api.schedule_prepared_council_subject(pg_temp.reorg('next-meeting'),pg_temp.reorg('running'),'openQuestion',2);
UPDATE council_meetings SET scheduled_at='2026-02-01 08:30Z', location='Council chamber' WHERE id=pg_temp.reorg('next-meeting');
INSERT INTO meeting_attendance(id,council_member,council_meeting,status) VALUES
  (test_uuid('reorg:next:attendance'),test_uuid('reorg:member:1'),pg_temp.reorg('next-meeting'),'present');
SELECT test_designate_present_officers(pg_temp.reorg('next-meeting'));
SELECT test_prepare_notice(pg_temp.reorg('next-meeting'));
SELECT start_council_meeting(pg_temp.reorg('next-meeting'),'2026-02-01 09:00Z');
SELECT is(
  hall_api.move_prepared_council_subject(pg_temp.reorg('running'),'openQuestion',pg_temp.reorg('target'),true)->'blockers',
  '["meetingInProgress"]'::JSONB,
  'a subject of a meeting in progress cannot move'
);

-- Business merge.
SELECT is(
  (SELECT jsonb_build_object('report',plan->'report'->'fate','reportName',plan->'report'->'newName','blockers',plan->'blockers',
    'subjects',jsonb_array_length(plan->'subjects'),'transferred',jsonb_array_length(plan#>'{resources,transferred}'),
    'alreadyAttached',jsonb_array_length(plan#>'{resources,alreadyAttached}'),'folderContent',plan->'folderContent'->0->'name')
   FROM (SELECT hall_api.merge_council_business(pg_temp.reorg('absorbed'),pg_temp.reorg('target'),true) plan) preview),
  '{"report":"attachedToTarget","reportName":"Absorbed affair","blockers":[],"subjects":1,"transferred":1,"alreadyAttached":1,"folderContent":"Absorbed note"}'::JSONB,
  'the merge preview lists subjects, pieces, folder content and the report fate'
);
SELECT ok(EXISTS(SELECT FROM council_business WHERE id=pg_temp.reorg('absorbed')),'the merge preview writes nothing');
SELECT is(
  hall_api.merge_council_business(pg_temp.reorg('absorbed'),pg_temp.reorg('target'),false)->>'applied',
  'true',
  'a business merges into another one'
);
SELECT ok(
  NOT EXISTS(SELECT FROM council_business WHERE id=pg_temp.reorg('absorbed'))
  AND NOT EXISTS(SELECT FROM resource WHERE full_path='seed/Absorbed affair'),
  'the absorbed business and its folder are removed'
);
SELECT is(
  (SELECT council_business FROM open_question WHERE id=pg_temp.reorg('absorbed-subject')),
  pg_temp.reorg('target'),
  'its subjects belong to the target business'
);
SELECT is(
  (SELECT array_agg(r.name ORDER BY r.name) FROM council_business_resource link JOIN resource r ON r.id=link.resource
   WHERE link.council_business=pg_temp.reorg('target') AND r.name IN ('Absorbed affair','Absorbed note','Shared note')),
  ARRAY['Absorbed affair','Absorbed note','Shared note'],
  'its pieces join the target without duplicate, and its report becomes a target piece'
);
SELECT is(
  (SELECT array_agg(r.path ORDER BY r.name) FROM resource r WHERE r.id IN (pg_temp.reorg('absorbed-document'))
   OR r.name='Absorbed affair' AND NOT r.is_folder),
  ARRAY[pg_temp.folder('target'),pg_temp.folder('target')],
  'its folder content and its report move into the target folder'
);
SELECT is(
  hall_api.merge_council_business(pg_temp.reorg('empty'),pg_temp.reorg('target'),false)#>>'{report,fate}',
  'deleted',
  'an empty report is deleted with its business'
);
SELECT ok(NOT EXISTS(SELECT FROM resource WHERE path='seed/Empty affair' OR full_path='seed/Empty affair'),'nothing of the empty business remains');
SELECT throws_ok(
  format('SELECT hall_api.merge_council_business(%L,%L,false)',pg_temp.reorg('source'),pg_temp.reorg('source')),
  'HV827',NULL,'a business cannot merge into itself'
);
SELECT throws_ok(
  format('SELECT hall_api.merge_council_business(%L,%L,false)',pg_temp.reorg('source'),pg_temp.reorg('target')),
  'HV827',NULL,'a merge with a blocked subject is refused as a whole'
);
SELECT ok(EXISTS(SELECT FROM council_business WHERE id=pg_temp.reorg('source')),'a refused merge writes nothing');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pass('every deferred workspace and agenda constraint holds after the gestures');

SELECT * FROM finish();
ROLLBACK;
