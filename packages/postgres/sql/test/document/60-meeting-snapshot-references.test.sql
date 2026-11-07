BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
SET LOCAL hall.roles = '["administrator"]';
\ir ../../council/test/support/helpers.sql
SELECT no_plan();

-- @verifies-requirement HALL-FR-MIN-160
-- A meeting snapshot references its documents; it never holds their bytes.
CREATE FUNCTION pg_temp.json_keys(value JSONB) RETURNS SETOF TEXT LANGUAGE sql IMMUTABLE AS $$
  WITH RECURSIVE node(value) AS (
    SELECT value
    UNION ALL
    SELECT child.value FROM node CROSS JOIN LATERAL (
      SELECT entry.value FROM jsonb_each(CASE WHEN jsonb_typeof(node.value) = 'object' THEN node.value ELSE '{}'::jsonb END) entry
      UNION ALL
      SELECT element FROM jsonb_array_elements(CASE WHEN jsonb_typeof(node.value) = 'array' THEN node.value ELSE '[]'::jsonb END) element
    ) child
  )
  SELECT key FROM node, jsonb_object_keys(CASE WHEN jsonb_typeof(node.value) = 'object' THEN node.value ELSE '{}'::jsonb END) key;
$$;

CREATE TEMP TABLE scenario AS
SELECT (provision_initial_council_meeting()).id AS meeting,
  create_council_business_workspace('', 'references', 'report', 'Report with an image') AS business;
INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
SELECT test_uuid('references:attendance'), test_uuid('references:member'), meeting, 'present' FROM scenario;
INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
SELECT test_uuid('references:attendance:3'), test_uuid('references:member:3'), meeting, 'present' FROM scenario;
-- A written proxy given by a second member.
CREATE TEMP TABLE proxy AS SELECT (hall_api.create_document_resource('', 'proxy', 'application/pdf', convert_to('Proxy bytes', 'UTF8'))->>'id')::UUID AS id;
INSERT INTO meeting_attendance (id, council_member, council_meeting, status, proxy_holder, proxy_document)
SELECT test_uuid('references:represented'), test_uuid('references:member:2'), meeting, 'represented', test_uuid('references:attendance'), proxy.id
FROM scenario, proxy;
SELECT set_council_meeting_officers(meeting, test_uuid('references:member'), test_uuid('references:member')) FROM scenario;
SELECT test_confirm_declared_membership(meeting) FROM scenario;
SELECT schedule_council_meeting(meeting, '2026-01-01 09:00Z', 'Chamber') FROM scenario;
CREATE TEMP TABLE items AS SELECT schedule_council_decision_proposal(business, meeting, 1) AS proposal,
  schedule_open_question(business, meeting, 2) AS question FROM scenario;
CREATE TEMP TABLE question_text AS SELECT workspace.text_resource AS id
FROM open_question_workspace workspace JOIN scenario ON workspace.council_business = scenario.business;
UPDATE text_resource SET content = 'Question as examined' FROM question_text WHERE text_resource.id = question_text.id;
CREATE TEMP TABLE pieces AS SELECT
  (hall_api.create_document_resource('', 'attachment', 'application/pdf', convert_to('Original attachment bytes', 'UTF8'))->>'id')::UUID AS attachment,
  (SELECT report_resource FROM council_business_workspace JOIN scenario ON council_business = business) AS report;
SELECT hall_api.associate_council_business_resource(business, attachment) FROM scenario, pieces;
-- A document and an editor image that the rules in force before this change let a user delete after the meeting.
CREATE TEMP TABLE withdrawn AS SELECT (hall_api.create_document_resource('', 'withdrawn', 'application/pdf', convert_to('Withdrawn bytes', 'UTF8'))->>'id')::UUID AS id;
SELECT hall_api.associate_council_business_resource(business, withdrawn.id) FROM scenario, withdrawn;
-- A 20 MB file of incompressible bytes.
CREATE TEMP TABLE large_piece AS SELECT (hall_api.create_document_resource('', 'large attachment', 'application/pdf',
  (SELECT string_agg(sha256(convert_to(i::text, 'UTF8')), ''::bytea ORDER BY i) FROM generate_series(1, 655360) i))->>'id')::UUID AS id;
SELECT hall_api.associate_council_business_resource(business, large_piece.id) FROM scenario, large_piece;
CREATE TEMP TABLE image AS SELECT (hall_api.create_editor_asset(report, 'Plan', 'plan.png', 'image/png', convert_to('Image bytes', 'UTF8'))->>'id')::UUID AS id FROM pieces;
CREATE TEMP TABLE old_image AS SELECT (hall_api.create_editor_asset(report, 'Old plan', 'old-plan.png', 'image/png', convert_to('Old image bytes', 'UTF8'))->>'id')::UUID AS id FROM pieces;
SELECT test_prepare_notice(meeting) FROM scenario;
SELECT start_council_meeting(meeting, '2026-01-01 09:00Z') FROM scenario;
SELECT start_council_agenda_item(proposal, '2026-01-01 09:01Z') FROM items;
CREATE TEMP TABLE recorded_ballot AS SELECT hall.create_ballot(proposal, 'public', ARRAY[test_uuid('references:attendance')], test_uuid('references:attendance')) AS id FROM items;
SELECT record_public_ballot_votes(recorded_ballot.id, ARRAY[participation.id], ARRAY['approve']::vote_choice[])
FROM recorded_ballot JOIN ballot_participation participation ON participation.ballot = recorded_ballot.id;
SELECT test_confirm_ballot(id, '2026-01-01 09:02Z') FROM recorded_ballot;
SELECT close_council_meeting(meeting, '2026-01-01 10:00Z') FROM scenario;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

CREATE TEMP TABLE referenced AS SELECT
  (SELECT binary_object_id FROM document_resource JOIN resource ON resource.document_resource_id = document_resource.id WHERE resource.id = attachment) AS attachment_bytes,
  (SELECT binary_object_id FROM editor_asset WHERE editor_asset.id = image.id) AS image_bytes
FROM pieces, image;

SELECT is((SELECT count(*)::integer FROM council_meeting_snapshot), 2, 'opening and closing snapshots exist');
SELECT ok(NOT EXISTS (SELECT FROM council_meeting_snapshot, pg_temp.json_keys(payload) key WHERE key = 'binary'),
  'no snapshot contains a binary key');
SELECT ok(NOT EXISTS (SELECT FROM council_meeting_snapshot WHERE payload ? 'businesses'),
  'no snapshot copies the business structure');
SELECT is((SELECT payload#>>'{agenda,0,report_resource}' FROM council_meeting_snapshot WHERE phase = 'closing'),
  (SELECT report::text FROM pieces), 'each point references the business report presented with it');
SELECT ok(NOT EXISTS (SELECT FROM council_meeting_snapshot, binary_object bytes, referenced
  WHERE bytes.id IN (referenced.attachment_bytes, referenced.image_bytes)
    AND (strpos(payload::text, encode(bytes.content, 'hex')) > 0 OR strpos(payload::text, encode(bytes.content, 'base64')) > 0)),
  'no snapshot contains the bytes of a file or of an editor image');
SELECT is((SELECT entry FROM council_meeting_snapshot, jsonb_array_elements(payload->'documents') entry, pieces
  WHERE phase = 'closing' AND entry->>'resource' = attachment::text),
  (SELECT jsonb_build_object('resource', attachment, 'binaryObject', attachment_bytes, 'editorAssets', '[]'::jsonb) FROM pieces, referenced),
  'a file is recorded by its resource and binary object identities only');
SELECT is((SELECT entry FROM council_meeting_snapshot, jsonb_array_elements(payload->'documents') entry, pieces
  WHERE phase = 'closing' AND entry->>'resource' = report::text),
  (SELECT jsonb_build_object('resource', report, 'frozen', jsonb_build_object('content', 'Report with an image', 'version', 1),
    'editorAssets', (SELECT jsonb_agg(jsonb_build_object('id', asset.id, 'binaryObject', asset.binary_object_id) ORDER BY asset.id)
      FROM editor_asset asset WHERE asset.id IN (image.id, old_image.id))) FROM pieces, image, old_image),
  'a text keeps its content and references its editor images');

SELECT throws_ok($$UPDATE binary_object SET media_type = 'text/plain' WHERE id = (SELECT attachment_bytes FROM referenced)$$,
  'HV605', NULL, 'a binary object referenced by a snapshot cannot change');
SELECT throws_ok($$DELETE FROM binary_object WHERE id = (SELECT image_bytes FROM referenced)$$,
  'HV605', NULL, 'a binary object referenced by a snapshot cannot be deleted');
SELECT is((SELECT count(*)::integer FROM council_meeting_snapshot_citation, pieces WHERE resource = attachment), 2,
  'each snapshot records its citation of the attachment');
SELECT is((SELECT count(*)::integer FROM council_meeting_snapshot_citation, image WHERE editor_asset = image.id), 2,
  'each snapshot records its citation of the editor image');
SELECT throws_ok($$DELETE FROM council_meeting_snapshot_citation$$, 'HV125', NULL, 'snapshot citations cannot be deleted');
SELECT ok(NOT resource_business_allows_deletion(attachment), 'deletion is not offered for a resource referenced by a snapshot') FROM pieces;
SELECT throws_ok($$DELETE FROM resource WHERE id = (SELECT attachment FROM pieces)$$,
  'HV715', 'a document cited by a council meeting is never deleted', 'a resource referenced by a snapshot cannot be deleted');
SELECT hall_api.dissociate_council_business_resource(business, attachment) FROM scenario, pieces;
SELECT throws_ok($$SELECT hall_api.delete_resource((SELECT attachment FROM pieces))$$,
  'HV715', 'a document cited by a council meeting is never deleted', 'a detached document cited by a meeting is not deleted');
SELECT hall_api.associate_council_business_resource(business, attachment) FROM scenario, pieces;

-- Written proxies and open question texts are cited like the other documents.
SELECT is((SELECT entry FROM council_meeting_snapshot, jsonb_array_elements(payload->'documents') entry, proxy
  WHERE phase = 'closing' AND entry->>'resource' = proxy.id::text),
  (SELECT jsonb_build_object('resource', proxy.id, 'binaryObject', document.binary_object_id, 'editorAssets', '[]'::jsonb)
    FROM proxy JOIN document_resource document ON document.id = proxy.id),
  'a written proxy is cited by its resource and binary object identities');
SELECT is((SELECT resource#>>'{source,kind}' FROM scenario, proxy,
    jsonb_array_elements(meeting_documents(meeting)->'groups') grouped, jsonb_array_elements(grouped->'resources') resource
  WHERE grouped->>'kind' = 'proxies' AND resource->>'id' = proxy.id::text), 'snapshot',
  'the closed meeting presents the written proxy from its snapshot');
SELECT throws_ok($$SELECT hall_api.delete_resource((SELECT id FROM proxy))$$,
  'HV715', NULL, 'a written proxy cited by a meeting is not deleted');
SELECT is((SELECT entry#>>'{frozen,content}' FROM council_meeting_snapshot, jsonb_array_elements(payload->'documents') entry, question_text
  WHERE phase = 'closing' AND entry->>'resource' = question_text.id::text), 'Question as examined',
  'an open question text is frozen like a proposal text');
SELECT is((SELECT payload#>>'{agenda,1,text_resource}' FROM council_meeting_snapshot WHERE phase = 'closing'),
  (SELECT id::text FROM question_text), 'each point references its subject text');
SELECT ok(NOT EXISTS (SELECT FROM council_meeting_snapshot WHERE payload ? 'proposals'), 'the proposal text is frozen only once');

-- Read budget: the list readers never fetch file bytes or more than 1 MB of TOAST.
CREATE FUNCTION pg_temp.toast_blocks_read(statement TEXT) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE before BIGINT; after BIGINT;
BEGIN
  SELECT sum(pg_stat_get_xact_blocks_fetched(class.reltoastrelid)) INTO before FROM pg_class class
  WHERE class.oid IN ('hall.binary_object'::regclass, 'hall.council_meeting_snapshot'::regclass);
  EXECUTE statement;
  SELECT sum(pg_stat_get_xact_blocks_fetched(class.reltoastrelid)) INTO after FROM pg_class class
  WHERE class.oid IN ('hall.binary_object'::regclass, 'hall.council_meeting_snapshot'::regclass);
  RETURN after - before;
END $$;
SELECT cmp_ok((SELECT pg_temp.toast_blocks_read(format('SELECT hall_api.meeting_document_content(%L, %L)', meeting, large_piece.id)) FROM scenario, large_piece),
  '>', 2000::bigint, 'the read budget measure counts the TOAST blocks of a 20 MB file');
SELECT cmp_ok((SELECT pg_temp.toast_blocks_read(format('SELECT hall_api.list_council_agenda(%L)', meeting)) FROM scenario),
  '<', 128::bigint, 'the agenda of a closed meeting reads less than 1 MB of TOAST');
SELECT cmp_ok((SELECT pg_temp.toast_blocks_read(format('SELECT hall_api.meeting_documents(%L)', meeting)) FROM scenario),
  '<', 128::bigint, 'the documents of a closed meeting read less than 1 MB of TOAST');
SELECT cmp_ok((SELECT pg_temp.toast_blocks_read(format('SELECT hall_api.list_council_business_agenda_items(ARRAY[%L]::UUID[])', business)) FROM scenario),
  '<', 128::bigint, 'the agenda history of a business reads less than 1 MB of TOAST');

-- Snapshot captured before this change: documents copied with their bytes.
CREATE TEMP TABLE reduced AS SELECT phase, payload FROM council_meeting_snapshot;
SET LOCAL session_replication_role = replica;
UPDATE council_meeting_snapshot snapshot SET payload = snapshot.payload
  || jsonb_build_object('documents', (SELECT jsonb_agg(jsonb_build_object(
      'resource', resource_detail((entry->>'resource')::UUID) || coalesce(entry->'frozen', '{}'::jsonb),
      'binary', (SELECT to_jsonb(bytes) FROM binary_object bytes WHERE bytes.id = (entry->>'binaryObject')::UUID),
      'editorAssets', (SELECT coalesce(jsonb_agg(to_jsonb(asset) || jsonb_build_object('binary', to_jsonb(bytes)) ORDER BY asset.id), '[]'::jsonb)
        FROM jsonb_array_elements(entry->'editorAssets') recorded JOIN editor_asset asset ON asset.id = (recorded->>'id')::UUID
        JOIN binary_object bytes ON bytes.id = asset.binary_object_id)) ORDER BY entry->>'resource')
    FROM jsonb_array_elements(snapshot.payload->'documents') entry
    WHERE entry->>'resource' NOT IN (SELECT id::text FROM question_text UNION ALL SELECT id::text FROM proxy)))
  || jsonb_build_object('proposals', (SELECT jsonb_agg(jsonb_build_object('id', item->>'council_decision_proposal',
      'content', (SELECT document#>>'{frozen,content}' FROM jsonb_array_elements(snapshot.payload->'documents') document
        WHERE document->>'resource' = item->>'text_resource')))
    FROM jsonb_array_elements(snapshot.payload->'agenda') item WHERE item->>'council_decision_proposal' IS NOT NULL))
  || jsonb_build_object('agenda', (SELECT jsonb_agg(item - 'report_resource' - 'text_resource' ORDER BY ordinal)
    FROM jsonb_array_elements(snapshot.payload->'agenda') WITH ORDINALITY agenda(item, ordinal)))
  || jsonb_build_object('businesses', (SELECT jsonb_agg(to_jsonb(workspace) || jsonb_build_object(
      'folder', resource_detail(workspace.folder_resource),
      'resources', (SELECT coalesce(jsonb_agg(to_jsonb(association) ORDER BY association.position), '[]'::jsonb)
        FROM council_business_resource association WHERE association.council_business = workspace.council_business)))
    FROM council_business_workspace workspace WHERE workspace.council_business IN (
      SELECT (item->>'council_business')::UUID FROM jsonb_array_elements(snapshot.payload->'agenda') item)));
-- The former capture recorded no citation.
CREATE TEMP TABLE citations_before AS SELECT council_meeting, phase, resource, editor_asset, binary_object FROM council_meeting_snapshot_citation
WHERE resource IS DISTINCT FROM (SELECT id FROM question_text) AND resource IS DISTINCT FROM (SELECT id FROM proxy);
DELETE FROM council_meeting_snapshot_citation;
-- Deleted before the migration, as the former rules allowed.
CREATE TEMP TABLE withdrawn_detail AS SELECT resource_detail(id) - 'binary' AS detail FROM withdrawn;
DELETE FROM council_business_resource WHERE resource IN (SELECT id FROM withdrawn);
DELETE FROM resource WHERE id IN (SELECT id FROM withdrawn);
DELETE FROM document_resource WHERE id IN (SELECT id FROM withdrawn);
DELETE FROM editor_asset WHERE id IN (SELECT id FROM old_image);
SET LOCAL session_replication_role = origin;
SELECT ok((SELECT bool_and(strpos(payload::text, encode(convert_to('Original attachment bytes', 'UTF8'), 'hex')) > 0) FROM council_meeting_snapshot),
  'the copied snapshots hold the file bytes before migration');
-- Expected result: the captured form without the documents the former capture did not cite, with the
-- captured description of the deleted document and the title of the deleted image.
CREATE TEMP TABLE migrated AS SELECT phase, jsonb_set(payload, '{documents}', (
    SELECT jsonb_agg(CASE
      WHEN entry->>'resource' = (SELECT id::text FROM withdrawn) THEN entry || jsonb_build_object('captured', (SELECT detail FROM withdrawn_detail))
      WHEN entry->>'resource' = (SELECT report::text FROM pieces) THEN jsonb_set(entry, '{editorAssets}', (
        SELECT jsonb_agg(CASE WHEN asset->>'id' = (SELECT id::text FROM old_image) THEN asset || '{"title": "Old plan"}'::jsonb ELSE asset END ORDER BY ordinal)
        FROM jsonb_array_elements(entry->'editorAssets') WITH ORDINALITY assets(asset, ordinal)))
      ELSE entry END ORDER BY ordinal)
    FROM jsonb_array_elements(payload->'documents') WITH ORDINALITY documents(entry, ordinal)
    WHERE entry->>'resource' NOT IN (SELECT id::text FROM question_text UNION ALL SELECT id::text FROM proxy))) AS payload
FROM reduced;
SET LOCAL session_replication_role = replica;
\ir ../../migrations/004-meeting-snapshot-document-references.sql
SET LOCAL session_replication_role = origin;
SELECT set_eq($$SELECT phase, payload FROM council_meeting_snapshot$$, $$SELECT phase, payload FROM migrated$$,
  'migration reduces copied snapshots to the captured reference form');
SET LOCAL session_replication_role = replica;
\ir ../../migrations/004-meeting-snapshot-document-references.sql
SET LOCAL session_replication_role = origin;
SELECT set_eq($$SELECT phase, payload FROM council_meeting_snapshot$$, $$SELECT phase, payload FROM migrated$$,
  'the migration can run again without changing anything');
SELECT set_eq($$SELECT council_meeting, phase, resource, editor_asset, binary_object FROM council_meeting_snapshot_citation$$,
  $$SELECT council_meeting, phase, resource, editor_asset, binary_object FROM citations_before$$,
  'the migration records the citations of the reduced snapshots once');
SELECT is((SELECT resource->>'title' FROM scenario, withdrawn,
    jsonb_array_elements(meeting_documents(meeting)->'groups') grouped, jsonb_array_elements(grouped->'resources') resource
  WHERE grouped->>'kind' = 'resources' AND resource->>'id' = withdrawn.id::text), 'withdrawn',
  'a document deleted before the migration keeps its captured name');
SELECT is((SELECT decode(meeting_document_content(meeting, withdrawn.id)->>'contentBase64', 'base64') FROM scenario, withdrawn),
  convert_to('Withdrawn bytes', 'UTF8'), 'a document deleted before the migration still serves its referenced bytes');
SELECT is((SELECT decode(meeting_document_content(meeting, report, old_image.id)->>'contentBase64', 'base64') FROM scenario, pieces, old_image),
  convert_to('Old image bytes', 'UTF8'), 'an editor image deleted before the migration still serves its referenced bytes');

-- Reading the closed meeting documents.
SELECT is((SELECT decode(meeting_document_content(meeting, attachment)->>'contentBase64', 'base64') FROM scenario, pieces),
  convert_to('Original attachment bytes', 'UTF8'), 'the closed meeting serves the referenced file bytes');
SELECT hall_api.replace_document_content(attachment, 'application/pdf', convert_to('Replacement bytes', 'UTF8')) FROM pieces;
SELECT is((SELECT decode(meeting_document_content(meeting, attachment)->>'contentBase64', 'base64') FROM scenario, pieces),
  convert_to('Original attachment bytes', 'UTF8'), 'a replaced file still serves the version referenced by the snapshot');
SELECT hall_api.rename_resource(attachment, 'renamed attachment') FROM pieces;
SELECT is((SELECT resource->>'title' FROM scenario, pieces,
    jsonb_array_elements(meeting_documents(meeting)->'groups') grouped, jsonb_array_elements(grouped->'resources') resource
  WHERE grouped->>'kind' = 'resources' AND resource->>'id' = attachment::text), 'renamed attachment',
  'the meeting documents show the current resource name');
SELECT is((SELECT resource->>'mediaType' FROM scenario, pieces,
    jsonb_array_elements(meeting_documents(meeting)->'groups') grouped, jsonb_array_elements(grouped->'resources') resource
  WHERE grouped->>'kind' = 'resources' AND resource->>'id' = attachment::text), 'application/pdf',
  'the meeting documents give the media type of the referenced bytes');
SELECT is((SELECT meeting_document_resource(meeting, attachment) #>> '{resource,binary,id}' FROM scenario, pieces),
  (SELECT attachment_bytes::text FROM referenced), 'the meeting document presents the referenced binary object');

SELECT hall_api.update_text_resource(report, 1, 'Report without image', ARRAY[]::UUID[]) FROM pieces;
SELECT ok(EXISTS (SELECT FROM editor_asset JOIN image USING (id)), 'an editor image referenced by a snapshot is retained when its text drops it');
SELECT is((SELECT meeting_document_resource(meeting, report) #>> '{resource,content}' FROM scenario, pieces), 'Report with an image',
  'the meeting document presents the text recorded at closure');
SELECT is((SELECT meeting_document_resource(meeting, report) -> 'editorAssets' FROM scenario, pieces),
  (SELECT jsonb_agg(entry ORDER BY entry->>'id') FROM (
    SELECT jsonb_build_object('id', id, 'title', 'Plan', 'mediaType', 'image/png') entry FROM image
    UNION ALL SELECT jsonb_build_object('id', id, 'title', 'Old plan', 'mediaType', 'image/png') FROM old_image) assets),
  'the meeting document lists the editor images recorded at closure');
SELECT is((SELECT decode(meeting_document_content(meeting, report, image.id)->>'contentBase64', 'base64') FROM scenario, pieces, image),
  convert_to('Image bytes', 'UTF8'), 'the closed meeting serves the referenced editor image');
SELECT is((SELECT capture_minutes_facts(meeting) #>> '{agenda,0,report}' FROM scenario), 'Report with an image',
  'minutes facts read the report recorded at closure');
SELECT is((SELECT hall_api.open_council_agenda_item(proposal) #>> '{subject,content}' FROM items),
  (SELECT content FROM text_resource JOIN council_decision_proposal_workspace ON text_resource = text_resource.id),
  'the closed agenda item presents the proposal recorded at closure');

SELECT * FROM finish();
ROLLBACK;
