-- Data reconciliation for HALL-FR-MIN-160 MINUTES_FACTS_ARE_CAPTURED_AT_CLOSURE.
-- Reduce meeting snapshots captured with copied documents to document
-- references: resource identity, binary object identity and, for a non-file
-- resource, its frozen component state. Copied bytes, editor images and resource
-- names are removed. A snapshot already in reference form is left unchanged.
UPDATE hall.council_meeting_snapshot snapshot
SET payload = snapshot.payload
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
      || jsonb_build_object('editorAssets', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('id', asset->'id', 'binaryObject', asset->'binary_object_id') ORDER BY asset->>'id'), '[]'::jsonb)
        FROM jsonb_array_elements(coalesce(entry->'editorAssets', '[]'::jsonb)) asset))
      ELSE entry END ORDER BY ordinal), '[]'::jsonb)
    FROM jsonb_array_elements(coalesce(snapshot.payload->'documents', '[]'::jsonb)) WITH ORDINALITY documents(entry, ordinal)))
  || jsonb_build_object('businesses', (
    SELECT coalesce(jsonb_agg(business - 'folder' ORDER BY ordinal), '[]'::jsonb)
    FROM jsonb_array_elements(coalesce(snapshot.payload->'businesses', '[]'::jsonb)) WITH ORDINALITY businesses(business, ordinal)))
WHERE EXISTS (SELECT FROM jsonb_array_elements(coalesce(snapshot.payload->'documents', '[]'::jsonb)) entry
    WHERE jsonb_typeof(entry->'resource') = 'object')
  OR EXISTS (SELECT FROM jsonb_array_elements(coalesce(snapshot.payload->'businesses', '[]'::jsonb)) business
    WHERE business ? 'folder');
