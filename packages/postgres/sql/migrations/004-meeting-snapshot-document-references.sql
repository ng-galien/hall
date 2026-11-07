-- Data reconciliation for HALL-FR-MIN-160 MINUTES_FACTS_ARE_CAPTURED_AT_CLOSURE.
-- Reduce meeting snapshots captured with copied documents to document
-- references: resource identity, binary object identity and, for a non-file
-- resource, its frozen component state. Copied bytes and editor images are
-- removed. A document or an editor image already deleted keeps its captured
-- description. The copied business structure and proposal copies are removed;
-- each agenda point references its business report and its subject text. A
-- snapshot already in reference form is left unchanged.
UPDATE hall.council_meeting_snapshot snapshot
SET payload = (snapshot.payload - 'businesses')
  || jsonb_build_object('documents', (
    SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(entry->'resource') = 'object' THEN
      jsonb_build_object('resource', entry#>'{resource,id}')
      || CASE
        WHEN jsonb_typeof(entry->'binary') = 'object' THEN jsonb_build_object('binaryObject', entry#>'{binary,id}')
        WHEN jsonb_typeof(entry#>'{resource,binary}') = 'object' THEN jsonb_build_object('binaryObject', entry#>'{resource,binary,id}')
        ELSE '{}'::jsonb END
      || CASE
        WHEN jsonb_typeof(entry->'binary') = 'object' OR jsonb_typeof(entry#>'{resource,binary}') = 'object' THEN '{}'::jsonb
        WHEN (entry->'resource') - ARRAY['id','slug','path','name','fullPath','kind','tags','state','createdAt','updatedAt','autosaveEnabled','binary'] = '{}'::jsonb THEN '{}'::jsonb
        ELSE jsonb_build_object('frozen', (entry->'resource')
          - ARRAY['id','slug','path','name','fullPath','kind','tags','state','createdAt','updatedAt','autosaveEnabled','binary']) END
      || CASE WHEN EXISTS (SELECT FROM hall.resource WHERE id = (entry#>>'{resource,id}')::UUID) THEN '{}'::jsonb
        ELSE jsonb_build_object('captured', (entry->'resource') - 'binary') END
      || jsonb_build_object('editorAssets', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('id', asset->'id', 'binaryObject', asset->'binary_object_id')
          || CASE WHEN EXISTS (SELECT FROM hall.editor_asset WHERE id = (asset->>'id')::UUID) THEN '{}'::jsonb
            ELSE jsonb_build_object('title', asset->'title') END ORDER BY asset->>'id'), '[]'::jsonb)
        FROM jsonb_array_elements(coalesce(entry->'editorAssets', '[]'::jsonb)) asset))
      ELSE entry END ORDER BY ordinal), '[]'::jsonb)
    FROM jsonb_array_elements(coalesce(snapshot.payload->'documents', '[]'::jsonb)) WITH ORDINALITY documents(entry, ordinal)))
  || jsonb_build_object('agenda', (
    SELECT coalesce(jsonb_agg(item || jsonb_build_object('report_resource', (
      SELECT business->'report_resource' FROM jsonb_array_elements(coalesce(snapshot.payload->'businesses', '[]'::jsonb)) business
      WHERE business->>'council_business' = item->>'council_business')) ORDER BY ordinal), '[]'::jsonb)
    FROM jsonb_array_elements(coalesce(snapshot.payload->'agenda', '[]'::jsonb)) WITH ORDINALITY agenda(item, ordinal)))
WHERE EXISTS (SELECT FROM jsonb_array_elements(coalesce(snapshot.payload->'documents', '[]'::jsonb)) entry
    WHERE jsonb_typeof(entry->'resource') = 'object')
  OR snapshot.payload ? 'businesses';

-- The proposal text is frozen once, in the document of its subject text.
UPDATE hall.council_meeting_snapshot snapshot
SET payload = (snapshot.payload - 'proposals')
  || jsonb_build_object('agenda', (
    SELECT coalesce(jsonb_agg(item || jsonb_build_object('text_resource', (
      SELECT subject.text_resource FROM hall.council_decision_proposal_workspace subject
      WHERE subject.council_decision_proposal = (item->>'council_decision_proposal')::UUID
      UNION ALL
      SELECT subject.text_resource FROM hall.open_question_workspace subject
      WHERE subject.open_question = (item->>'open_question')::UUID)) ORDER BY ordinal), '[]'::jsonb)
    FROM jsonb_array_elements(coalesce(snapshot.payload->'agenda', '[]'::jsonb)) WITH ORDINALITY agenda(item, ordinal)))
  || jsonb_build_object('documents', coalesce(snapshot.payload->'documents', '[]'::jsonb) || (
    SELECT coalesce(jsonb_agg(jsonb_build_object('resource', subject.text_resource,
      'frozen', jsonb_build_object('content', proposal->'content'), 'editorAssets', '[]'::jsonb) ORDER BY subject.text_resource), '[]'::jsonb)
    FROM jsonb_array_elements(snapshot.payload->'proposals') proposal
    JOIN hall.council_decision_proposal_workspace subject ON subject.council_decision_proposal = (proposal->>'id')::UUID
    WHERE NOT EXISTS (SELECT FROM jsonb_array_elements(coalesce(snapshot.payload->'documents', '[]'::jsonb)) entry
      WHERE entry->>'resource' = subject.text_resource::TEXT)))
WHERE snapshot.payload ? 'proposals';

-- Citations derived from the reduced payloads, recorded once per snapshot.
INSERT INTO hall.council_meeting_snapshot_citation(council_meeting, phase, resource, binary_object)
SELECT snapshot.council_meeting, snapshot.phase, (entry->>'resource')::UUID, (entry->>'binaryObject')::UUID
FROM hall.council_meeting_snapshot snapshot, jsonb_array_elements(coalesce(snapshot.payload->'documents', '[]'::jsonb)) entry
WHERE NOT EXISTS (SELECT FROM hall.council_meeting_snapshot_citation citation
  WHERE citation.council_meeting = snapshot.council_meeting AND citation.phase = snapshot.phase);
INSERT INTO hall.council_meeting_snapshot_citation(council_meeting, phase, editor_asset, binary_object)
SELECT snapshot.council_meeting, snapshot.phase, (asset->>'id')::UUID, (asset->>'binaryObject')::UUID
FROM hall.council_meeting_snapshot snapshot, jsonb_array_elements(coalesce(snapshot.payload->'documents', '[]'::jsonb)) entry,
  jsonb_array_elements(coalesce(entry->'editorAssets', '[]'::jsonb)) asset
WHERE NOT EXISTS (SELECT FROM hall.council_meeting_snapshot_citation citation
  WHERE citation.council_meeting = snapshot.council_meeting AND citation.phase = snapshot.phase AND citation.editor_asset IS NOT NULL);
