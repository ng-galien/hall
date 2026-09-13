-- Regression matrix for HALL-FR-WSP-220 and HALL-FR-WSP-280.
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
-- @verifies-requirement HALL-FR-WSP-280
-- @verifies-requirement HALL-FR-WSP-030
CREATE FUNCTION pg_temp.relocate_proposal_folder(resource_id UUID, ancestor BOOLEAN)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE folder_id UUID; original_resource JSONB; original_text JSONB; original_seal JSONB; original_owner JSONB; expected_path TEXT;
BEGIN
 SELECT business.folder_resource, to_jsonb(workspace) INTO folder_id, original_owner
 FROM hall.council_decision_proposal_workspace workspace
 JOIN hall.council_business_workspace business USING (council_business)
 WHERE workspace.text_resource = resource_id;
 SELECT to_jsonb(r) - ARRAY['path','full_path','container_path','updated_at'] INTO original_resource FROM hall.resource r WHERE id=resource_id;
 SELECT to_jsonb(t) INTO original_text FROM hall.text_resource t WHERE id=resource_id;
 SELECT to_jsonb(s) INTO original_seal FROM hall.proposal_text_seal s WHERE council_decision_proposal=(original_owner->>'council_decision_proposal')::uuid;
 IF ancestor THEN SELECT id INTO folder_id FROM hall.resource WHERE full_path='seed'; END IF;
 SET LOCAL ROLE hall_api_authenticated;
 PERFORM hall_api.relocate_resource(folder_id, '', 'Relocated ' || folder_id::text);
 RESET ROLE;
 SET CONSTRAINTS ALL IMMEDIATE;
 SELECT folder.full_path INTO expected_path FROM hall.council_business_workspace business
 JOIN hall.resource folder ON folder.id=business.folder_resource
 WHERE business.council_business=(original_owner->>'council_business')::uuid;
 IF (SELECT path FROM hall.resource WHERE id=resource_id) <> expected_path
 OR (SELECT to_jsonb(r) - ARRAY['path','full_path','container_path','updated_at'] FROM hall.resource r WHERE id=resource_id) IS DISTINCT FROM original_resource
 OR (SELECT to_jsonb(t) FROM hall.text_resource t WHERE id=resource_id) IS DISTINCT FROM original_text
 OR (SELECT to_jsonb(s) FROM hall.proposal_text_seal s WHERE council_decision_proposal=(original_owner->>'council_decision_proposal')::uuid) IS DISTINCT FROM original_seal
 OR (SELECT to_jsonb(w) FROM hall.council_decision_proposal_workspace w WHERE text_resource=resource_id) IS DISTINCT FROM original_owner THEN
   RAISE EXCEPTION 'Relocation changed the proposal identity, text, envelope, owner or seal';
 END IF;
END $$;

SELECT pg_temp.quorum_case('relocation',2,2);
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT no_plan();
SELECT pg_temp.probe('before vote','move owner',format('SELECT pg_temp.relocate_proposal_folder(%L,false)',text_resource)),
       pg_temp.probe('before vote','move ancestor',format('SELECT pg_temp.relocate_proposal_folder(%L,true)',text_resource))
FROM hall.council_decision_proposal_workspace WHERE council_decision_proposal=test_uuid('relocation:a:proposal');
SELECT test_prepare_notice(test_uuid('relocation:meeting'));
SELECT start_council_meeting(test_uuid('relocation:meeting'),'2026-01-01 09:00Z');
SELECT start_council_agenda_item(test_uuid('relocation:a:agenda-item'),'2026-01-01 09:01Z');
SELECT hall_api.confirm_ballot_result_preview((hall_api.create_ballot_result_preview(
  test_uuid('relocation:a:agenda-item'), pg_temp.public_candidate('relocation',2,2)) ->> 'id')::uuid);
SELECT pg_temp.probe('sealed','move owner',format('SELECT pg_temp.relocate_proposal_folder(%L,false)',text_resource)),
       pg_temp.probe('sealed','move ancestor',format('SELECT pg_temp.relocate_proposal_folder(%L,true)',text_resource)),
       pg_temp.probe('sealed','edit content',format('SELECT hall_api.update_text_resource(%L,1,''Changed'',''{}''::uuid[])',text_resource),true),
       pg_temp.probe('sealed','rename text',format('SELECT hall_api.rename_resource(%L,''Changed'')',text_resource),true),
       pg_temp.probe('sealed','move isolated text',format('SELECT hall_api.relocate_resource(%L,''seed'',''Moved'')',text_resource),true),
       pg_temp.probe('sealed','delete text',format('DELETE FROM hall.resource WHERE id=%L',text_resource)),
       pg_temp.probe('sealed','retag text',format('INSERT INTO hall.resource_tag(resource_id,value) VALUES(%L,''changed'')',text_resource)),
       pg_temp.probe('sealed','delete seal',format('DELETE FROM hall.proposal_text_seal WHERE council_decision_proposal=%L',council_decision_proposal))
FROM hall.council_decision_proposal_workspace WHERE council_decision_proposal=test_uuid('relocation:a:proposal');
SELECT is(outcome,'ALLOWED',stage||': '||operation||' preserves identity, content, owner and seal') FROM findings WHERE operation IN ('move owner','move ancestor');
SELECT is(outcome,'HV821','sealed: '||operation||' remains forbidden') FROM findings WHERE operation IN ('edit content','rename text','retag text');
SELECT is(outcome,'HV820','sealed: '||operation||' remains forbidden') FROM findings WHERE operation IN ('move isolated text','delete text');
SELECT is(outcome,'HV822','seal remains permanent') FROM findings WHERE operation='delete seal';
SELECT * FROM finish();
ROLLBACK;
