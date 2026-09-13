BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
SET LOCAL hall.roles = '["administrator"]';
\ir ../../council/test/support/helpers.sql
SELECT no_plan();

-- @verifies-requirement HALL-FR-WSP-280 MEETING_START_LOCKS_AGENDA_SUBJECT_TEXTS:
CREATE TEMP TABLE source_editability_scenario AS
SELECT
  (hall.provision_initial_council_meeting()).id AS meeting,
  create_council_business_workspace('', 'source-editability', 'report', 'Initial report') AS business;

SELECT schedule_council_meeting(meeting, '2026-01-01 09:00Z', 'Council chamber')
FROM source_editability_scenario;

CREATE TEMP TABLE source_editability_items AS
SELECT
  schedule_council_decision_proposal(business, meeting, 1) AS decision_item,
  schedule_open_question(business, meeting, 2) AS open_item
FROM source_editability_scenario;

CREATE TEMP TABLE source_editability_resources(kind TEXT PRIMARY KEY, id UUID NOT NULL);
INSERT INTO source_editability_resources
SELECT 'decision', workspace.text_resource
FROM council_decision_proposal_workspace AS workspace
JOIN council_agenda_item AS item
  ON item.council_decision_proposal = workspace.council_decision_proposal
JOIN source_editability_items AS items ON items.decision_item = item.id
UNION ALL
SELECT 'open', workspace.text_resource
FROM open_question_workspace AS workspace
JOIN council_agenda_item AS item ON item.open_question = workspace.open_question
JOIN source_editability_items AS items ON items.open_item = item.id;

CREATE TEMP TABLE source_editability_workspace_resources(kind TEXT PRIMARY KEY, id UUID NOT NULL);
INSERT INTO source_editability_workspace_resources
SELECT 'folder', workspace.folder_resource
FROM council_business_workspace AS workspace
JOIN source_editability_scenario AS scenario ON scenario.business = workspace.council_business
UNION ALL
SELECT 'report', workspace.report_resource
FROM council_business_workspace AS workspace
JOIN source_editability_scenario AS scenario ON scenario.business = workspace.council_business;

CREATE TEMP TABLE source_editability_original_subjects AS
SELECT source.kind, source.id, resource.name, text.content
FROM source_editability_resources AS source
JOIN resource ON resource.id = source.id
JOIN text_resource AS text ON text.id = source.id;

SELECT ok(
  jsonb_array_length(hall.resource_siren_actions(hall.resource_detail(id))) > 0,
  kind || ' source exposes its mutation actions before meeting start'
)
FROM source_editability_resources
ORDER BY kind;

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
  jsonb_array_length(hall.resource_siren_actions(hall.resource_detail(id))),
  0,
  kind || ' source exposes no mutation action after meeting start'
)
FROM source_editability_resources
ORDER BY kind;

SELECT ok(
  jsonb_array_length(hall.resource_siren_actions(hall.resource_detail(id))) > 0,
  kind || ' keeps its own mutation actions after meeting start'
)
FROM source_editability_workspace_resources
ORDER BY kind;

SELECT throws_ok(
  format(
    'SELECT hall_api.update_text_resource(%L::uuid, (SELECT version FROM hall.text_resource WHERE id = %L::uuid), %L, ARRAY[]::uuid[])',
    id,
    id,
    'late change'
  ),
  'HV823',
  'an agenda subject text is immutable after its meeting starts',
  kind || ' source rejects content writes after meeting start'
)
FROM source_editability_resources
ORDER BY kind;

SELECT lives_ok(
  format(
    'SELECT hall_api.move_resource(%L::uuid, %L)',
    (SELECT id FROM source_editability_workspace_resources WHERE kind = 'folder'),
    'archive'
  ),
  'the business folder remains movable after meeting start'
);

SELECT is(
  resource.path,
  (SELECT folder.full_path
   FROM source_editability_workspace_resources AS source
   JOIN resource AS folder ON folder.id = source.id
   WHERE source.kind = 'folder'),
  source.kind || ' path follows the business folder without changing the subject'
)
FROM source_editability_resources AS source
JOIN resource ON resource.id = source.id
ORDER BY source.kind;

SELECT is(resource.name, original.name, source.kind || ' title survives the business folder move')
FROM source_editability_resources AS source
JOIN source_editability_original_subjects AS original USING (kind, id)
JOIN resource ON resource.id = source.id
ORDER BY source.kind;

SELECT is(text.content, original.content, source.kind || ' content survives the business folder move')
FROM source_editability_resources AS source
JOIN source_editability_original_subjects AS original USING (kind, id)
JOIN text_resource AS text ON text.id = source.id
ORDER BY source.kind;

SELECT lives_ok(
  format(
    'SELECT hall_api.update_text_resource(%L::uuid, (SELECT version FROM hall.text_resource WHERE id = %L::uuid), %L, ARRAY[]::uuid[])',
    id,
    id,
    'Updated report after opening'
  ),
  'the business report remains editable after meeting start'
)
FROM source_editability_workspace_resources
WHERE kind = 'report';

SELECT throws_ok(
  format(
    'SELECT hall_api.rename_resource(%L::uuid, %L)',
    id,
    kind || '-renamed-after-opening'
  ),
  'HV823',
  'an agenda subject text is immutable after its meeting starts',
  kind || ' source rejects renaming after meeting start'
)
FROM source_editability_resources
ORDER BY kind;

SELECT throws_ok(
  format('DELETE FROM hall.resource WHERE id = %L::uuid', id),
  'HV823',
  'an agenda subject text is immutable after its meeting starts',
  kind || ' source rejects deletion after meeting start'
)
FROM source_editability_resources
WHERE kind = 'open'
ORDER BY kind;

SELECT throws_ok(
  format(
    'DELETE FROM hall.resource WHERE id = %L::uuid',
    (SELECT id FROM source_editability_resources WHERE kind = 'decision')
  ),
  'HV820',
  'a proposal text cannot be deleted or replaced',
  'the proposal source keeps its stronger permanent deletion guard'
);

SELECT throws_ok(
  $$UPDATE hall.open_question_workspace
    SET text_resource = (SELECT id FROM source_editability_attachment)
    WHERE text_resource = (SELECT id FROM source_editability_resources WHERE kind = 'open')$$,
  'HV823',
  'an agenda subject text is immutable after its meeting starts',
  'the started open question source cannot be retargeted'
);

SELECT throws_ok(
  $$DELETE FROM hall.open_question_workspace
    WHERE text_resource = (SELECT id FROM source_editability_resources WHERE kind = 'open')$$,
  'HV823',
  'an agenda subject text is immutable after its meeting starts',
  'the started open question workspace mapping cannot be deleted'
);

SELECT throws_ok(
  $$UPDATE hall.agenda_subject_text_lock
    SET locked_at = clock_timestamp()
    WHERE resource = (SELECT id FROM source_editability_resources WHERE kind = 'open')$$,
  'HV823',
  'an agenda subject text lock is immutable',
  'a recorded source lock cannot be rewritten'
);

SELECT throws_ok(
  $$DELETE FROM hall.agenda_subject_text_lock
    WHERE resource = (SELECT id FROM source_editability_resources WHERE kind = 'open')$$,
  'HV823',
  'an agenda subject text lock is immutable',
  'a recorded source lock cannot be deleted'
);

CREATE TEMP TABLE source_editability_successor AS
SELECT close_council_meeting(meeting, '2026-01-01 10:00Z') AS meeting
FROM source_editability_scenario;

SELECT is(
  jsonb_array_length(hall.resource_siren_actions(hall.resource_detail(id))),
  0,
  kind || ' source remains read-only after an unexamined point is carried forward'
)
FROM source_editability_resources
ORDER BY kind;

SELECT ok(
  jsonb_array_length(hall.resource_siren_actions(hall.resource_detail(id))) > 0,
  kind || ' remains mutable after carry-forward'
)
FROM source_editability_workspace_resources
ORDER BY kind;

SELECT throws_ok(
  format(
    'SELECT hall_api.rename_resource(%L::uuid, %L)',
    id,
    kind || '-renamed-after-carry-forward'
  ),
  'HV823',
  'an agenda subject text is immutable after its meeting starts',
  kind || ' source remains impossible to rename after carry-forward'
)
FROM source_editability_resources
ORDER BY kind;

SELECT ok(
  jsonb_array_length(hall.resource_siren_actions(hall.resource_detail(id))) > 0,
  'an attached working resource keeps its own mutation actions'
)
FROM source_editability_attachment;

SELECT lives_ok(
  format(
    'SELECT hall_api.update_text_resource(%L::uuid, (SELECT version FROM hall.text_resource WHERE id = %L::uuid), %L, ARRAY[]::uuid[])',
    id,
    id,
    'still editable'
  ),
  'an attached working resource remains editable'
)
FROM source_editability_attachment;

-- A question introduced during an ongoing meeting is locked as soon as its
-- agenda item is inserted, rather than waiting for another lifecycle event.
CREATE TEMP TABLE source_editability_late_meeting AS
SELECT
  test_uuid('source-editability:late-meeting') AS meeting,
  create_council_business_workspace(
    '',
    'late-agenda-business',
    'late-agenda-report',
    'Initial agenda report'
  ) AS business;

INSERT INTO council_meetings(id, number, scheduled_at, location)
SELECT meeting, 99, '2026-02-01 09:00Z', 'Council chamber'
FROM source_editability_late_meeting;
SELECT schedule_open_question(business, meeting, 1)
FROM source_editability_late_meeting;
SELECT test_ensure_council_member(test_uuid('source-editability:late-member'));
INSERT INTO meeting_attendance(id, council_member, council_meeting, status)
SELECT
  test_uuid('source-editability:late-attendance'),
  test_uuid('source-editability:late-member'),
  meeting,
  'present'
FROM source_editability_late_meeting;
SELECT test_designate_present_officers(meeting) FROM source_editability_late_meeting;
SELECT test_prepare_notice(meeting) FROM source_editability_late_meeting;
SELECT start_council_meeting(meeting, '2026-02-01 09:00Z') FROM source_editability_late_meeting;
SELECT start_council_agenda_item(item.id, '2026-02-01 09:01Z')
FROM council_agenda_item AS item
JOIN source_editability_late_meeting AS scenario ON scenario.meeting = item.council_meeting;
SELECT complete_non_voting_agenda_item(item.id, '2026-02-01 09:02Z')
FROM council_agenda_item AS item
JOIN source_editability_late_meeting AS scenario ON scenario.meeting = item.council_meeting;

CREATE TEMP TABLE source_editability_late_item AS
SELECT hall_api.add_open_question(
  meeting,
  '',
  'late-open-question',
  'Question introduced during the meeting'
) AS item
FROM source_editability_late_meeting;

CREATE TEMP TABLE source_editability_late_resource AS
SELECT workspace.text_resource AS id
FROM source_editability_late_item AS added
JOIN council_agenda_item AS item ON item.id = (added.item ->> 'id')::UUID
JOIN open_question_workspace AS workspace ON workspace.open_question = item.open_question;

SELECT is(
  jsonb_array_length(hall.resource_siren_actions(hall.resource_detail(id))),
  0,
  'a question introduced during the meeting exposes no mutation action'
)
FROM source_editability_late_resource;

SELECT throws_ok(
  format('SELECT hall_api.rename_resource(%L::uuid, %L)', id, 'renamed-late-question'),
  'HV823',
  'an agenda subject text is immutable after its meeting starts',
  'a question introduced during the meeting cannot be renamed'
)
FROM source_editability_late_resource;

SELECT * FROM finish();
ROLLBACK;
