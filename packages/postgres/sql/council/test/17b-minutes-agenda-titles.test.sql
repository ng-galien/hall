-- @verifies-requirement HALL-FR-MIN-160
BEGIN;
\ir support/helpers.sql
SELECT no_plan();

INSERT INTO council_meetings(id,number,scheduled_at,location)
VALUES(test_uuid('minutes-titles:meeting'),1,'2026-01-01 18:00Z','Council chamber');
SELECT test_ensure_council_member(test_uuid('minutes-titles:member'));
INSERT INTO meeting_attendance(id,council_member,council_meeting,status)
VALUES(test_uuid('minutes-titles:attendance'),test_uuid('minutes-titles:member'),test_uuid('minutes-titles:meeting'),'present');
SELECT test_designate_present_officers(test_uuid('minutes-titles:meeting'));
SELECT test_create_decision_agenda_item('minutes-titles',test_uuid('minutes-titles:meeting'),1);
UPDATE resource SET name='Historical proposal title'
WHERE id=(SELECT text_resource FROM council_decision_proposal_workspace WHERE council_decision_proposal=test_uuid('minutes-titles:proposal'));
SELECT test_ensure_business(test_uuid('minutes-titles:question-business'));
CREATE TEMP TABLE question AS SELECT schedule_open_question(test_uuid('minutes-titles:question-business'),test_uuid('minutes-titles:meeting'),2) id;
UPDATE resource SET name='Historical question title'
WHERE id=(SELECT text_resource FROM open_question_workspace WHERE open_question=(SELECT open_question FROM council_agenda_item WHERE id=(SELECT id FROM question)));
SELECT test_prepare_notice(test_uuid('minutes-titles:meeting'));
-- A later preparatory rename must not rewrite the title of the frozen notice.
UPDATE resource SET name='Later question title'
WHERE id=(SELECT text_resource FROM open_question_workspace WHERE open_question=(SELECT open_question FROM council_agenda_item WHERE id=(SELECT id FROM question)));
SELECT start_council_meeting(test_uuid('minutes-titles:meeting'),'2026-01-01 18:00Z');
SELECT close_council_meeting(test_uuid('minutes-titles:meeting'),'2026-01-01 19:00Z');

SELECT is((SELECT facts#>>'{agenda,0,title}' FROM minutes WHERE council_meeting=test_uuid('minutes-titles:meeting')),
  'Historical proposal title','minutes use the frozen proposal title rather than the business folder name');
SELECT is((SELECT facts#>>'{agenda,1,title}' FROM minutes WHERE council_meeting=test_uuid('minutes-titles:meeting')),
  'Historical question title','minutes preserve the frozen question title despite a later resource rename');
SELECT is((SELECT payload#>>'{agenda,1,title}' FROM council_meeting_snapshot WHERE council_meeting=test_uuid('minutes-titles:meeting') AND phase='closing'),
  'Historical question title','the closing observation retains the agenda title before working occurrences are carried forward');
SELECT is(capture_minutes_facts(test_uuid('minutes-titles:meeting'))#>>'{agenda,1,title}',
  'Historical question title','capturing from the historical observation does not consult the carried-forward working title');
SELECT * FROM finish();
ROLLBACK;
