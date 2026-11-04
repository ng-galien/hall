BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
SET LOCAL hall.roles = '["administrator"]';
\ir ../../council/test/support/helpers.sql
SELECT no_plan();

-- @verifies-requirement HALL-FR-WSP-280 MEETING_CONDUCT_LOCKS_AGENDA_SUBJECT_TEXTS:
-- @verifies-requirement HALL-FR-AGI-310 COMPLETED_AGENDA_ITEM_REMAINS_PROGRAMMED:
CREATE TEMP TABLE source_editability_scenario AS
SELECT
  (hall.provision_initial_council_meeting()).id AS meeting,
  create_council_business_workspace('', 'source-editability', 'report', 'Initial report') AS business,
  create_council_business_workspace('', 'carried-decision', 'carried-report', 'Carried report') AS carried_business;

SELECT schedule_council_meeting(meeting, '2026-01-01 09:00Z', 'Council chamber')
FROM source_editability_scenario;

CREATE TEMP TABLE source_editability_items AS
SELECT
  schedule_council_decision_proposal(business, meeting, 1) AS decision_item,
  schedule_open_question(business, meeting, 2) AS open_item,
  schedule_open_question(business, meeting, 3) AS carried_item,
  schedule_council_decision_proposal(carried_business, meeting, 4) AS carried_decision_item
FROM source_editability_scenario;

CREATE TEMP TABLE source_editability_resources(kind TEXT PRIMARY KEY, id UUID NOT NULL);
INSERT INTO source_editability_resources
SELECT 'decision', workspace.text_resource
FROM council_decision_proposal_workspace AS workspace
JOIN council_agenda_item AS item ON item.council_decision_proposal = workspace.council_decision_proposal
JOIN source_editability_items AS items ON items.decision_item = item.id
UNION ALL
SELECT 'open', workspace.text_resource
FROM open_question_workspace AS workspace
JOIN council_agenda_item AS item ON item.open_question = workspace.open_question
JOIN source_editability_items AS items ON items.open_item = item.id
UNION ALL
SELECT 'carried', workspace.text_resource
FROM open_question_workspace AS workspace
JOIN council_agenda_item AS item ON item.open_question = workspace.open_question
JOIN source_editability_items AS items ON items.carried_item = item.id
UNION ALL
SELECT 'carried-decision', workspace.text_resource
FROM council_decision_proposal_workspace AS workspace
JOIN council_agenda_item AS item ON item.council_decision_proposal = workspace.council_decision_proposal
JOIN source_editability_items AS items ON items.carried_decision_item = item.id;

INSERT INTO resource_tag(resource_id, value)
SELECT id, 'initial' FROM source_editability_resources;

SELECT hall_api.create_folder('', 'archive');

CREATE TEMP TABLE source_editability_attachment AS
SELECT (create_text_resource('', 'working-note', 'Editable attachment') ->> 'id')::UUID AS id;
SELECT associate_council_business_resource(scenario.business, attachment.id)
FROM source_editability_scenario AS scenario, source_editability_attachment AS attachment;

INSERT INTO meeting_attendance(id, council_member, council_meeting, status)
SELECT test_uuid('source-editability:attendance'), test_uuid('source-editability:member'), meeting, 'present'
FROM source_editability_scenario;
SELECT test_designate_present_officers(meeting) FROM source_editability_scenario;
SELECT test_prepare_notice(meeting) FROM source_editability_scenario;
SELECT start_council_meeting(meeting, '2026-01-01 09:00Z') FROM source_editability_scenario;

SELECT is(
  hall.prepared_council_subject_projection(item.open_question, 'openQuestion')->'agenda'->'meeting'->>'startedAt',
  '2026-01-01T09:00:00+00:00',
  'the prepared-subject projection exposes that its meeting has started'
)
FROM council_agenda_item AS item
JOIN source_editability_items AS items ON items.open_item = item.id;

SELECT ok(
  jsonb_array_length(hall.resource_siren_actions(hall.resource_detail(id))) = 0,
  kind || ' source exposes no mutation actions while its prepared meeting is open'
)
FROM source_editability_resources
ORDER BY kind;

SELECT throws_ok(
  format(
    'SELECT hall_api.update_text_resource(%L::uuid, (SELECT version FROM hall.text_resource WHERE id = %L::uuid), %L, ARRAY[]::uuid[])',
    id, id, 'updated after meeting opening'
  ),
  'HV823',
  'an agenda subject text is immutable during meeting conduct or after its agenda item starts',
  kind || ' source rejects content changes while its prepared meeting is open'
)
FROM source_editability_resources
ORDER BY kind;

-- @verifies-requirement HALL-FR-WSP-280 MEETING_CONDUCT_LOCKS_AGENDA_SUBJECT_TEXTS:
SELECT throws_ok(
  format(statement, id),
  'HV823',
  'an agenda subject text is immutable during meeting conduct or after its agenda item starts',
  kind || ' source rejects tag ' || operation || ' while its prepared meeting is open'
)
FROM source_editability_resources
CROSS JOIN (VALUES
  ('insertion', 'INSERT INTO hall.resource_tag(resource_id, value) VALUES (%L, ''added'')'),
  ('change', 'UPDATE hall.resource_tag SET value = ''changed'' WHERE resource_id = %L'),
  ('removal', 'DELETE FROM hall.resource_tag WHERE resource_id = %L')
) AS tag_operation(operation, statement)
ORDER BY kind, operation;

SELECT hall_api.move_resource(
  (SELECT folder_resource FROM council_business_workspace JOIN source_editability_scenario ON council_business = business),
  'archive'
);

SELECT start_council_agenda_item(decision_item, '2026-01-01 09:01Z')
FROM source_editability_items;

SELECT is(
  jsonb_array_length(hall.resource_siren_actions(hall.resource_detail(id))),
  0,
  'a decision source exposes no mutation actions once its agenda item starts'
)
FROM source_editability_resources
WHERE kind = 'decision';

SELECT throws_ok(
  format('SELECT hall_api.rename_resource(%L::uuid, %L)', id, 'locked-decision'),
  'HV823',
  'an agenda subject text is immutable during meeting conduct or after its agenda item starts',
  'a started decision source cannot be renamed'
)
FROM source_editability_resources
WHERE kind = 'decision';

SELECT throws_ok(
  format(
    'SELECT hall_api.update_text_resource(%L::uuid, (SELECT version FROM hall.text_resource WHERE id = %L::uuid), %L, ARRAY[]::uuid[])',
    id, id, 'forbidden decision update'
  ),
  'HV823',
  'an agenda subject text is immutable during meeting conduct or after its agenda item starts',
  'a started decision source rejects content changes'
)
FROM source_editability_resources
WHERE kind = 'decision';

SELECT throws_ok(
  $$UPDATE hall.agenda_subject_text_lock SET locked_at = clock_timestamp()
    WHERE resource = (SELECT id FROM source_editability_resources WHERE kind = 'decision')$$,
  'HV823', 'an agenda subject text lock is immutable', 'a recorded source lock cannot be rewritten'
);

SELECT adjourn_council_agenda_item(decision_item, '2026-01-01 09:02Z')
FROM source_editability_items;
SELECT start_council_agenda_item(open_item, '2026-01-01 09:03Z')
FROM source_editability_items;

SELECT is(
  jsonb_array_length(hall.resource_siren_actions(hall.resource_detail(id))),
  0,
  'an open-question source exposes no mutation actions once its agenda item starts'
)
FROM source_editability_resources
WHERE kind = 'open';

SELECT throws_ok(
  $$UPDATE hall.open_question_workspace
    SET text_resource = (SELECT id FROM source_editability_attachment)
    WHERE text_resource = (SELECT id FROM source_editability_resources WHERE kind = 'open')$$,
  'HV823',
  'an agenda subject text is immutable during meeting conduct or after its agenda item starts',
  'a started open-question source cannot be retargeted'
);

SELECT complete_non_voting_agenda_item(open_item, '2026-01-01 09:04Z')
FROM source_editability_items;

CREATE TEMP TABLE source_editability_successor AS
SELECT close_council_meeting(meeting, '2026-01-01 10:00Z') AS meeting
FROM source_editability_scenario;

SELECT ok(
  hall.prepared_council_subject_projection(item.open_question, 'openQuestion') #>> '{agenda,state}' = 'examined'
    AND hall.prepared_council_subject_projection(item.open_question, 'openQuestion') -> 'scheduleTarget' = 'null'::JSONB,
  'a completed prepared question remains examined and cannot target the next meeting'
)
FROM council_agenda_item AS item
JOIN source_editability_items AS items ON items.open_item = item.id;

SELECT throws_ok(
  format(
    'SELECT hall_api.schedule_prepared_council_subject(%L::uuid, %L::uuid, %L, 1)',
    successor.meeting,
    item.open_question,
    'openQuestion'
  ),
  'HV810',
  'a treated prepared subject cannot be inscribed again',
  'the database refuses to inscribe a completed prepared question in the next meeting'
)
FROM source_editability_successor AS successor
CROSS JOIN source_editability_items AS items
JOIN council_agenda_item AS item ON item.id = items.open_item;

SELECT ok(
  jsonb_array_length(hall.resource_siren_actions(hall.resource_detail(id))) > 0,
  'an unstarted carried question remains editable after closure'
)
FROM source_editability_resources
WHERE kind = 'carried';

SELECT lives_ok(
  format('SELECT hall_api.rename_resource(%L::uuid, %L)', id, 'carried-question'),
  'an unstarted carried question can still be renamed'
)
FROM source_editability_resources
WHERE kind = 'carried';

SELECT ok(
  jsonb_array_length(hall.resource_siren_actions(hall.resource_detail(id))) > 0,
  'an unstarted carried decision proposal remains editable after closure'
)
FROM source_editability_resources
WHERE kind = 'carried-decision';

SELECT throws_ok(
  format(statement, id),
  'HV823',
  'an agenda subject text is immutable during meeting conduct or after its agenda item starts',
  kind || ' started source still rejects tag ' || operation || ' after closure'
)
FROM source_editability_resources
CROSS JOIN (VALUES
  ('insertion', 'INSERT INTO hall.resource_tag(resource_id, value) VALUES (%L, ''added'')'),
  ('change', 'UPDATE hall.resource_tag SET value = ''changed'' WHERE resource_id = %L'),
  ('removal', 'DELETE FROM hall.resource_tag WHERE resource_id = %L')
) AS tag_operation(operation, statement)
WHERE kind IN ('decision', 'open')
ORDER BY kind, operation;

SELECT lives_ok(
  format(statement, id),
  kind || ' unstarted carried source accepts tag ' || operation || ' after closure'
)
FROM source_editability_resources
CROSS JOIN (VALUES
  ('1 insertion', 'INSERT INTO hall.resource_tag(resource_id, value) VALUES (%L, ''added'')'),
  ('2 change', 'UPDATE hall.resource_tag SET value = ''changed'' WHERE resource_id = %L AND value = ''added'''),
  ('3 removal', 'DELETE FROM hall.resource_tag WHERE resource_id = %L')
) AS tag_operation(operation, statement)
WHERE kind IN ('carried', 'carried-decision')
ORDER BY kind, operation;

SELECT is(
  (SELECT count(*)::INTEGER FROM hall.resource_tag WHERE resource_id = source.id),
  0,
  source.kind || ' unstarted carried source tags were changed and removed'
)
FROM source_editability_resources AS source
WHERE kind IN ('carried', 'carried-decision')
ORDER BY kind;

SELECT ok(
  jsonb_array_length(hall.resource_siren_actions(hall.resource_detail(id))) > 0,
  'an attached working resource remains editable'
)
FROM source_editability_attachment;

-- A question added in an open meeting also remains editable until its own
-- discussion starts, then receives the same durable lock.
UPDATE council_meetings
SET stale = TRUE
WHERE id = (SELECT meeting FROM source_editability_successor);

CREATE TEMP TABLE source_editability_late_meeting AS
SELECT test_uuid('source-editability:late-meeting') AS meeting,
  create_council_business_workspace('', 'late-agenda-business', 'late-agenda-report', 'Initial agenda report') AS business;
INSERT INTO council_meetings(id, number, scheduled_at, location)
SELECT meeting, 99, '2026-02-01 09:00Z', 'Council chamber' FROM source_editability_late_meeting;
SELECT schedule_open_question(business, meeting, 1) FROM source_editability_late_meeting;
SELECT test_ensure_council_member(test_uuid('source-editability:late-member'));
INSERT INTO meeting_attendance(id, council_member, council_meeting, status)
SELECT test_uuid('source-editability:late-attendance'), test_uuid('source-editability:late-member'), meeting, 'present'
FROM source_editability_late_meeting;
SELECT test_designate_present_officers(meeting) FROM source_editability_late_meeting;
SELECT test_prepare_notice(meeting) FROM source_editability_late_meeting;
SELECT start_council_meeting(meeting, '2026-02-01 09:00Z') FROM source_editability_late_meeting;
SELECT start_council_agenda_item(item.id, '2026-02-01 09:01Z')
FROM council_agenda_item AS item JOIN source_editability_late_meeting AS scenario ON scenario.meeting = item.council_meeting;
SELECT complete_non_voting_agenda_item(item.id, '2026-02-01 09:02Z')
FROM council_agenda_item AS item JOIN source_editability_late_meeting AS scenario ON scenario.meeting = item.council_meeting;

-- Prepared subjects remain owned by the workspace after opening. The only
-- in-meeting addition is created from the live meeting flow below.
CREATE TEMP TABLE source_editability_late_prepared(kind TEXT PRIMARY KEY, payload JSONB NOT NULL);
INSERT INTO source_editability_late_prepared(kind, payload)
SELECT 'councilDecisionProposal', hall_api.create_prepared_council_subject(
  business,
  'councilDecisionProposal',
  'late-prepared-proposal',
  'Proposal prepared before its discussion'
)
FROM source_editability_late_meeting
UNION ALL
SELECT 'openQuestion', hall_api.create_prepared_council_subject(
  business,
  'openQuestion',
  'late-prepared-question',
  'Question prepared before its discussion'
)
FROM source_editability_late_meeting;

SELECT ok(
  payload #>> '{agenda,state}' = 'notScheduled'
    AND payload -> 'scheduleTarget' = 'null'::JSONB,
  kind || ' exposes no scheduling target once the meeting is open'
)
FROM source_editability_late_prepared
ORDER BY kind;

SELECT throws_ok(
  format(
    'SELECT hall_api.schedule_prepared_council_subject(%L::uuid, %L::uuid, %L, 2)',
    scenario.meeting,
    prepared.payload ->> 'id',
    prepared.kind
  ),
  'HV810',
  'prepared subjects require an unstarted meeting',
  prepared.kind || ' cannot be inscribed from the workspace once the meeting is open'
)
FROM source_editability_late_prepared AS prepared
CROSS JOIN source_editability_late_meeting AS scenario
ORDER BY prepared.kind;

SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'hall.validate_council_agenda_addition()'::regprocedure),
  true,
  'the deferred addition validator retains access when the API transaction commits'
);

CREATE TEMP TABLE source_editability_late_item AS
SELECT hall_api.add_open_question(meeting, '', 'late-open-question', 'Question introduced during the meeting') AS item
FROM source_editability_late_meeting;
CREATE TEMP TABLE source_editability_late_resource AS
SELECT workspace.text_resource AS id
FROM source_editability_late_item AS added
JOIN council_agenda_item AS item ON item.id = (added.item ->> 'id')::UUID
JOIN open_question_workspace AS workspace ON workspace.open_question = item.open_question;

SELECT ok(
  jsonb_array_length(hall.resource_siren_actions(hall.resource_detail(id))) > 0,
  'a question introduced during the meeting remains editable before its item starts'
)
FROM source_editability_late_resource;
SELECT start_council_agenda_item((item.item ->> 'id')::UUID, clock_timestamp())
FROM source_editability_late_item AS item;
SELECT is(
  jsonb_array_length(hall.resource_siren_actions(hall.resource_detail(id))),
  0,
  'a question introduced during the meeting becomes read-only when its item starts'
)
FROM source_editability_late_resource;

SET LOCAL session_replication_role = replica;
DELETE FROM hall.agenda_subject_text_lock;
SET LOCAL session_replication_role = origin;
SELECT is((SELECT count(*)::INTEGER FROM hall.agenda_subject_text_lock), 0,
  'an older database can contain started items without durable text locks');

SET LOCAL session_replication_role = replica;
\ir ../../migrations/001-agenda-subject-text-lock.sql
SET LOCAL session_replication_role = origin;
SELECT is((SELECT count(*)::INTEGER FROM hall.agenda_subject_text_lock), 4,
  'the data migration restores locks for previously started subjects');
SELECT ok(NOT hall.agenda_subject_text_is_editable(id),
  kind || ' started subject stays locked after the data migration')
FROM source_editability_resources WHERE kind IN ('decision', 'open');
SELECT ok(NOT EXISTS (SELECT FROM hall.agenda_subject_text_lock WHERE resource = id),
  'the data migration creates no lock for a never-started subject')
FROM source_editability_resources WHERE kind IN ('carried', 'carried-decision');
SELECT ok(NOT hall.agenda_subject_text_is_editable(id),
  'a never-started subject programmed in a meeting marked stale counts as treated')
FROM source_editability_resources WHERE kind IN ('carried', 'carried-decision');

SET LOCAL session_replication_role = replica;
\ir ../../migrations/001-agenda-subject-text-lock.sql
SET LOCAL session_replication_role = origin;
SELECT is((SELECT count(*)::INTEGER FROM hall.agenda_subject_text_lock), 4,
  'rerunning the data migration creates no duplicate locks');

SELECT * FROM finish();
ROLLBACK;
