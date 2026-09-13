BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
SELECT no_plan();

CREATE TEMP TABLE api_result (
  key TEXT PRIMARY KEY,
  payload JSONB NOT NULL
);

-- HALL-FR-DOC-120: creating one resource ensures its durable folder chain.
INSERT INTO api_result (key, payload)
SELECT 'text', hall_api.create_text_resource('team/2026', 'note.md', 'first');

SELECT is(
  (SELECT payload ->> 'kind' FROM api_result WHERE key = 'text'),
  'text',
  'create returns the stable discriminated resource detail'
);

SELECT is(
  (SELECT payload ->> 'slug' FROM api_result WHERE key = 'text'),
  'note-md',
  'create allocates a normalized public slug'
);

-- HALL-FR-DOC-220: PostgreSQL owns documentary Siren and its minimal RBAC.
SELECT set_config('hall.roles', '["administrator"]', true);

SELECT is(
  hall_api.present_resource((SELECT payload FROM api_result WHERE key = 'text')) #>> '{actions,0,name}',
  'resource.relocate',
  'administrator receives mutation affordances from PostgreSQL Siren'
);

SELECT ok(
  hall_api.present_resource((SELECT payload FROM api_result WHERE key = 'text')) @?
    '$.actions[*] ? (@.name == "resource.update-content")',
  'resource variant determines its content affordance in PostgreSQL'
);

INSERT INTO api_result (key, payload)
SELECT 'event', hall_api.create_event_resource(
  '',
  'Rendez-vous',
  '{"content":"","location":"Salle du conseil","schedule":{"kind":"timed","start":"2026-09-17T17:30:00.000Z","end":"2026-09-17T18:30:00.000Z"},"participants":[]}'::JSONB
);

SELECT ok(
  hall_api.present_resource((SELECT payload FROM api_result WHERE key = 'event')) @?
    '$.actions[*] ? (@.name == "resource.generate-event-invitation")',
  'an event advertises standard calendar invitation generation'
);

SELECT lives_ok(
  format(
    'SELECT hall_api.delete_resource(%L::uuid)',
    (SELECT payload ->> 'id' FROM api_result WHERE key = 'event')
  ),
  'the invitation capability test resource is removed without changing later catalogue expectations'
);
DELETE FROM api_result WHERE key = 'event';

SELECT is(
  hall_api.present_resource_collection(
    hall_api.list_resources(),
    '/api/resources/catalog',
    false,
    false
  ) -> 'properties',
  '{}'::JSONB,
  'documentary Siren collections expose no counter'
);

SELECT set_config('hall.roles', '["reader"]', true);

SELECT ok(
  NOT (hall_api.present_resource((SELECT payload FROM api_result WHERE key = 'text')) ? 'actions'),
  'non-administrator receives no documentary mutation affordance in the minimal database RBAC'
);

SELECT set_config('hall.roles', '["administrator"]', true);

SELECT set_eq(
  $$SELECT full_path FROM hall.resource WHERE is_folder$$,
  $$VALUES ('team'), ('team/2026')$$,
  'missing parent folders are created as durable folder resources'
);

-- HALL-FR-DOC-110: a listing contains direct children, never all descendants.
SELECT is(
  jsonb_array_length(hall_api.list_folder('') -> 'resources'),
  1,
  'root listing contains only its direct child'
);

SELECT is(
  hall_api.list_folder('') #>> '{resources,0,fullPath}',
  'team',
  'root listing exposes the folder summary'
);

SELECT is(
  hall_api.list_folder('team/2026') #>> '{resources,0,name}',
  'note.md',
  'folder listing exposes its direct resource'
);

-- HALL-FR-DOC-180: the workspace catalogue is flat and content-free.
SELECT is(
  jsonb_array_length(hall_api.list_resources()),
  3,
  'workspace catalogue contains folders and resources in one flat list'
);

SELECT ok(
  NOT (hall_api.list_resources() @? '$[*].content'),
  'workspace catalogue does not aggregate editable content'
);

SELECT ok(
  NOT (hall_api.list_resources() @? '$[*].tags'),
  'workspace catalogue does not aggregate presentation metadata'
);

-- HALL-FR-DOC-190: remote resources can exist before a required target row.
INSERT INTO api_result (key, payload)
SELECT 'remote', hall_api.create_remote_resource('', 'portal');

SELECT is(
  (SELECT payload #>> '{target,kind}' FROM api_result WHERE key = 'remote'),
  'unconfigured',
  'remote resource is created without an artificial empty target'
);

INSERT INTO api_result (key, payload)
SELECT 'configured-remote', hall_api.update_remote_resource_target(
  (SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'remote'),
  1,
  'https://example.test'
);

SELECT is(
  (SELECT payload #>> '{target,url}' FROM api_result WHERE key = 'configured-remote'),
  'https://example.test',
  'remote target is configured as its own structural row'
);

INSERT INTO api_result (key, payload)
SELECT 'cleared-remote', hall_api.clear_remote_resource_target(
  (SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'remote'),
  2
);

SELECT is(
  (SELECT payload #>> '{target,kind}' FROM api_result WHERE key = 'cleared-remote'),
  'unconfigured',
  'clearing a remote target restores the structural unconfigured variant'
);

INSERT INTO api_result (key, payload)
SELECT 'legal-draft', hall_api.create_legal_reference_resource(
  '',
  'Draft reference',
  '{"resolutionStatus":"draft","provider":"legifrance","referenceKind":"article","snapshots":[]}'::JSONB
);

SELECT ok(
  hall_api.present_resource((SELECT payload FROM api_result WHERE key = 'legal-draft')) @?
    '$.actions[*] ? (@.name == "resource.resolve-legal-reference")',
  'draft legal reference advertises resolution from PostgreSQL state'
);

SELECT is(
  jsonb_typeof(
    hall_api.present_resource_collection(
      jsonb_build_array(
        (
          SELECT hall.resource_presentation(resource)
          FROM hall.resource_read_model AS resource
          WHERE resource.id = (SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'legal-draft')
        )
      ),
      '/api/resources?path=',
      true,
      false
    ) #> '{entities,0,actions,2}'
  ),
  'object',
  'legal summary collections never emit a null state-dependent action'
);

INSERT INTO api_result (key, payload)
SELECT 'legal-resolved', hall_api.resolve_legal_reference_resource(
  (SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'legal-draft'),
  1,
  'Article L2121-10',
  '{"resolutionStatus":"resolved","provider":"legifrance","referenceKind":"article","snapshotHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","snapshots":[{"snapshotHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]}'::JSONB
);

SELECT is(
  (SELECT payload ->> 'name' FROM api_result WHERE key = 'legal-resolved'),
  'Article L2121-10',
  'legal resolution updates identity presentation and content atomically'
);

SELECT ok(
  hall_api.present_resource((SELECT payload FROM api_result WHERE key = 'legal-resolved')) @?
    '$.actions[*] ? (@.name == "resource.refresh-legal-reference")',
  'resolved legal reference advertises refresh from PostgreSQL state'
);

SELECT lives_ok(
  format(
    'SELECT hall_api.delete_resource(%L::uuid)',
    (SELECT payload ->> 'id' FROM api_result WHERE key = 'legal-resolved')
  ),
  'legal reference fixture is removed before namespace assertions'
);

-- HALL-FR-DOC-210: search is an explicit async projection, not startup hydration.
SELECT is(
  jsonb_array_length(hall_api.search_resources() -> 'items'),
  0,
  'search without criteria returns facets without hydrating all summaries'
);

SELECT is(
  jsonb_array_length(hall_api.search_resources('note') -> 'items'),
  1,
  'search hydrates only matching resource presentations'
);

SELECT is(
  hall_api.search_resources('portal') #>> '{items,0,state,readiness}',
  'incomplete',
  'search returns the authoritative derived presentation state'
);

SELECT ok(
  jsonb_typeof(hall_api.search_resources() #> '{facets,paths}') = 'array'
    AND jsonb_typeof(hall_api.search_resources() #> '{facets,tags}') = 'array',
  'search facets are value lists without counters'
);

SELECT is(
  hall_api.open_resource((SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'text')) ->> 'content',
  'first',
  'open resolves a resource by stable identifier'
);

SELECT is(
  hall_api.open_resource_by_slug('note-md') ->> 'id',
  (SELECT payload ->> 'id' FROM api_result WHERE key = 'text'),
  'open by slug resolves the same stable resource identity'
);

-- HALL-FR-DOC-140: editable updates use optimistic versions.
INSERT INTO api_result (key, payload)
SELECT 'updated', hall_api.update_text_resource(
  (SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'text'),
  1,
  'second',
  ARRAY[]::UUID[]
);

SELECT is(
  (SELECT (payload ->> 'version')::INTEGER FROM api_result WHERE key = 'updated'),
  2,
  'successful editable update increments the version once'
);

SELECT throws_ok(
  format(
    'SELECT hall_api.update_text_resource(%L::uuid, 1, %L, ARRAY[]::uuid[])',
    (SELECT payload ->> 'id' FROM api_result WHERE key = 'text'),
    'stale'
  ),
  'HV608',
  'Resource version conflict',
  'stale editable update is rejected'
);

-- HALL-FR-DOC-230 HALL-FR-DOC-240: private images follow their text owner.
INSERT INTO api_result (key, payload)
SELECT 'asset', hall_api.create_editor_asset(
  (SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'text'),
  'Plan de la salle',
  'plan.png',
  'image/png',
  decode('89504e470d0a1a0a', 'hex')
);

SELECT is(
  (SELECT payload #>> '{owner,kind}' FROM api_result WHERE key = 'asset'),
  'textResourceContent',
  'editor asset is structurally owned by text content outside the resource union'
);

SELECT is(
  (
    SELECT encode(content, 'hex')
    FROM hall_api.read_editor_asset_content(
      (SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'asset')
    )
  ),
  '89504e470d0a1a0a',
  'editor asset bytes use their targeted binary read function'
);

SELECT is(
  (
    SELECT encode(content, 'hex')
    FROM hall_api.read_binary_reference_content(
      (SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'asset')
    )
  ),
  '89504e470d0a1a0a',
  'unified binary reference resolves an editor asset without a client-side fallback'
);

INSERT INTO api_result (key, payload)
SELECT 'asset-referenced', hall_api.update_text_resource(
  (SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'text'),
  2,
  '::image[Plan]{#' || (SELECT payload ->> 'id' FROM api_result WHERE key = 'asset') || ' align="center" width="75"}',
  ARRAY[(SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'asset')]
);

SELECT ok(
  hall_api.open_editor_asset((SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'asset')) IS NOT NULL,
  'referenced editor asset survives its owner autosave'
);

INSERT INTO api_result (key, payload)
SELECT 'other-owner', hall_api.create_text_resource('', 'other.md', '');

INSERT INTO api_result (key, payload)
SELECT 'other-asset', hall_api.create_editor_asset(
  (SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'other-owner'),
  'Other plan',
  'other.png',
  'image/png',
  decode('89504e470d0a1a0a', 'hex')
);

SELECT throws_ok(
  format(
    'SELECT hall_api.update_text_resource(%L::uuid, 3, %L, ARRAY[%L::uuid])',
    (SELECT payload ->> 'id' FROM api_result WHERE key = 'text'),
    'Foreign image',
    (SELECT payload ->> 'id' FROM api_result WHERE key = 'other-asset')
  ),
  'HV612',
  'Editor asset belongs to another text resource',
  'text update rejects an editor asset owned by another resource'
);

SELECT is(
  hall_api.open_resource((SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'text')) ->> 'version',
  '3',
  'cross-owner rejection leaves the text version unchanged'
);

SELECT lives_ok(
  format(
    'SELECT hall_api.delete_resource(%L::uuid)',
    (SELECT payload ->> 'id' FROM api_result WHERE key = 'other-owner')
  ),
  'deleting a text resource cascades its private editor assets'
);

SELECT lives_ok(
  format(
    'SELECT hall_api.update_text_resource(%L::uuid, 3, %L, ARRAY[]::uuid[])',
    (SELECT payload ->> 'id' FROM api_result WHERE key = 'text'),
    'Image removed'
  ),
  'removing the reference updates text and purges the editor asset atomically'
);

SELECT is(
  hall_api.open_editor_asset((SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'asset')),
  NULL,
  'unreferenced editor asset is no longer addressable'
);

-- HALL-FR-DOC-200: presentation metadata is persisted by its named mutation.
INSERT INTO api_result (key, payload)
SELECT 'metadata', hall_api.update_editable_resource_metadata(
  (SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'text'),
  'team/2026',
  'note.md',
  ARRAY['minutes', 'draft', 'minutes'],
  false
);

SELECT is(
  (SELECT payload -> 'tags' FROM api_result WHERE key = 'metadata'),
  '["draft", "minutes"]'::JSONB,
  'metadata update stores normalized unique tags in the authoritative presentation'
);

SELECT is(
  (SELECT (payload ->> 'autosaveEnabled')::BOOLEAN FROM api_result WHERE key = 'metadata'),
  false,
  'editable metadata update persists the autosave preference owned by the resource variant'
);

SELECT throws_ok(
  format(
    'SELECT hall_api.update_editable_resource_metadata(%L::uuid, %L, %L, ARRAY[]::text[], true)',
    (SELECT id::TEXT FROM hall.resource WHERE full_path = 'team'),
    '',
    'team'
  ),
  'HV609',
  'Resource kind does not support autosave',
  'editable metadata mutation rejects a resource variant that does not own autosave'
);

-- HALL-FR-DOC-130: a folder rename moves its complete subtree.
INSERT INTO api_result (key, payload)
SELECT 'renamed', hall_api.relocate_resource(
  (SELECT id FROM hall.resource WHERE full_path = 'team'),
  '',
  'people'
);

SELECT set_eq(
  $$SELECT full_path FROM hall.resource$$,
  $$VALUES ('people'), ('people/2026'), ('people/2026/note.md'), ('portal')$$,
  'folder rename changes the complete prefix and retains the tree'
);

SELECT is(
  hall_api.open_resource((SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'text')) ->> 'fullPath',
  'people/2026/note.md',
  'resource identity survives an ancestor rename'
);

SELECT is(
  hall_api.open_resource((SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'text')) ->> 'slug',
  'note-md',
  'ancestor rename leaves the resource slug unchanged'
);

SELECT throws_ok(
  format(
    'SELECT hall_api.move_resource(%L::uuid, %L)',
    (SELECT id::TEXT FROM hall.resource WHERE full_path = 'people'),
    'people/2026'
  ),
  'HV604',
  'A folder cannot be moved into itself',
  'folder cannot be moved below its own prefix'
);

-- A move targets an existing folder and does not change the local name.
INSERT INTO api_result (key, payload)
SELECT 'archive', hall_api.create_folder('', 'archive');

INSERT INTO api_result (key, payload)
SELECT 'moved', hall_api.move_resource(
  (SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'text'),
  'archive'
);

SELECT is(
  (SELECT payload ->> 'fullPath' FROM api_result WHERE key = 'moved'),
  'archive/note.md',
  'move changes only the containing path'
);

SELECT is(
  jsonb_array_length(hall_api.list_folder('people/2026') -> 'resources'),
  0,
  'source folder remains durable and becomes empty'
);

INSERT INTO api_result (key, payload)
SELECT 'relocated', hall_api.relocate_resource(
  (SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'text'),
  'archive',
  'final.md'
);

SELECT is(
  (SELECT payload ->> 'fullPath' FROM api_result WHERE key = 'relocated'),
  'archive/final.md',
  'one named operation changes path and name atomically'
);

SELECT throws_ok(
  format(
    'SELECT hall_api.delete_resource(%L::uuid)',
    (SELECT payload ->> 'id' FROM api_result WHERE key = 'archive')
  ),
  '23503',
  NULL,
  'non-empty folder cannot be deleted through the API'
);

SELECT lives_ok(
  format(
    'SELECT hall_api.delete_resource(%L::uuid)',
    (SELECT payload ->> 'id' FROM api_result WHERE key = 'text')
  ),
  'resource deletion succeeds after resolving its stable identity'
);

SELECT is(
  (SELECT count(*)::INTEGER FROM hall.text_resource),
  0,
  'resource deletion removes its concrete component'
);

-- HALL-FR-DOC-080 HALL-TR-DOC-040: binary bytes stay outside JSONB.
INSERT INTO api_result (key, payload)
SELECT 'document', hall_api.create_document_resource(
  '',
  'proof.txt',
  'text/plain',
  convert_to('one', 'UTF8')
);

SELECT is(
  (SELECT payload #>> '{binary,mediaType}' FROM api_result WHERE key = 'document'),
  'text/plain',
  'document detail exposes binary metadata'
);

SELECT ok(
  NOT (
    hall_api.present_resource_collection(
      hall_api.list_resources(),
      '/api/resources/catalog',
      false,
      false
    ) @? '$.entities[*].links[*] ? (@.type == null)'
  ),
  'flat catalogue never advertises a document link with a null media type'
);

SELECT is(
  (
    SELECT convert_from(content, 'UTF8')
    FROM hall_api.read_document_content(
      (SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'document')
    )
  ),
  'one',
  'document content uses the separate binary read function'
);

SELECT is(
  (
    SELECT convert_from(content, 'UTF8')
    FROM hall_api.read_binary_reference_content(
      (SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'document')
    )
  ),
  'one',
  'unified binary reference resolves a document resource through the same contract'
);

INSERT INTO api_result (key, payload)
SELECT 'replaced-document', hall_api.replace_document_content(
  (SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'document'),
  'text/plain',
  convert_to('two', 'UTF8')
);

SELECT is(
  (
    SELECT convert_from(content, 'UTF8')
    FROM hall_api.read_document_content(
      (SELECT (payload ->> 'id')::UUID FROM api_result WHERE key = 'document')
    )
  ),
  'two',
  'document replacement atomically points to new immutable bytes'
);

SELECT is(
  (SELECT count(*)::INTEGER FROM hall.binary_object),
  3,
  'document and removed editor-asset bytes remain immutable and content addressed'
);

SELECT throws_ok(
  $$
    SELECT hall_api.create_document_resource(
      '',
      'wrong-type.bin',
      'application/octet-stream',
      convert_to('two', 'UTF8')
    )
  $$,
  'HV610',
  'Binary media type does not match existing content',
  'content-addressed bytes cannot acquire conflicting media metadata'
);

-- HALL-FR-DOC-130 HALL-FR-DOC-210: folder prefixes are literal paths,
-- including characters that have special meaning in a SQL LIKE pattern.
CREATE TEMP TABLE literal_path_case (
  source_path TEXT PRIMARY KEY,
  neighbor_path TEXT NOT NULL,
  renamed_path TEXT NOT NULL
);
INSERT INTO literal_path_case VALUES
  ('literal_under_score', 'literal_underXscore', 'renamed-underscore'),
  ('literal%percent', 'literalXpercent', 'renamed-percent'),
  (E'literal\\backslash', 'literalbackslash', 'renamed-backslash');

SELECT hall_api.create_text_resource(source_path || '/own', 'source.md', '')
FROM literal_path_case;
SELECT hall_api.create_text_resource(neighbor_path || '/neighbor', 'neighbor.md', '')
FROM literal_path_case;

SELECT is(
  jsonb_array_length(hall_api.search_resources('', ARRAY[source_path]) -> 'items'),
  1,
  format('search treats the folder prefix %L literally', source_path)
)
FROM literal_path_case;

SELECT lives_ok(
  format(
    'SELECT hall_api.move_resource(%L::uuid, %L)',
    (SELECT id FROM hall.resource WHERE full_path = source_path),
    neighbor_path || '/neighbor'
  ),
  format('folder %L can move into an unrelated similar path', source_path)
)
FROM literal_path_case;

-- Restore the moved roots by stable identity before testing subtree rename.
SELECT hall_api.relocate_resource(resource.id, '', cases.renamed_path)
FROM literal_path_case AS cases
JOIN hall.resource AS resource ON resource.name = cases.source_path AND resource.is_folder;

SELECT ok(
  EXISTS (SELECT FROM hall.resource WHERE full_path = renamed_path || '/own/source.md'),
  format('rename carries every descendant of literal folder %L', source_path)
)
FROM literal_path_case;

SELECT ok(
  EXISTS (SELECT FROM hall.resource WHERE full_path = neighbor_path || '/neighbor/neighbor.md'),
  format('rename leaves the unrelated folder %L untouched', neighbor_path)
)
FROM literal_path_case;

-- @verifies-requirement HALL-FR-SRC-010
-- @verifies-requirement HALL-FR-SRC-020
INSERT INTO api_result(key,payload) SELECT 'search-exact',hall_api.create_text_resource('seed/search','École','hidden-content-term');
INSERT INTO api_result(key,payload) SELECT 'search-near',hall_api.create_text_resource('seed/search','École nouvelle','');
SELECT is(hall_api.search_resources('ecole',search_kinds=>ARRAY['text'],search_limit=>1)#>>'{items,0,name}','École','HALL-FR-SRC-010 exact normalized title first');
SELECT is((hall_api.search_resources('ecole',search_kinds=>ARRAY['text'],search_limit=>1)->>'total')::integer,2,'HALL-FR-SRC-020 total precedes pagination');
SELECT is(hall_api.search_resources('ecole',search_kinds=>ARRAY['text'],search_offset=>1,search_limit=>1)#>>'{items,0,name}','École nouvelle','HALL-FR-SRC-020 next page has no duplicate');
SELECT is((hall_api.search_resources('hidden-content-term',search_kinds=>ARRAY['text'])->>'total')::integer,0,'HALL-FR-SRC-010 content is not searched');
SELECT is((hall_api.search_resources('seed/search',search_kinds=>ARRAY['text'])->>'total')::integer,0,'HALL-FR-SRC-010 folder is not title text');
SELECT is((hall_api.search_resources('ecole',search_kinds=>ARRAY['geographic'])->>'total')::integer,0,'HALL-FR-SRC-020 types are applied before counting');
SELECT is(hall_api.search_resources('ecole',search_kinds=>ARRAY['text'],search_limit=>1,excluded_ids=>ARRAY[(SELECT(payload->>'id')::uuid FROM api_result WHERE key='search-exact')])#>>'{items,0,name}','École nouvelle','HALL-FR-SRC-020 exclusions precede pagination');
SELECT is((hall_api.search_resources('',search_paths=>ARRAY['seed/search'],search_kinds=>ARRAY['text'])->>'total')::integer,2,'HALL-FR-SRC-020 an empty query with facets searches all admissible resources');
SELECT is((hall_api.search_resources('ecole',search_kinds=>ARRAY['text'],included_ids=>ARRAY[]::uuid[])->>'total')::integer,0,'HALL-FR-SRC-020 empty caller admissibility never broadens the search');

SELECT * FROM finish();
ROLLBACK;
