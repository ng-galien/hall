-- Regression matrix for HALL-FR-WSP-220 and HALL-FR-WSP-230.
-- Public/secret results, first votes, empty ballots, attachments and atomic edits.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path=hall,hall_api,public,pg_catalog;
SET LOCAL hall.roles='["administrator"]';
\ir support/helpers.sql
\ir support/quorum.sql
CREATE OR REPLACE FUNCTION test_create_decision_agenda_item(fixture TEXT,meeting_id UUID,item_position INTEGER DEFAULT 1)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE b UUID; p UUID:=test_uuid(fixture||':proposal'); a UUID:=test_uuid(fixture||':agenda-item');
BEGIN
 b:=(hall_api.create_council_business('seed',fixture,'Report','Evidence')->>'id')::uuid;
 INSERT INTO council_decision_proposal(id,council_business) VALUES(p,b);
 INSERT INTO hall.resource_tag(resource_id,value) SELECT text_resource,'initial' FROM hall.council_decision_proposal_workspace WHERE council_decision_proposal=p;
 PERFORM hall_api.create_editor_asset((SELECT text_resource FROM hall.council_decision_proposal_workspace WHERE council_decision_proposal=p),'Image','image.png','image/png',decode('89504e470d0a1a0a','hex'));
 INSERT INTO council_agenda_item(id,council_business,council_meeting,position,council_decision_proposal) VALUES(a,b,meeting_id,item_position,p);
 RETURN a;
END $$;
CREATE TEMP TABLE findings(stage TEXT,operation TEXT,access TEXT,outcome TEXT,detail TEXT);
CREATE FUNCTION pg_temp.probe(stage TEXT,operation TEXT,stmt TEXT,as_api BOOLEAN DEFAULT false)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE code TEXT; detail TEXT;
BEGIN
 BEGIN
  IF as_api THEN SET LOCAL ROLE hall_api_authenticated; END IF;
  EXECUTE stmt;
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE EXCEPTION USING ERRCODE='ZA001',MESSAGE='probe succeeded; rollback the probe';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE,detail=MESSAGE_TEXT;
 END;
 INSERT INTO findings VALUES(stage,operation,CASE WHEN as_api THEN 'application-role' ELSE 'privileged-SQL' END,CASE WHEN code='ZA001' THEN 'ALLOWED' ELSE code END,detail);
END $$;
CREATE FUNCTION pg_temp.audit_subject(label TEXT,stage TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE p UUID:=test_uuid(label||':a:proposal'); w hall.council_decision_proposal_workspace; foreign_w hall.council_decision_proposal_workspace; ver INT;
BEGIN
 SELECT * INTO STRICT w FROM council_decision_proposal_workspace WHERE council_decision_proposal=p;
 SELECT * INTO STRICT foreign_w FROM council_decision_proposal_workspace WHERE council_decision_proposal=test_uuid(label||':b:proposal');
 SELECT version INTO ver FROM text_resource WHERE id=w.text_resource;
 PERFORM pg_temp.probe(stage,'rename plus content API',format('SELECT hall_api.update_text_resource(%L,%s,''Changed'',''{}''::uuid[],%L)',w.text_resource,ver,'renamed-'||p::text),true);
 PERFORM pg_temp.probe(stage,'insert tag SQL',format('INSERT INTO hall.resource_tag(resource_id,value) VALUES(%L,''new-tag'')',w.text_resource));
 PERFORM pg_temp.probe(stage,'update tag SQL',format('UPDATE hall.resource_tag SET value=''changed'' WHERE resource_id=%L',w.text_resource));
 PERFORM pg_temp.probe(stage,'delete tag SQL',format('DELETE FROM hall.resource_tag WHERE resource_id=%L',w.text_resource));

 INSERT INTO findings SELECT stage,'Siren mutation actions','administrator presentation',jsonb_array_length(hall.resource_siren_actions(hall.resource_detail(w.text_resource)))::text,hall.resource_siren_actions(hall.resource_detail(w.text_resource))::text;
 PERFORM pg_temp.probe(stage,'create editor asset API',format('SELECT hall_api.create_editor_asset(%L,''New image'',''new.png'',''image/png'',decode(''89504e470d0a1a0a'',''hex''))',w.text_resource),true);
 PERFORM pg_temp.probe(stage,'update editor asset SQL',format('UPDATE hall.editor_asset SET title=''Changed'' WHERE owner_text_resource_id=%L',w.text_resource));
 PERFORM pg_temp.probe(stage,'delete editor asset SQL',format('DELETE FROM hall.editor_asset WHERE owner_text_resource_id=%L',w.text_resource));
 PERFORM pg_temp.probe(stage,'delete seal SQL',format('DELETE FROM hall.proposal_text_seal WHERE council_decision_proposal=%L',p));

 PERFORM pg_temp.probe(stage,'edit text API',format('SELECT hall_api.update_text_resource(%L,%s,%L,''{}''::uuid[])',w.text_resource,ver,'Changed after state '||stage),true);
 PERFORM pg_temp.probe(stage,'edit text direct',format('UPDATE hall.text_resource SET content=%L WHERE id=%L','Changed',w.text_resource));
 PERFORM pg_temp.probe(stage,'direct write application role',format('UPDATE hall.text_resource SET content=%L WHERE id=%L','Changed',w.text_resource),true);
 PERFORM pg_temp.probe(stage,'move text outside business API',format('SELECT hall_api.relocate_resource(%L,''seed'',%L)',w.text_resource,'moved-'||p::text),true);
 PERFORM pg_temp.probe(stage,'move text outside business SQL',format('UPDATE hall.resource SET path=''seed'',name=%L WHERE id=%L','moved-'||p::text,w.text_resource));
 PERFORM pg_temp.probe(stage,'retarget mapping business',format('UPDATE hall.council_decision_proposal_workspace SET council_business=%L WHERE council_decision_proposal=%L',foreign_w.council_business,p));
 PERFORM pg_temp.probe(stage,'retarget mapping text',format('UPDATE hall.council_decision_proposal_workspace SET text_resource=(SELECT report_resource FROM hall.council_business_workspace WHERE council_business=%L) WHERE council_decision_proposal=%L',foreign_w.council_business,p));
 PERFORM pg_temp.probe(stage,'delete proposal text mapping',format('DELETE FROM hall.council_decision_proposal_workspace WHERE council_decision_proposal=%L',p));
 PERFORM pg_temp.probe(stage,'reassign proposal business',format('UPDATE hall.council_decision_proposal SET council_business=%L WHERE id=%L',foreign_w.council_business,p));
 PERFORM pg_temp.probe(stage,'delete resource envelope',format('DELETE FROM hall.resource WHERE id=%L',w.text_resource));
 PERFORM pg_temp.probe(stage,'delete mapped text row FK',format('DELETE FROM hall.text_resource WHERE id=%L',w.text_resource));
 -- The optional association is not the ownership relation. Create a real association to test its dissociation.

 PERFORM pg_temp.probe(stage,'dissociate optional attachment API',format('SELECT hall_api.dissociate_council_business_resource(%L,%L)',w.council_business,w.text_resource),true);

END $$;
CREATE FUNCTION pg_temp.notice(label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN
 PERFORM hall_api.freeze_council_agenda(test_uuid(label||':meeting'));
 PERFORM hall_api.generate_meeting_notice(test_uuid(label||':meeting'), jsonb_build_object('meeting',hall_api.meeting_notice_facts(test_uuid(label||':meeting')),'hall',jsonb_build_object('name','Audit','timeZone','Europe/Paris')),convert_to('%PDF-audit-fixture','UTF8'));
END $$;
SELECT pg_temp.quorum_case('before',2,2);
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT pg_temp.audit_subject('before','before vote');
DO $$
DECLARE rid UUID; prior JSONB; changed JSONB; code TEXT;
BEGIN
 SELECT text_resource INTO rid FROM hall.council_decision_proposal_workspace WHERE council_decision_proposal=test_uuid('before:a:proposal');
 prior:=hall.resource_detail(rid);
 PERFORM pg_temp.probe('atomic edit','stale version name and content',format('SELECT hall_api.update_text_resource(%L,0,''wrong text'',''{}''::uuid[],''wrong name'')',rid),true);
 INSERT INTO findings VALUES('atomic edit','stale edit leaves resource unchanged','observation',(hall.resource_detail(rid)=prior)::text,'complete resource JSON equality');
 BEGIN
  changed:=hall_api.update_text_resource(rid,1,'new valid content','{}'::uuid[],'new-valid-name');
  IF (SELECT r.name='new-valid-name' AND t.content='new valid content' AND t.version=2 FROM hall.resource r JOIN hall.text_resource t ON t.id=r.text_resource_id WHERE r.id=rid) IS NOT TRUE THEN RAISE EXCEPTION 'atomic update inconsistent'; END IF;
  RAISE EXCEPTION USING ERRCODE='ZA001',MESSAGE='validated before rollback';
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE; END;
 INSERT INTO findings VALUES('atomic edit','valid name content version jointly updated','observation',code,'observed all three changed, then rollback');
END $$;

SELECT pg_temp.notice('before');
SELECT start_council_meeting(test_uuid('before:meeting'),'2026-01-01 09:00Z');
SELECT start_council_agenda_item(test_uuid('before:a:agenda-item'),'2026-01-01 09:01Z');
SELECT create_ballot(test_uuid('before:a:agenda-item'),'public',ARRAY[test_uuid('before:att:1'),test_uuid('before:att:2')],test_uuid('before:att:1'));
SELECT pg_temp.audit_subject('before','ballot created no votes');
INSERT INTO votes(ballot,mode,choice,ballot_participation,count)
SELECT b.id,'public','approve',p.id,1 FROM ballots b JOIN ballot_participation p ON p.ballot=b.id
WHERE b.council_agenda_item=test_uuid('before:a:agenda-item') AND p.meeting_attendance=test_uuid('before:att:1');
SELECT pg_temp.audit_subject('before','first public suffrage');
SELECT pg_temp.quorum_case('early-secret',2,2);
SELECT pg_temp.notice('early-secret');
SELECT start_council_meeting(test_uuid('early-secret:meeting'),'2026-01-01 09:00Z');
SELECT start_council_agenda_item(test_uuid('early-secret:a:agenda-item'),'2026-01-01 09:01Z');
SELECT create_ballot(test_uuid('early-secret:a:agenda-item'),'secret',ARRAY[test_uuid('early-secret:att:1'),test_uuid('early-secret:att:2')],test_uuid('early-secret:att:1'));
SELECT pg_temp.audit_subject('early-secret','secret ballot created no totals');
INSERT INTO votes(ballot,mode,choice,count)
SELECT id,'secret','approve',1 FROM ballots WHERE council_agenda_item=test_uuid('early-secret:a:agenda-item');
SELECT pg_temp.audit_subject('early-secret','first secret aggregate recorded');
DO $$
DECLARE mode TEXT; scenario TEXT; label TEXT; approves INT; candidate JSONB; preview JSONB; actual TEXT;
BEGIN
 FOREACH mode IN ARRAY ARRAY['public','secret'] LOOP
 FOREACH scenario IN ARRAY ARRAY['adopted','rejected','tie','zero-expressed','no-participation'] LOOP
 label:=mode||'-'||scenario;
 PERFORM pg_temp.quorum_case(label,2,2);
 PERFORM pg_temp.notice(label);
 PERFORM start_council_meeting(test_uuid(label||':meeting'),'2026-01-01 09:00Z');
 PERFORM start_council_agenda_item(test_uuid(label||':a:agenda-item'),'2026-01-01 09:01Z');
 approves:=CASE scenario WHEN 'adopted' THEN 2 WHEN 'tie' THEN 1 ELSE 0 END;
 candidate:=pg_temp.public_candidate(label,2,approves);
 IF mode='secret' THEN
  candidate:=(candidate-'votes'-'nonParticipations')||jsonb_build_object('mode','secret','totals',jsonb_build_object('approve',approves,'reject',CASE WHEN scenario IN ('zero-expressed','no-participation') THEN 0 ELSE 2-approves END,'abstain',CASE WHEN scenario='zero-expressed' THEN 2 ELSE 0 END,'blank',0,'invalid',0,'nonParticipation',CASE WHEN scenario='no-participation' THEN 2 ELSE 0 END));
 ELSIF scenario='no-participation' THEN
  candidate:=candidate||jsonb_build_object('votes','[]'::jsonb,'nonParticipations',(SELECT jsonb_agg(jsonb_build_object('meetingAttendanceId',test_uuid(label||':att:'||i),'reason','declined')) FROM generate_series(1,2)i));
 ELSIF scenario='zero-expressed' THEN
  candidate:=jsonb_set(candidate,'{votes}',(SELECT jsonb_agg(v||jsonb_build_object('choice','abstain')) FROM jsonb_array_elements(candidate->'votes') v));
 END IF;
 preview:=hall_api.create_ballot_result_preview(test_uuid(label||':a:agenda-item'),candidate);
 PERFORM hall_api.confirm_ballot_result_preview((preview->>'id')::uuid);
 SELECT result::text INTO actual FROM ballots WHERE council_agenda_item=test_uuid(label||':a:agenda-item');
 INSERT INTO findings VALUES(label,'confirmed result','fixture',actual,'real preview + confirmation; no bypass');
 IF scenario='no-participation' THEN INSERT INTO findings SELECT label,'confirmed without vote rows','fixture',count(*)::text,'no suffrage, sealed by completion' FROM votes WHERE ballot=(SELECT id FROM ballots WHERE council_agenda_item=test_uuid(label||':a:agenda-item')); END IF;
 PERFORM pg_temp.audit_subject(label,label||' completed');
 END LOOP;END LOOP;
END $$;
-- Distinct maintenance robustness check: normal vote deletion is itself forbidden.
SELECT pg_temp.probe('maintenance','normal vote deletion',format('DELETE FROM hall.votes WHERE ballot=(SELECT id FROM hall.ballots WHERE council_agenda_item=%L)',test_uuid('before:a:agenda-item')));
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE hall.votes DISABLE TRIGGER votes_enforce_immutability;
DELETE FROM hall.votes WHERE ballot=(SELECT id FROM hall.ballots WHERE council_agenda_item=test_uuid('before:a:agenda-item'));
ALTER TABLE hall.votes ENABLE TRIGGER votes_enforce_immutability;
INSERT INTO findings SELECT 'maintenance','votes remaining after controlled removal','fixture',count(*)::text,'only pre-existing vote immutability guard bypassed for maintenance simulation' FROM hall.votes WHERE ballot=(SELECT id FROM hall.ballots WHERE council_agenda_item=test_uuid('before:a:agenda-item'));
SELECT pg_temp.probe('maintenance','content after all votes removed',format('SELECT hall_api.update_text_resource(%L,1,''Still locked'',''{}''::uuid[])',(SELECT text_resource FROM hall.council_decision_proposal_workspace WHERE council_decision_proposal=test_uuid('before:a:proposal'))),true);
SET CONSTRAINTS ALL DEFERRED;
-- Targeted pgTAP checks express requested guarantees; failures are audit findings, not hidden.
SELECT no_plan();
SELECT is(outcome,'ALLOWED','before vote: content remains editable') FROM findings WHERE stage='before vote' AND operation='edit text API';
SELECT isnt(outcome,'ALLOWED','permanent linkage before vote: '||operation) FROM findings WHERE stage='before vote' AND operation IN ('move text outside business API','retarget mapping business','retarget mapping text','delete proposal text mapping','delete resource envelope');
SELECT isnt(outcome,'ALLOWED',stage||': source content must be frozen') FROM findings WHERE stage LIKE '% completed' AND operation='edit text API';
SELECT is(outcome,'HV809','actual guard: prepared subject business immutable') FROM findings WHERE stage='before vote' AND operation='reassign proposal business';
SELECT is(outcome,'42501','actual ACL: direct application write denied') FROM findings WHERE stage='before vote' AND operation='direct write application role';
SELECT is(outcome,'HV820','proposal text row deletion guard') FROM findings WHERE stage='before vote' AND operation='delete mapped text row FK';
SELECT is(outcome,'0',stage||': no Siren mutation action after seal') FROM findings WHERE operation='Siren mutation actions' AND (stage LIKE '% completed' OR stage IN ('first public suffrage','first secret aggregate recorded'));
SELECT ok(outcome::int>0,stage||': mutations advertised before voting') FROM findings WHERE operation='Siren mutation actions' AND stage IN ('before vote','ballot created no votes','secret ballot created no totals');
SELECT is(outcome,'HV821',stage||': editor assets frozen: '||operation) FROM findings WHERE operation IN ('create editor asset API','update editor asset SQL','delete editor asset SQL') AND (stage LIKE '% completed' OR stage IN ('first public suffrage','first secret aggregate recorded'));
SELECT is(outcome,'HV822',stage||': seal deletion denied') FROM findings WHERE operation='delete seal SQL' AND (stage LIKE '% completed' OR stage IN ('first public suffrage','first secret aggregate recorded'));
SELECT is(outcome,'HV501','normal vote deletion is prohibited') FROM findings WHERE operation='normal vote deletion';
SELECT is(outcome,'0','maintenance fixture has removed all votes') FROM findings WHERE operation='votes remaining after controlled removal';
SELECT is(outcome,'HV821','content still locked despite controlled vote removal') FROM findings WHERE operation='content after all votes removed';
SELECT is(outcome,'HV821',stage||': tags and rename locked: '||operation) FROM findings WHERE operation IN ('insert tag SQL','update tag SQL','delete tag SQL','rename plus content API') AND (stage LIKE '% completed' OR stage IN ('first public suffrage','first secret aggregate recorded'));
SELECT is(outcome,'ALLOWED',stage||': editable before seal: '||operation) FROM findings WHERE operation IN ('insert tag SQL','update tag SQL','delete tag SQL','rename plus content API') AND stage IN ('before vote','ballot created no votes','secret ballot created no totals');
SELECT is(outcome,'0',stage||': completion without any vote rows') FROM findings WHERE operation='confirmed without vote rows';
SELECT is(outcome,'HV608','stale expected version rejects atomic edit') FROM findings WHERE operation='stale version name and content';
SELECT is(outcome,'true','stale version changes neither name nor content') FROM findings WHERE operation='stale edit leaves resource unchanged';
SELECT is(outcome,'ZA001','valid edit updates name content and version together') FROM findings WHERE operation='valid name content version jointly updated';
SELECT * FROM finish();
ROLLBACK;
