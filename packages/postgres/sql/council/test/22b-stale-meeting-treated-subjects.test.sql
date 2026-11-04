-- A meeting marked stale was held outside Hall: its programmed subjects count
-- as treated, like subjects examined in a conducted meeting. Neither is
-- proposed again nor editable; a deprogrammed or never scheduled subject is.
BEGIN;
SET LOCAL search_path=hall,public,pg_catalog;
SET LOCAL hall.roles='["administrator"]';
\ir support/helpers.sql
SELECT no_plan();

CREATE TEMP TABLE stale_case(key TEXT PRIMARY KEY, id UUID);
INSERT INTO council_meetings(id,number,scheduled_at,location) VALUES
  (test_uuid('stale-case:held'),1,'2026-03-20 18:00Z','Council chamber'),
  (test_uuid('stale-case:conducted'),2,'2026-09-11 18:00Z','Council chamber'),
  (test_uuid('stale-case:target'),3,'2026-11-06 18:00Z','Council chamber');
INSERT INTO stale_case VALUES('business',(hall_api.create_council_business('seed','Stale regression','Report','Evidence')->>'id')::uuid);
INSERT INTO stale_case SELECT 'proposal',(hall_api.create_prepared_council_subject(id,'councilDecisionProposal','Held proposal','Proposal text')->>'id')::uuid FROM stale_case WHERE key='business';
INSERT INTO stale_case SELECT 'question',(hall_api.create_prepared_council_subject(id,'openQuestion','Held question','Question text')->>'id')::uuid FROM stale_case WHERE key='business';
INSERT INTO stale_case SELECT 'withdrawn',(hall_api.create_prepared_council_subject(id,'openQuestion','Withdrawn question','Withdrawn text')->>'id')::uuid FROM stale_case WHERE key='business';
INSERT INTO stale_case SELECT 'examined',(hall_api.create_prepared_council_subject(id,'openQuestion','Examined question','Examined text')->>'id')::uuid FROM stale_case WHERE key='business';
INSERT INTO stale_case SELECT 'fresh',(hall_api.create_prepared_council_subject(id,'councilDecisionProposal','Fresh proposal','Fresh text')->>'id')::uuid FROM stale_case WHERE key='business';
INSERT INTO stale_case SELECT 'proposal-item',(hall_api.schedule_prepared_council_subject(test_uuid('stale-case:held'),id,'councilDecisionProposal',1)->>'id')::uuid FROM stale_case WHERE key='proposal';
INSERT INTO stale_case SELECT 'question-item',(hall_api.schedule_prepared_council_subject(test_uuid('stale-case:held'),id,'openQuestion',2)->>'id')::uuid FROM stale_case WHERE key='question';
INSERT INTO stale_case SELECT 'withdrawn-item',(hall_api.schedule_prepared_council_subject(test_uuid('stale-case:held'),id,'openQuestion',3)->>'id')::uuid FROM stale_case WHERE key='withdrawn';
SELECT hall_api.deprogram_council_agenda_item(id) FROM stale_case WHERE key='withdrawn-item';
UPDATE council_meetings SET stale=TRUE WHERE id=test_uuid('stale-case:held');

INSERT INTO stale_case SELECT 'examined-item',(hall_api.schedule_prepared_council_subject(test_uuid('stale-case:conducted'),id,'openQuestion',1)->>'id')::uuid FROM stale_case WHERE key='examined';
SELECT test_ensure_council_member(test_uuid('stale-case:member'));
INSERT INTO meeting_attendance(id,council_member,council_meeting,status) VALUES(test_uuid('stale-case:attendance'),test_uuid('stale-case:member'),test_uuid('stale-case:conducted'),'present');
SELECT test_designate_present_officers(test_uuid('stale-case:conducted'));
SELECT test_prepare_notice(test_uuid('stale-case:conducted'));
SELECT start_council_meeting(test_uuid('stale-case:conducted'),'2026-09-11 18:00Z');
SELECT start_council_agenda_item(id,'2026-09-11 18:01Z') FROM stale_case WHERE key='examined-item';
SELECT complete_non_voting_agenda_item(id,'2026-09-11 18:02Z') FROM stale_case WHERE key='examined-item';

CREATE TEMP TABLE stale_case_text AS
SELECT stale_case.key, subject.text_resource AS id
FROM stale_case JOIN prepared_council_subject subject ON subject.id=stale_case.id;

SELECT is(
  (SELECT array_agg(candidate->>'title' ORDER BY candidate->>'title')
   FROM jsonb_array_elements(hall_api.list_prepared_council_subjects(test_uuid('stale-case:target'),NULL)) candidate),
  ARRAY['Fresh proposal','Withdrawn question'],
  'a later meeting is offered only subjects never treated: stale-meeting and examined subjects are not proposed'
);
SELECT is(
  jsonb_array_length(hall_api.list_prepared_council_subjects(NULL,(SELECT id FROM stale_case WHERE key='business'))),
  5,
  'the business still lists every subject it carries'
);
SELECT is(
  (SELECT jsonb_object_agg(stale_case.key,hall_api.open_prepared_council_subject(stale_case.id,subject.kind)#>>'{agenda,state}')
   FROM stale_case JOIN prepared_council_subject subject ON subject.id=stale_case.id),
  '{"proposal":"examined","question":"examined","withdrawn":"notScheduled","examined":"examined","fresh":"notScheduled"}'::jsonb,
  'a subject programmed in a stale meeting is shown as examined'
);

SELECT throws_ok(
  format('SELECT hall_api.schedule_prepared_council_subject(%L::uuid,%L::uuid,%L,1)',test_uuid('stale-case:target'),stale_case.id,subject.kind),
  'HV810','a treated prepared subject cannot be inscribed again',
  stale_case.key||' cannot be inscribed again'
)
FROM stale_case JOIN prepared_council_subject subject ON subject.id=stale_case.id
WHERE stale_case.key IN ('proposal','question','examined') ORDER BY stale_case.key;

SELECT is(
  (SELECT jsonb_object_agg(key,agenda_subject_text_is_editable(id)) FROM stale_case_text),
  '{"proposal":false,"question":false,"withdrawn":true,"examined":false,"fresh":true}'::jsonb,
  'only subjects never treated keep an editable text'
);
SELECT is(
  jsonb_array_length(resource_siren_actions(resource_detail(id))),0,
  key||' text offers no edit action'
)
FROM stale_case_text WHERE key IN ('proposal','question') ORDER BY key;
SELECT throws_ok(
  format('UPDATE text_resource SET content=''changed'' WHERE id=%L',id),
  'HV823',NULL,key||' content is immutable'
)
FROM stale_case_text WHERE key IN ('proposal','question') ORDER BY key;
SELECT throws_ok(
  format('UPDATE resource SET name=''Renamed'' WHERE id=%L',id),
  'HV823',NULL,key||' title is immutable'
)
FROM stale_case_text WHERE key IN ('proposal','question') ORDER BY key;
SELECT throws_ok(
  format('INSERT INTO resource_tag(resource_id,value) VALUES(%L,''added'')',id),
  'HV823',NULL,key||' tags are immutable'
)
FROM stale_case_text WHERE key IN ('proposal','question') ORDER BY key;
SELECT lives_ok(
  format('UPDATE text_resource SET content=''changed'' WHERE id=%L',id),
  key||' content remains editable'
)
FROM stale_case_text WHERE key IN ('withdrawn','fresh') ORDER BY key;
SELECT lives_ok(
  format('SELECT relocate_resource(%L,'''',''Stale regression moved'')',folder_resource),
  'the business folder still moves and is renamed with its frozen subject texts'
)
FROM council_business_workspace WHERE council_business=(SELECT id FROM stale_case WHERE key='business');

SELECT lives_ok(
  format('SELECT hall_api.schedule_prepared_council_subject(%L::uuid,%L::uuid,%L,1)',test_uuid('stale-case:target'),stale_case.id,subject.kind),
  stale_case.key||' can be inscribed on a later meeting'
)
FROM stale_case JOIN prepared_council_subject subject ON subject.id=stale_case.id
WHERE stale_case.key IN ('fresh','withdrawn') ORDER BY stale_case.key;

SELECT is(
  (SELECT array_agg(position ORDER BY abs(position)) FROM council_agenda_item WHERE council_meeting=test_uuid('stale-case:held')),
  ARRAY[1,2,-3],
  'the stale meeting agenda is left unchanged'
);
SELECT ok(
  (SELECT stale AND started_at IS NULL AND closed_at IS NULL FROM council_meetings WHERE id=test_uuid('stale-case:held'))
  AND NOT EXISTS(SELECT FROM council_agenda_item WHERE council_meeting=test_uuid('stale-case:held') AND (started_at IS NOT NULL OR completed_at IS NOT NULL)),
  'no conduct fact is recorded for the stale meeting'
);

SELECT * FROM finish();
ROLLBACK;
