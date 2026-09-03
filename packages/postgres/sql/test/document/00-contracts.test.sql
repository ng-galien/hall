BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
SELECT no_plan();

-- HALL-FR-DOC-010 HALL-FR-DOC-030
SELECT set_eq(
  $$
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'hall'
      AND table_name IN (
        'binary_object',
        'folder_resource',
        'text_resource',
        'remote_resource',
        'remote_resource_target',
        'spreadsheet_resource',
        'geographic_resource',
        'document_resource',
        'legal_reference_resource',
        'editor_asset',
        'resource'
      )
  $$,
  $$VALUES
    ('binary_object'),
    ('folder_resource'),
    ('text_resource'),
    ('remote_resource'),
    ('remote_resource_target'),
    ('spreadsheet_resource'),
    ('geographic_resource'),
    ('document_resource'),
    ('legal_reference_resource'),
    ('editor_asset'),
    ('resource')
  $$,
  'documentary core contains one envelope, seven technical variants, editor assets, a remote target and binary storage'
);

SELECT hasnt_table('hall', 'workspace_folder', 'folders are resources rather than a separate tree');
SELECT hasnt_table('hall', 'report_document', 'council report classification is absent');
SELECT hasnt_table('hall', 'meeting_notice_document', 'meeting classification is absent');
SELECT hasnt_table('hall', 'legal_reference_snapshot', 'legal lifecycle is absent from the structural core');

SELECT set_eq(
  $$
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'hall'
      AND table_name = 'resource'
      AND column_name LIKE '%_resource_id'
  $$,
  $$VALUES
    ('folder_resource_id'),
    ('text_resource_id'),
    ('remote_resource_id'),
    ('spreadsheet_resource_id'),
    ('geographic_resource_id'),
    ('document_resource_id'),
    ('legal_reference_resource_id')
  $$,
  'resource exposes exactly the seven technical union references'
);

SELECT hasnt_column('hall', 'resource', 'kind', 'resource nature is derived from the XOR');
SELECT hasnt_column('hall', 'resource', 'folder_id', 'resource carries a path rather than a folder identity');
SELECT has_column('hall', 'resource', 'slug', 'resource has a stable public lookup key');
SELECT col_not_null('hall', 'resource', 'slug', 'every resource has a public slug');
SELECT has_column('hall', 'resource', 'path', 'resource stores its containing path');
SELECT has_column('hall', 'resource', 'name', 'resource stores its local name');
SELECT has_check('hall', 'resource', 'resource XOR and path shapes are declarative checks');
SELECT col_type_is('hall', 'resource', 'id', 'uuid', 'resource identity uses PostgreSQL UUID');

-- HALL-FR-DOC-070
SELECT col_not_null('hall', 'text_resource', 'content', 'text content is structurally required');
SELECT col_not_null('hall', 'spreadsheet_resource', 'document', 'spreadsheet content is structurally required');
SELECT col_not_null('hall', 'geographic_resource', 'document', 'geographic content is structurally required');
SELECT col_not_null('hall', 'legal_reference_resource', 'document', 'legal-reference content is structurally required');

-- HALL-FR-DOC-190
SELECT hasnt_column('hall', 'remote_resource', 'url', 'an unconfigured remote stores no nullable target');
SELECT col_not_null('hall', 'remote_resource_target', 'url', 'a configured remote target always has a URL');
SELECT fk_ok(
  'hall',
  'remote_resource_target',
  'remote_resource_id',
  'hall',
  'remote_resource',
  'id',
  'remote target is structurally owned by its remote resource'
);

-- HALL-FR-DOC-200
SELECT col_not_null('hall', 'resource', 'created_at', 'resource creation time is authoritative');
SELECT col_not_null('hall', 'resource', 'updated_at', 'resource update time is authoritative');
SELECT has_table('hall', 'resource_tag', 'resource tags are normalized rows');
SELECT has_trigger('hall', 'resource', 'resource_touch_updated_at', 'resource mutations refresh updated_at');

-- HALL-FR-DOC-020 HALL-FR-DOC-040 HALL-FR-DOC-050
SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM information_schema.columns
    WHERE table_schema = 'hall'
      AND table_name = 'resource'
      AND column_name IN ('full_path', 'is_folder', 'container_path', 'container_is_folder')
      AND is_generated = 'ALWAYS'
  ),
  4,
  'namespace authority is expressed by generated structural columns'
);

SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM pg_constraint
    WHERE conrelid = 'hall.resource'::regclass
      AND conname = 'resource_container_is_folder'
      AND contype = 'f'
      AND condeferrable
      AND condeferred
  ),
  1,
  'container folder foreign key is deferred to transaction commit'
);

SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM pg_indexes
    WHERE schemaname = 'hall'
      AND tablename = 'resource'
      AND indexname = 'resource_path_prefix_idx'
      AND indexdef LIKE '%text_pattern_ops%'
  ),
  1,
  'resource path has the anchored-prefix operator index'
);

-- HALL-FR-DOC-080
SELECT fk_ok(
  'hall',
  'document_resource',
  'binary_object_id',
  'hall',
  'binary_object',
  'id',
  'documents reference immutable binary objects'
);
SELECT has_trigger('hall', 'binary_object', 'binary_object_reject_change', 'binary immutability authority is installed');
SELECT has_trigger('hall', 'resource', 'resource_reject_nature_change', 'resource nature immutability authority is installed');
SELECT has_trigger('hall', 'resource', 'resource_reject_slug_change', 'resource slug immutability authority is installed');
SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM pg_constraint
    WHERE conrelid = 'hall.resource'::regclass
      AND conname = 'resource_slug_unique'
      AND contype = 'u'
  ),
  1,
  'resource slug is globally unique'
);

-- HALL-FR-DOC-100 HALL-TR-DOC-040 HALL-TR-DOC-060
SELECT set_eq(
  $$
    SELECT routine_name
    FROM information_schema.routines
    WHERE routine_schema = 'hall_api'
      AND routine_name IN (
        'open_resource',
        'open_resource_by_slug',
        'list_resources',
        'search_resources',
        'list_folder',
        'create_folder',
        'create_text_resource',
        'create_remote_resource',
        'create_remote_resource_with_target',
        'create_spreadsheet_resource',
        'create_geographic_resource',
        'create_legal_reference_resource',
        'create_document_resource',
        'create_editor_asset',
        'open_editor_asset',
        'read_editor_asset_content',
        'read_binary_reference_content',
        'rename_resource',
        'move_resource',
        'relocate_resource',
        'update_resource_metadata',
        'update_editable_resource_metadata',
        'update_text_resource',
        'update_remote_resource_target',
        'clear_remote_resource_target',
        'update_spreadsheet_resource',
        'update_geographic_resource',
        'update_legal_reference_resource',
        'resolve_legal_reference_resource',
        'replace_document_content',
        'read_document_content',
        'present_resource',
        'present_resource_collection',
        'present_resource_search',
        'present_editor_asset',
        'delete_resource'
      )
  $$,
  $$VALUES
    ('open_resource'),
    ('open_resource_by_slug'),
    ('list_resources'),
    ('search_resources'),
    ('list_folder'),
    ('create_folder'),
    ('create_text_resource'),
    ('create_remote_resource'),
    ('create_remote_resource_with_target'),
    ('create_spreadsheet_resource'),
    ('create_geographic_resource'),
    ('create_legal_reference_resource'),
    ('create_document_resource'),
    ('create_editor_asset'),
    ('open_editor_asset'),
    ('read_editor_asset_content'),
    ('read_binary_reference_content'),
    ('rename_resource'),
    ('move_resource'),
    ('relocate_resource'),
    ('update_resource_metadata'),
    ('update_editable_resource_metadata'),
    ('update_text_resource'),
    ('update_remote_resource_target'),
    ('clear_remote_resource_target'),
    ('update_spreadsheet_resource'),
    ('update_geographic_resource'),
    ('update_legal_reference_resource'),
    ('resolve_legal_reference_resource'),
    ('replace_document_content'),
    ('read_document_content'),
    ('present_resource'),
    ('present_resource_collection'),
    ('present_resource_search'),
    ('present_editor_asset'),
    ('delete_resource')
  $$,
  'documentary API exposes the named read and mutation surface'
);

SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'hall_api'
      AND procedure.proname IN (
        'open_resource', 'open_resource_by_slug', 'list_resources', 'search_resources',
        'list_folder', 'create_folder', 'create_text_resource',
        'create_remote_resource', 'create_remote_resource_with_target',
        'create_spreadsheet_resource', 'create_geographic_resource',
        'create_legal_reference_resource', 'create_document_resource', 'rename_resource',
        'create_editor_asset', 'open_editor_asset', 'read_editor_asset_content',
        'read_binary_reference_content',
        'move_resource', 'relocate_resource', 'update_resource_metadata',
        'update_editable_resource_metadata', 'update_text_resource',
        'update_remote_resource_target', 'clear_remote_resource_target',
        'update_spreadsheet_resource', 'update_geographic_resource',
        'update_legal_reference_resource', 'replace_document_content',
        'resolve_legal_reference_resource',
        'read_document_content', 'present_resource', 'present_resource_collection',
        'present_resource_search', 'present_editor_asset', 'delete_resource'
      )
      AND has_function_privilege('hall_api_anonymous', procedure.oid, 'EXECUTE')
  ),
  0,
  'anonymous runtime cannot execute the documentary surface'
);

SELECT is(
  (
    SELECT count(*)::INTEGER
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'hall_api'
      AND procedure.proname IN (
        'open_resource', 'open_resource_by_slug', 'list_resources', 'search_resources',
        'list_folder', 'create_folder', 'create_text_resource',
        'create_remote_resource', 'create_remote_resource_with_target',
        'create_spreadsheet_resource', 'create_geographic_resource',
        'create_legal_reference_resource', 'create_document_resource', 'rename_resource',
        'create_editor_asset', 'open_editor_asset', 'read_editor_asset_content',
        'read_binary_reference_content',
        'move_resource', 'relocate_resource', 'update_resource_metadata',
        'update_editable_resource_metadata', 'update_text_resource',
        'update_remote_resource_target', 'clear_remote_resource_target',
        'update_spreadsheet_resource', 'update_geographic_resource',
        'update_legal_reference_resource', 'replace_document_content',
        'resolve_legal_reference_resource',
        'read_document_content', 'present_resource', 'present_resource_collection',
        'present_resource_search', 'present_editor_asset', 'delete_resource'
      )
      AND has_function_privilege('hall_api_authenticated', procedure.oid, 'EXECUTE')
  ),
  36,
  'authenticated runtime can execute every named documentary operation'
);

SELECT * FROM finish();
ROLLBACK;
