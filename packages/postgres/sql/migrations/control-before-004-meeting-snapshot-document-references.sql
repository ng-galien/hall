-- Read-only control to run before migration 004-meeting-snapshot-document-references.sql.
-- Lists the documents and editor images copied into meeting snapshots whose resource
-- or editor image no longer exists, with the presence of their binary object.
-- Migration 004 removes the copied bytes; such an entry stays readable only when
-- bytes_present is true. Expected result: no row with bytes_present = false.
SELECT snapshot.council_meeting, snapshot.phase, snapshot.captured_at,
       'piece' AS kind,
       entry#>>'{resource,id}' AS id,
       entry#>>'{resource,fullPath}' AS captured_path,
       coalesce(entry#>>'{binary,id}', entry#>>'{resource,binary,id}') AS binary_object,
       EXISTS (SELECT FROM hall.binary_object bytes
               WHERE bytes.id::text = coalesce(entry#>>'{binary,id}', entry#>>'{resource,binary,id}')) AS bytes_present
FROM hall.council_meeting_snapshot snapshot
CROSS JOIN LATERAL jsonb_array_elements(coalesce(snapshot.payload->'documents', '[]'::jsonb)) entry
WHERE jsonb_typeof(entry->'resource') = 'object'
  AND NOT EXISTS (SELECT FROM hall.resource WHERE resource.id::text = entry#>>'{resource,id}')
UNION ALL
SELECT snapshot.council_meeting, snapshot.phase, snapshot.captured_at,
       'editor_image',
       asset->>'id',
       asset->>'title',
       asset->>'binary_object_id',
       EXISTS (SELECT FROM hall.binary_object bytes WHERE bytes.id::text = asset->>'binary_object_id')
FROM hall.council_meeting_snapshot snapshot
CROSS JOIN LATERAL jsonb_array_elements(coalesce(snapshot.payload->'documents', '[]'::jsonb)) entry
CROSS JOIN LATERAL jsonb_array_elements(coalesce(entry->'editorAssets', '[]'::jsonb)) asset
WHERE jsonb_typeof(entry->'resource') = 'object'
  AND NOT EXISTS (SELECT FROM hall.editor_asset WHERE editor_asset.id::text = asset->>'id')
ORDER BY captured_at, council_meeting, phase, kind, id;
