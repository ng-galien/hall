-- @verifies-requirement HALL-FR-AGI-410
-- append a non-voting question after the agenda is finished.
BEGIN;
SET LOCAL search_path=hall,public,pg_catalog;
SET LOCAL hall.roles='["administrator"]';
SET LOCAL hall.actor_id='addition-test';
\ir support/helpers.sql
SELECT no_plan();
INSERT INTO council_meetings(id,number,scheduled_at,location) VALUES(test_uuid('addition:meeting'),1,'2026-01-01 18:00Z','Council chamber');
SELECT throws_ok($$SELECT hall_api.add_open_question(test_uuid('addition:meeting'),'seed','Too early','')$$,'HV235',NULL,'unstarted meeting refuses the addition');
SELECT test_ensure_council_member(test_uuid('addition:member'));
INSERT INTO meeting_attendance(id,council_member,council_meeting,status) VALUES(test_uuid('addition:attendance'),test_uuid('addition:member'),test_uuid('addition:meeting'),'present');
SELECT test_designate_present_officers(test_uuid('addition:meeting'));
SELECT test_prepare_notice(test_uuid('addition:meeting'));
CREATE TEMP TABLE addition_before AS SELECT hall.meeting_notice_meeting_facts(test_uuid('addition:meeting')) facts, (SELECT content FROM binary_object WHERE id=(SELECT binary_object FROM meeting_notice WHERE council_meeting=test_uuid('addition:meeting'))) bytes;
SELECT start_council_meeting(test_uuid('addition:meeting'),'2026-01-01 18:00Z');
SELECT start_council_agenda_item((SELECT id FROM council_agenda_item WHERE council_meeting=test_uuid('addition:meeting')),'2026-01-01 18:01Z');
SELECT complete_non_voting_agenda_item((SELECT id FROM council_agenda_item WHERE council_meeting=test_uuid('addition:meeting')),'2026-01-01 18:02Z');
CREATE TEMP TABLE business_count_before AS SELECT count(*) AS n FROM council_business;
CREATE TEMP TABLE added AS SELECT hall_api.add_open_question(test_uuid('addition:meeting'),'seed','Question en fin de séance','Texte libre') item;
SELECT is((SELECT count(*) FROM council_business),(SELECT n+1 FROM business_count_before),'new business path creates exactly one business');
SELECT is((SELECT item->>'agendaNumber' FROM added),'2','addition follows the finished agenda');
SELECT is((SELECT item#>>'{subject,kind}' FROM added),'openQuestion','addition uses the existing open question nature');
SELECT ok((SELECT item->>'introducedAt' IS NOT NULL FROM added),'addition exposes its recorded chronology');
SELECT is(hall.meeting_notice_meeting_facts(test_uuid('addition:meeting')),(SELECT facts FROM addition_before),'frozen notice facts remain exactly unchanged');
SELECT is((SELECT content FROM binary_object WHERE id=(SELECT binary_object FROM meeting_notice WHERE council_meeting=test_uuid('addition:meeting'))),(SELECT bytes FROM addition_before),'original notice bytes remain unchanged');
SELECT throws_ok($$SELECT start_council_agenda_item((SELECT (item->>'id')::uuid FROM added),'2026-01-01 18:03Z')$$,'HV235',NULL,'discussion cannot be backdated before the addition');
SELECT throws_ok($$SELECT adjourn_council_agenda_item((SELECT (item->>'id')::uuid FROM added),'2026-01-01 18:03Z')$$,'HV235',NULL,'adjournment cannot be backdated before the addition');
SELECT throws_ok($$UPDATE council_agenda_addition SET introduced_at=clock_timestamp()$$,'HV235',NULL,'addition chronology is immutable');
SELECT start_council_agenda_item((SELECT (item->>'id')::uuid FROM added),clock_timestamp());
SELECT hall_api.update_council_agenda_item_notes((SELECT (item->>'id')::uuid FROM added),'Échanges consignés');
SELECT complete_non_voting_agenda_item((SELECT (item->>'id')::uuid FROM added),clock_timestamp());
SELECT is((SELECT count(*)::int FROM ballots WHERE council_agenda_item=(SELECT (item->>'id')::uuid FROM added)),0,'open question completion creates no ballot');
SELECT close_council_meeting(test_uuid('addition:meeting'),clock_timestamp());
-- @verifies-requirement HALL-FR-MIN-160
SELECT is((SELECT facts#>>'{agenda,1,title}' FROM minutes WHERE council_meeting=test_uuid('addition:meeting')),'Question en fin de séance','minutes capture the title of an in-meeting addition absent from the frozen notice');
SELECT is((SELECT hall_api.open_minutes(id)#>>'{facts,agenda,1,introducedAt}' FROM minutes WHERE council_meeting=test_uuid('addition:meeting')),(SELECT item->>'introducedAt' FROM added),'minutes retain the addition timestamp');
SELECT is((SELECT hall_api.open_minutes(id)#>>'{sections,1,content}' FROM minutes WHERE council_meeting=test_uuid('addition:meeting')),'Échanges consignés','minutes retain the discussion');
SELECT throws_ok($$SELECT hall_api.add_open_question(test_uuid('addition:meeting'),'seed','Too late','')$$,'HV235',NULL,'closed meeting refuses addition');
SELECT is((SELECT count(*)::int FROM council_agenda_addition),1,'failed additions leave no partial addition records');

-- Same append command with a recorded notMet quorum, without a vote.
INSERT INTO council_meetings(id,number,scheduled_at,location) VALUES(test_uuid('addition:notmet'),3,'2026-01-01 18:00Z','Council chamber');
SELECT test_ensure_council_member(test_uuid('addition:absent:'||n)) FROM generate_series(1,2)n;
INSERT INTO meeting_attendance(id,council_member,council_meeting,status) VALUES(test_uuid('addition:notmet-present'),test_uuid('addition:member'),test_uuid('addition:notmet'),'present');
INSERT INTO meeting_attendance(id,council_member,council_meeting,status) SELECT test_uuid('addition:absent-attendance:'||n),test_uuid('addition:absent:'||n),test_uuid('addition:notmet'),'absent' FROM generate_series(1,2)n;
SELECT test_designate_present_officers(test_uuid('addition:notmet'));
SELECT test_prepare_notice(test_uuid('addition:notmet'));
SELECT start_council_meeting(test_uuid('addition:notmet'),'2026-01-01 18:00Z');
SELECT is((SELECT facts->>'verdict' FROM meeting_quorum_observation WHERE council_meeting=test_uuid('addition:notmet') AND agenda_item IS NULL),'notMet','fixture actually records insufficient quorum');
SELECT adjourn_council_agenda_item((SELECT id FROM council_agenda_item WHERE council_meeting=test_uuid('addition:notmet')),'2026-01-01 18:01Z');
CREATE TEMP TABLE existing_business AS
SELECT (hall_api.create_council_business('seed','Église','Rapport existant','Rapport à conserver')->>'id')::uuid AS id;
CREATE TEMP TABLE existing_subject AS
SELECT hall_api.create_prepared_council_subject(id,'openQuestion','Question préparée','Texte à conserver') AS subject
FROM existing_business;
SELECT hall_api.associate_council_business_resource(id,
  (hall_api.create_text_resource('seed','Pièce existante','Pièce à conserver')->>'id')::uuid) FROM existing_business;
CREATE TEMP TABLE existing_before AS
SELECT id, (SELECT count(*) FROM council_business) AS businesses, (SELECT count(*) FROM open_question) AS questions,
  (SELECT to_jsonb(report) FROM text_resource report WHERE report.id=workspace.report_resource) AS report,
  (SELECT jsonb_agg(to_jsonb(association) ORDER BY association.position)
    FROM council_business_resource association WHERE association.council_business=id) AS resources
FROM existing_business JOIN council_business_workspace workspace ON workspace.council_business=id;
SELECT throws_ok(
  $$SELECT hall_api.add_open_question(test_uuid('addition:notmet'),'seed','Affaire introuvable','',test_uuid('addition:unknown'))$$,
  'HV905',NULL,'an unknown business is refused'
);
SELECT is((SELECT count(*) FROM council_business),(SELECT businesses FROM existing_before),'invalid target creates no business');
SELECT is((SELECT count(*) FROM open_question),(SELECT questions FROM existing_before),'invalid target creates no question');
SELECT is((SELECT count(*) FROM council_agenda_addition WHERE council_meeting=test_uuid('addition:notmet')),0::bigint,'invalid target creates no occurrence');
CREATE TEMP TABLE attached AS
SELECT hall_api.add_open_question(test_uuid('addition:notmet'),'seed','Question sans quorum','Information',id) AS item
FROM existing_business;
SELECT is((SELECT item->>'councilBusinessId' FROM attached),(SELECT id::text FROM existing_business),'the occurrence uses the chosen business');
SELECT isnt((SELECT item#>>'{subject,id}' FROM attached),(SELECT subject->>'id' FROM existing_subject),'the occurrence uses a newly created question');
SELECT is((SELECT count(*) FROM council_business),(SELECT businesses FROM existing_before),'existing business path creates no business');
SELECT is((SELECT count(*) FROM open_question),(SELECT questions+1 FROM existing_before),'existing business path creates exactly one question');
SELECT is(
  (SELECT to_jsonb(report) FROM text_resource report JOIN council_business_workspace workspace ON workspace.report_resource=report.id
    JOIN existing_business business ON business.id=workspace.council_business),
  (SELECT report FROM existing_before),'the existing report is preserved'
);
SELECT is(
  (SELECT jsonb_agg(to_jsonb(association) ORDER BY association.position)
    FROM council_business_resource association JOIN existing_business business ON business.id=association.council_business),
  (SELECT resources FROM existing_before),'the existing document associations are preserved'
);
SELECT is(
  (SELECT hall_api.open_prepared_council_subject((subject->>'id')::uuid,'openQuestion') FROM existing_subject),
  (SELECT subject FROM existing_subject),'the existing prepared subject is preserved'
);
SELECT is((SELECT count(*)::int FROM council_agenda_addition WHERE council_meeting=test_uuid('addition:notmet')),1,'addition succeeds without quorum');
SELECT start_council_agenda_item((SELECT id FROM council_agenda_item WHERE council_meeting=test_uuid('addition:notmet') AND position>0),clock_timestamp());
SELECT complete_non_voting_agenda_item((SELECT id FROM council_agenda_item WHERE council_meeting=test_uuid('addition:notmet') AND position>0),clock_timestamp());
SELECT close_council_meeting(test_uuid('addition:notmet'),clock_timestamp());
SELECT is((SELECT count(*)::int FROM ballots),0,'neither met nor notMet additions produce a ballot');
SELECT * FROM finish();
ROLLBACK;
