-- Documentary application surface
-- ===============================
-- hall owns invariants and reusable transactional primitives. hall_api owns
-- the named runtime entry points. No runtime role can write the tables.

-- @technical-requirement HALL-TR-DOC-050 NAMESPACE_WRITES_ARE_SERIALIZED:
CREATE FUNCTION hall.lock_resource_namespace()
RETURNS VOID
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog
AS $function$
  SELECT pg_advisory_xact_lock(hashtextextended('hall.resource.namespace', 0))
$function$;

-- @requirement-reference HALL-FR-DOC-200 RESOURCE_PRESENTATION_IS_AUTHORITATIVE:
CREATE FUNCTION hall.touch_resource(resource_id UUID)
RETURNS VOID
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog, hall
AS $function$
  UPDATE hall.resource
  SET updated_at = transaction_timestamp()
  WHERE id = resource_id
$function$;

-- @requirement-reference HALL-FR-DOC-170 RESOURCE_SLUG_IS_STABLE:
-- @technical-requirement HALL-TR-DOC-070 SLUG_ALLOCATION_IS_SERIALIZED:
CREATE FUNCTION hall.claim_resource_slug(resource_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  slug_base TEXT := left(hall.resource_slug_base(resource_name), 200);
  candidate TEXT := slug_base;
  suffix_number INTEGER := 2;
  suffix TEXT;
BEGIN
  PERFORM hall.lock_resource_namespace();

  -- UUID-shaped aliases are excluded so an HTTP edge can distinguish the two
  -- public reference forms without an ambiguous database predicate.
  IF NOT hall.is_valid_resource_slug(candidate) THEN
    suffix := '-2';
    candidate := left(slug_base, 200 - length(suffix)) || suffix;
    suffix_number := 3;
  END IF;

  WHILE EXISTS (SELECT FROM hall.resource AS resource WHERE resource.slug = candidate) LOOP
    suffix := '-' || suffix_number::TEXT;
    candidate := left(slug_base, 200 - length(suffix)) || suffix;
    suffix_number := suffix_number + 1;
  END LOOP;

  RETURN candidate;
END
$function$;

CREATE FUNCTION hall.require_folder_path(folder_path TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  target_is_folder BOOLEAN;
BEGIN
  -- @requirement-reference HALL-FR-DOC-020 RESOURCE_LOCATION_IS_NORMALIZED:
  IF folder_path IS NULL OR NOT hall.is_normalized_resource_path(folder_path) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV607',
      MESSAGE = 'Resource path is not normalized';
  END IF;

  -- @requirement-reference HALL-FR-DOC-050 ROOT_IS_IMPLICIT:
  IF folder_path = '' THEN
    RETURN;
  END IF;

  SELECT resource.is_folder
  INTO target_is_folder
  FROM hall.resource AS resource
  WHERE resource.full_path = folder_path;

  -- @functional-requirement HALL-FR-DOC-110 FOLDER_LISTS_DIRECT_CHILDREN:
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV602',
      MESSAGE = 'Folder not found';
  END IF;

  IF NOT target_is_folder THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV603',
      MESSAGE = 'Resource is not a folder';
  END IF;
END
$function$;

-- @functional-requirement HALL-FR-DOC-120 PARENT_FOLDERS_ARE_ENSURED:
CREATE FUNCTION hall.ensure_folder_path(folder_path TEXT)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  segment TEXT;
  parent_path TEXT := '';
  current_path TEXT;
  target hall.resource;
  folder_id UUID;
BEGIN
  PERFORM hall.lock_resource_namespace();

  IF folder_path IS NULL OR NOT hall.is_normalized_resource_path(folder_path) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV607',
      MESSAGE = 'Resource path is not normalized';
  END IF;

  IF folder_path = '' THEN
    RETURN NULL;
  END IF;

  FOREACH segment IN ARRAY string_to_array(folder_path, '/') LOOP
    IF NOT hall.is_valid_resource_name(segment) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV607',
        MESSAGE = 'Resource path contains an invalid folder name';
    END IF;

    current_path := CASE WHEN parent_path = '' THEN segment ELSE parent_path || '/' || segment END;

    SELECT resource.*
    INTO target
    FROM hall.resource AS resource
    WHERE resource.full_path = current_path;

    IF FOUND THEN
      IF NOT target.is_folder THEN
        RAISE EXCEPTION USING
          ERRCODE = 'HV603',
          MESSAGE = 'Resource is not a folder';
      END IF;
      folder_id := target.id;
    ELSE
      folder_id := gen_random_uuid();
      INSERT INTO hall.folder_resource (id) VALUES (folder_id);
      INSERT INTO hall.resource (id, path, name, slug, folder_resource_id)
      VALUES (folder_id, parent_path, segment, hall.claim_resource_slug(segment), folder_id);
    END IF;

    parent_path := current_path;
  END LOOP;

  RETURN folder_id;
END
$function$;

-- @requirement-reference HALL-FR-DOC-100 RESOURCE_READ_MODEL_IS_STABLE:
CREATE FUNCTION hall_api.open_resource(resource_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.resource_detail(resource_id)
$function$;

-- @requirement-reference HALL-FR-DOC-170 RESOURCE_SLUG_IS_STABLE:
CREATE FUNCTION hall_api.open_resource_by_slug(resource_slug TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.resource_detail(resource.id)
  FROM hall.require_resource_by_slug(resource_slug) AS resource
$function$;

-- @requirement-reference HALL-FR-DOC-180 WORKSPACE_CATALOG_IS_FLAT:
CREATE FUNCTION hall_api.list_resources()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(
    jsonb_agg(hall.resource_catalog_entry(resource) ORDER BY resource.path, resource.name, resource.id),
    '[]'::jsonb
  )
  FROM hall.resource AS resource
$function$;

-- @requirement-reference HALL-FR-DOC-210 RESOURCE_HYDRATION_IS_SCOPED:
CREATE FUNCTION hall_api.search_resources(
  search_query TEXT DEFAULT '',
  search_paths TEXT[] DEFAULT ARRAY[]::TEXT[],
  search_kinds TEXT[] DEFAULT ARRAY[]::TEXT[],
  search_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  search_readiness TEXT[] DEFAULT ARRAY[]::TEXT[],
  search_media TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  normalized_query TEXT;
  has_criteria BOOLEAN;
  items JSONB;
  facets JSONB;
BEGIN
  IF search_query IS NULL OR length(search_query) > 200
     OR search_paths IS NULL OR search_kinds IS NULL OR search_tags IS NULL
     OR search_readiness IS NULL OR search_media IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV607', MESSAGE = 'Resource search criteria are invalid';
  END IF;
  IF EXISTS (SELECT FROM unnest(search_paths) AS path WHERE NOT hall.is_normalized_resource_path(path))
     OR EXISTS (SELECT FROM unnest(search_kinds) AS kind WHERE kind NOT IN (
       'folder', 'text', 'remote', 'spreadsheet', 'geographic', 'document', 'legalReference'
     ))
     OR EXISTS (SELECT FROM unnest(search_readiness) AS readiness WHERE readiness NOT IN (
       'incomplete', 'empty', 'ready'
     ))
     OR EXISTS (SELECT FROM unnest(search_media) AS media WHERE media <> 'image') THEN
    RAISE EXCEPTION USING ERRCODE = 'HV607', MESSAGE = 'Resource search criteria are invalid';
  END IF;

  normalized_query := hall.normalize_resource_search(search_query);
  has_criteria := normalized_query <> ''
    OR cardinality(search_paths) > 0
    OR cardinality(search_kinds) > 0
    OR cardinality(search_tags) > 0
    OR cardinality(search_readiness) > 0
    OR cardinality(search_media) > 0;

  IF has_criteria THEN
    SELECT coalesce(
      jsonb_agg(hall.resource_presentation(read_model) ORDER BY read_model.name, read_model.id),
      '[]'::jsonb
    )
    INTO items
    FROM hall.resource_read_model AS read_model
    WHERE read_model.kind <> 'folder'
      AND (cardinality(search_kinds) = 0 OR read_model.kind = ANY(search_kinds))
      AND (
        cardinality(search_paths) = 0
        OR EXISTS (
          SELECT
          FROM unnest(search_paths) AS selected_path
          WHERE selected_path = ''
             OR read_model.path = selected_path
             OR starts_with(read_model.path, selected_path || '/')
        )
      )
      AND (cardinality(search_tags) = 0 OR read_model.tags ?& search_tags)
      AND (cardinality(search_readiness) = 0 OR read_model.readiness = ANY(search_readiness))
      AND (
        cardinality(search_media) = 0
        OR ('image' = ANY(search_media) AND read_model.binary ->> 'mediaType' LIKE 'image/%')
      )
      AND (
        normalized_query = ''
        OR NOT EXISTS (
          SELECT
          FROM unnest(regexp_split_to_array(normalized_query, ' +')) AS term
          WHERE term <> ''
            AND strpos(
              hall.normalize_resource_search(
                read_model.name || ' ' || read_model.path || ' ' || read_model.tags::TEXT
              ),
              term
            ) = 0
        )
      );
  ELSE
    items := '[]'::jsonb;
  END IF;

  SELECT jsonb_build_object(
    'paths', coalesce(
      (SELECT jsonb_agg(path ORDER BY path) FROM (
        SELECT DISTINCT read_model.path AS path
        FROM hall.resource_read_model AS read_model
        WHERE read_model.kind <> 'folder'
      ) AS available_paths),
      '[]'::jsonb
    ),
    'tags', coalesce(
      (SELECT jsonb_agg(tag ORDER BY tag) FROM (
        SELECT DISTINCT jsonb_array_elements_text(read_model.tags) AS tag
        FROM hall.resource_read_model AS read_model
        WHERE read_model.kind <> 'folder'
      ) AS available_tags),
      '[]'::jsonb
    ),
    'readiness', coalesce(
      (SELECT jsonb_agg(readiness ORDER BY readiness) FROM (
        SELECT DISTINCT read_model.readiness
        FROM hall.resource_read_model AS read_model
        WHERE read_model.kind <> 'folder'
      ) AS available_readiness),
      '[]'::jsonb
    ),
    'media', CASE WHEN EXISTS (
      SELECT
      FROM hall.resource_read_model AS read_model
      WHERE read_model.binary ->> 'mediaType' LIKE 'image/%'
    ) THEN jsonb_build_array('image') ELSE '[]'::jsonb END
  )
  INTO facets;

  RETURN jsonb_build_object('items', items, 'facets', facets);
END
$function$;

-- @requirement-reference HALL-FR-DOC-110 FOLDER_LISTS_DIRECT_CHILDREN:
CREATE FUNCTION hall_api.list_folder(folder_path TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  folder_summary JSONB;
  resources JSONB;
BEGIN
  PERFORM hall.require_folder_path(folder_path);

  IF folder_path <> '' THEN
    SELECT hall.resource_summary(resource)
    INTO folder_summary
    FROM hall.resource AS resource
    WHERE resource.full_path = folder_path;
  END IF;

  SELECT coalesce(
    jsonb_agg(hall.resource_presentation(resource) ORDER BY resource.name, resource.id),
    '[]'::jsonb
  )
  INTO resources
  FROM hall.resource_read_model AS resource
  WHERE resource.path = folder_path;

  RETURN jsonb_build_object(
    'path', folder_path,
    'folder', folder_summary,
    'resources', resources
  );
END
$function$;

-- @requirement-reference HALL-FR-DOC-120 PARENT_FOLDERS_ARE_ENSURED:
CREATE FUNCTION hall_api.create_folder(parent_path TEXT, resource_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  resource_id UUID := gen_random_uuid();
BEGIN
  PERFORM hall.lock_resource_namespace();
  PERFORM hall.ensure_folder_path(parent_path);

  IF resource_name IS NULL OR NOT hall.is_valid_resource_name(resource_name) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV607', MESSAGE = 'Resource name is invalid';
  END IF;

  INSERT INTO hall.folder_resource (id) VALUES (resource_id);
  INSERT INTO hall.resource (id, path, name, slug, folder_resource_id)
  VALUES (resource_id, parent_path, resource_name, hall.claim_resource_slug(resource_name), resource_id);

  RETURN hall.resource_detail(resource_id);
END
$function$;

CREATE FUNCTION hall_api.create_text_resource(parent_path TEXT, resource_name TEXT, resource_content TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  resource_id UUID := gen_random_uuid();
BEGIN
  PERFORM hall.lock_resource_namespace();
  PERFORM hall.ensure_folder_path(parent_path);
  INSERT INTO hall.text_resource (id, content) VALUES (resource_id, resource_content);
  INSERT INTO hall.resource (id, path, name, slug, text_resource_id)
  VALUES (resource_id, parent_path, resource_name, hall.claim_resource_slug(resource_name), resource_id);
  RETURN hall.resource_detail(resource_id);
END
$function$;

-- @requirement-reference HALL-FR-DOC-190 REMOTE_TARGET_IS_STRUCTURAL:
CREATE FUNCTION hall_api.create_remote_resource(parent_path TEXT, resource_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  resource_id UUID := gen_random_uuid();
BEGIN
  PERFORM hall.lock_resource_namespace();
  PERFORM hall.ensure_folder_path(parent_path);
  INSERT INTO hall.remote_resource (id) VALUES (resource_id);
  INSERT INTO hall.resource (id, path, name, slug, remote_resource_id)
  VALUES (resource_id, parent_path, resource_name, hall.claim_resource_slug(resource_name), resource_id);
  RETURN hall.resource_detail(resource_id);
END
$function$;

CREATE FUNCTION hall_api.create_remote_resource_with_target(
  parent_path TEXT,
  resource_name TEXT,
  resource_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  resource JSONB;
  resource_id UUID;
BEGIN
  resource := hall_api.create_remote_resource(parent_path, resource_name);
  resource_id := (resource ->> 'id')::UUID;
  INSERT INTO hall.remote_resource_target (remote_resource_id, url)
  VALUES (resource_id, resource_url);
  RETURN hall.resource_detail(resource_id);
END
$function$;

CREATE FUNCTION hall_api.create_spreadsheet_resource(parent_path TEXT, resource_name TEXT, resource_document JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  resource_id UUID := gen_random_uuid();
BEGIN
  PERFORM hall.lock_resource_namespace();
  PERFORM hall.ensure_folder_path(parent_path);
  INSERT INTO hall.spreadsheet_resource (id, document) VALUES (resource_id, resource_document);
  INSERT INTO hall.resource (id, path, name, slug, spreadsheet_resource_id)
  VALUES (resource_id, parent_path, resource_name, hall.claim_resource_slug(resource_name), resource_id);
  RETURN hall.resource_detail(resource_id);
END
$function$;

CREATE FUNCTION hall_api.create_geographic_resource(parent_path TEXT, resource_name TEXT, resource_document JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  resource_id UUID := gen_random_uuid();
BEGIN
  PERFORM hall.lock_resource_namespace();
  PERFORM hall.ensure_folder_path(parent_path);
  INSERT INTO hall.geographic_resource (id, document) VALUES (resource_id, resource_document);
  INSERT INTO hall.resource (id, path, name, slug, geographic_resource_id)
  VALUES (resource_id, parent_path, resource_name, hall.claim_resource_slug(resource_name), resource_id);
  RETURN hall.resource_detail(resource_id);
END
$function$;

CREATE FUNCTION hall_api.create_legal_reference_resource(
  parent_path TEXT,
  resource_name TEXT,
  resource_document JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  resource_id UUID := gen_random_uuid();
BEGIN
  PERFORM hall.lock_resource_namespace();
  PERFORM hall.ensure_folder_path(parent_path);
  INSERT INTO hall.legal_reference_resource (id, document) VALUES (resource_id, resource_document);
  INSERT INTO hall.resource (id, path, name, slug, legal_reference_resource_id)
  VALUES (resource_id, parent_path, resource_name, hall.claim_resource_slug(resource_name), resource_id);
  RETURN hall.resource_detail(resource_id);
END
$function$;

CREATE FUNCTION hall.store_binary_object(resource_media_type TEXT, resource_content BYTEA)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  binary_id UUID;
  stored_media_type TEXT;
  calculated_sha256 TEXT := encode(sha256(resource_content), 'hex');
BEGIN
  INSERT INTO hall.binary_object (content_sha256, media_type, byte_size, content)
  VALUES (calculated_sha256, resource_media_type, octet_length(resource_content), resource_content)
  ON CONFLICT (content_sha256) DO NOTHING;

  SELECT binary_object.id, binary_object.media_type
  INTO STRICT binary_id, stored_media_type
  FROM hall.binary_object
  WHERE binary_object.content_sha256 = calculated_sha256;

  -- @functional-requirement HALL-FR-DOC-160 BINARY_METADATA_IS_CONSISTENT:
  IF stored_media_type <> resource_media_type THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV610',
      MESSAGE = 'Binary media type does not match existing content';
  END IF;
  RETURN binary_id;
END
$function$;

CREATE FUNCTION hall_api.create_document_resource(
  parent_path TEXT,
  resource_name TEXT,
  resource_media_type TEXT,
  resource_content BYTEA
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  resource_id UUID := gen_random_uuid();
  binary_id UUID;
BEGIN
  PERFORM hall.lock_resource_namespace();
  PERFORM hall.ensure_folder_path(parent_path);
  binary_id := hall.store_binary_object(resource_media_type, resource_content);

  INSERT INTO hall.document_resource (id, binary_object_id) VALUES (resource_id, binary_id);
  INSERT INTO hall.resource (id, path, name, slug, document_resource_id)
  VALUES (resource_id, parent_path, resource_name, hall.claim_resource_slug(resource_name), resource_id);
  RETURN hall.resource_detail(resource_id);
END
$function$;

-- @requirement-reference HALL-FR-DOC-230 EDITOR_ASSET_BELONGS_TO_TEXT_CONTENT:
CREATE FUNCTION hall_api.create_editor_asset(
  owner_resource_id UUID,
  asset_title TEXT,
  asset_file_name TEXT,
  asset_media_type TEXT,
  asset_content BYTEA
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  asset_id UUID := gen_random_uuid();
  binary_id UUID;
BEGIN
  PERFORM hall.require_resource(owner_resource_id, 'text');
  binary_id := hall.store_binary_object(asset_media_type, asset_content);
  INSERT INTO hall.editor_asset (
    id, owner_text_resource_id, binary_object_id, title, file_name
  ) VALUES (
    asset_id, owner_resource_id, binary_id, asset_title, asset_file_name
  );
  RETURN hall.editor_asset_detail(asset_id);
END
$function$;

CREATE FUNCTION hall_api.open_editor_asset(asset_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.editor_asset_detail(asset_id)
$function$;

CREATE FUNCTION hall_api.read_editor_asset_content(asset_id UUID)
RETURNS TABLE (
  content BYTEA,
  media_type TEXT,
  byte_size BIGINT,
  content_sha256 TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT binary_object.content,
         binary_object.media_type,
         binary_object.byte_size,
         binary_object.content_sha256
  FROM hall.editor_asset
  JOIN hall.binary_object ON binary_object.id = editor_asset.binary_object_id
  WHERE editor_asset.id = asset_id
$function$;

-- @functional-requirement HALL-FR-DOC-250 BINARY_REFERENCE_IS_UNIFIED:
CREATE FUNCTION hall_api.read_binary_reference_content(reference_id UUID)
RETURNS TABLE (
  content BYTEA,
  media_type TEXT,
  byte_size BIGINT,
  content_sha256 TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT binary_object.content,
         binary_object.media_type,
         binary_object.byte_size,
         binary_object.content_sha256
  FROM hall.document_resource
  JOIN hall.binary_object ON binary_object.id = document_resource.binary_object_id
  WHERE document_resource.id = reference_id
  UNION ALL
  SELECT binary_object.content,
         binary_object.media_type,
         binary_object.byte_size,
         binary_object.content_sha256
  FROM hall.editor_asset
  JOIN hall.binary_object ON binary_object.id = editor_asset.binary_object_id
  WHERE editor_asset.id = reference_id
$function$;

CREATE FUNCTION hall.relocate_resource(resource_id UUID, destination_path TEXT, destination_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  target hall.resource;
  source_full_path TEXT;
  destination_full_path TEXT;
BEGIN
  PERFORM hall.lock_resource_namespace();
  PERFORM hall.require_folder_path(destination_path);

  IF destination_name IS NULL OR NOT hall.is_valid_resource_name(destination_name) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV607', MESSAGE = 'Resource name is invalid';
  END IF;

  SELECT * INTO target FROM hall.require_resource(resource_id);
  source_full_path := target.full_path;
  destination_full_path := CASE
    WHEN destination_path = '' THEN destination_name
    ELSE destination_path || '/' || destination_name
  END;

  -- @functional-requirement HALL-FR-DOC-130 LOCATION_CHANGE_IS_ATOMIC:
  -- Folder names are literal segments: %, _ and backslash never act as
  -- pattern operators when identifying descendants or unrelated neighbors.
  IF target.is_folder AND (
    destination_path = source_full_path
    OR starts_with(destination_path, source_full_path || '/')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV604',
      MESSAGE = 'A folder cannot be moved into itself';
  END IF;

  IF target.path = destination_path AND target.name = destination_name THEN
    RETURN hall.resource_detail(resource_id);
  END IF;

  SET CONSTRAINTS resource_location_unique, resource_container_is_folder DEFERRED;

  UPDATE hall.resource
  SET path = destination_path,
      name = destination_name
  WHERE id = resource_id;

  IF target.is_folder THEN
    UPDATE hall.resource
    SET path = destination_full_path || substr(path, length(source_full_path) + 1)
    WHERE path = source_full_path
       OR starts_with(path, source_full_path || '/');
  END IF;

  RETURN hall.resource_detail(resource_id);
END
$function$;

CREATE FUNCTION hall_api.rename_resource(resource_id UUID, resource_name TEXT)
RETURNS JSONB
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.relocate_resource(
    resource_id,
    (SELECT resource.path FROM hall.require_resource(resource_id) AS resource),
    resource_name
  )
$function$;

CREATE FUNCTION hall_api.move_resource(resource_id UUID, destination_path TEXT)
RETURNS JSONB
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.relocate_resource(
    resource_id,
    destination_path,
    (SELECT resource.name FROM hall.require_resource(resource_id) AS resource)
  )
$function$;

-- @requirement-reference HALL-FR-DOC-130 LOCATION_CHANGE_IS_ATOMIC:
CREATE FUNCTION hall_api.relocate_resource(resource_id UUID, destination_path TEXT, destination_name TEXT)
RETURNS JSONB
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.relocate_resource(resource_id, destination_path, destination_name)
$function$;

-- @requirement-reference HALL-FR-DOC-200 RESOURCE_PRESENTATION_IS_AUTHORITATIVE:
CREATE FUNCTION hall.replace_resource_tags(resource_id UUID, resource_tags TEXT[])
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  IF resource_tags IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV607', MESSAGE = 'Resource tags are invalid';
  END IF;
  DELETE FROM hall.resource_tag WHERE resource_tag.resource_id = replace_resource_tags.resource_id;
  INSERT INTO hall.resource_tag (resource_id, value)
  SELECT replace_resource_tags.resource_id, tag
  FROM (
    SELECT DISTINCT unnest(resource_tags) AS tag
  ) AS requested_tags;
END
$function$;

CREATE FUNCTION hall_api.update_resource_metadata(
  resource_id UUID,
  destination_path TEXT,
  destination_name TEXT,
  resource_tags TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  PERFORM hall.relocate_resource(resource_id, destination_path, destination_name);
  PERFORM hall.replace_resource_tags(resource_id, resource_tags);
  PERFORM hall.touch_resource(resource_id);
  RETURN hall.resource_detail(resource_id);
END
$function$;

CREATE FUNCTION hall_api.update_editable_resource_metadata(
  resource_id UUID,
  destination_path TEXT,
  destination_name TEXT,
  resource_tags TEXT[],
  autosave_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  target hall.resource;
BEGIN
  SELECT * INTO target FROM hall.require_resource(resource_id);
  IF target.text_resource_id IS NOT NULL THEN
    UPDATE hall.text_resource SET autosave_enabled = update_editable_resource_metadata.autosave_enabled
    WHERE id = target.text_resource_id;
  ELSIF target.remote_resource_id IS NOT NULL THEN
    UPDATE hall.remote_resource SET autosave_enabled = update_editable_resource_metadata.autosave_enabled
    WHERE id = target.remote_resource_id;
  ELSIF target.spreadsheet_resource_id IS NOT NULL THEN
    UPDATE hall.spreadsheet_resource SET autosave_enabled = update_editable_resource_metadata.autosave_enabled
    WHERE id = target.spreadsheet_resource_id;
  ELSIF target.geographic_resource_id IS NOT NULL THEN
    UPDATE hall.geographic_resource SET autosave_enabled = update_editable_resource_metadata.autosave_enabled
    WHERE id = target.geographic_resource_id;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = 'HV609',
      MESSAGE = 'Resource kind does not support autosave';
  END IF;
  RETURN hall_api.update_resource_metadata(resource_id, destination_path, destination_name, resource_tags);
END
$function$;

-- @functional-requirement HALL-FR-DOC-140 EDITABLE_CONTENT_IS_VERSIONED:
CREATE FUNCTION hall_api.update_text_resource(
  resource_id UUID,
  expected_version INTEGER,
  resource_content TEXT,
  referenced_editor_asset_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  PERFORM hall.require_resource(resource_id, 'text');

  -- @functional-requirement HALL-FR-DOC-240 EDITOR_ASSETS_FOLLOW_REFERENCES:
  IF EXISTS (
    SELECT 1
    FROM hall.editor_asset
    WHERE id = ANY(referenced_editor_asset_ids)
      AND owner_text_resource_id <> resource_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV612',
      MESSAGE = 'Editor asset belongs to another text resource';
  END IF;

  UPDATE hall.text_resource
  SET content = resource_content,
      version = version + 1
  WHERE id = resource_id
    AND version = expected_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV608', MESSAGE = 'Resource version conflict';
  END IF;

  DELETE FROM hall.editor_asset
  WHERE owner_text_resource_id = resource_id
    AND NOT (id = ANY(referenced_editor_asset_ids));

  PERFORM hall.touch_resource(resource_id);
  RETURN hall.resource_detail(resource_id);
END
$function$;

CREATE FUNCTION hall_api.update_remote_resource_target(resource_id UUID, expected_version INTEGER, resource_url TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  PERFORM hall.require_resource(resource_id, 'remote');
  INSERT INTO hall.remote_resource_target (remote_resource_id, url)
  VALUES (resource_id, resource_url)
  ON CONFLICT (remote_resource_id) DO UPDATE SET url = EXCLUDED.url;
  UPDATE hall.remote_resource
  SET version = version + 1
  WHERE id = resource_id
    AND version = expected_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV608', MESSAGE = 'Resource version conflict';
  END IF;
  PERFORM hall.touch_resource(resource_id);
  RETURN hall.resource_detail(resource_id);
END
$function$;

CREATE FUNCTION hall_api.clear_remote_resource_target(resource_id UUID, expected_version INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  PERFORM hall.require_resource(resource_id, 'remote');
  UPDATE hall.remote_resource
  SET version = version + 1
  WHERE id = resource_id
    AND version = expected_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV608', MESSAGE = 'Resource version conflict';
  END IF;
  DELETE FROM hall.remote_resource_target WHERE remote_resource_id = resource_id;
  PERFORM hall.touch_resource(resource_id);
  RETURN hall.resource_detail(resource_id);
END
$function$;

CREATE FUNCTION hall_api.update_spreadsheet_resource(
  resource_id UUID,
  expected_version INTEGER,
  resource_document JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  PERFORM hall.require_resource(resource_id, 'spreadsheet');
  UPDATE hall.spreadsheet_resource
  SET document = resource_document,
      version = version + 1
  WHERE id = resource_id
    AND version = expected_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV608', MESSAGE = 'Resource version conflict';
  END IF;
  PERFORM hall.touch_resource(resource_id);
  RETURN hall.resource_detail(resource_id);
END
$function$;

CREATE FUNCTION hall_api.update_geographic_resource(
  resource_id UUID,
  expected_version INTEGER,
  resource_document JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  PERFORM hall.require_resource(resource_id, 'geographic');
  UPDATE hall.geographic_resource
  SET document = resource_document,
      version = version + 1
  WHERE id = resource_id
    AND version = expected_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV608', MESSAGE = 'Resource version conflict';
  END IF;
  PERFORM hall.touch_resource(resource_id);
  RETURN hall.resource_detail(resource_id);
END
$function$;

CREATE FUNCTION hall_api.update_legal_reference_resource(
  resource_id UUID,
  expected_version INTEGER,
  resource_document JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  PERFORM hall.require_resource(resource_id, 'legalReference');
  UPDATE hall.legal_reference_resource
  SET document = resource_document,
      version = version + 1
  WHERE id = resource_id
    AND version = expected_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV608', MESSAGE = 'Resource version conflict';
  END IF;
  PERFORM hall.touch_resource(resource_id);
  RETURN hall.resource_detail(resource_id);
END
$function$;

CREATE FUNCTION hall_api.resolve_legal_reference_resource(
  resource_id UUID,
  expected_version INTEGER,
  resource_name TEXT,
  resource_document JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  target hall.resource;
BEGIN
  SELECT * INTO target FROM hall.require_resource(resource_id, 'legalReference');
  PERFORM hall.relocate_resource(resource_id, target.path, resource_name);
  UPDATE hall.legal_reference_resource
  SET document = resource_document,
      version = version + 1
  WHERE id = resource_id
    AND version = expected_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV608', MESSAGE = 'Resource version conflict';
  END IF;
  PERFORM hall.touch_resource(resource_id);
  RETURN hall.resource_detail(resource_id);
END
$function$;

CREATE FUNCTION hall_api.replace_document_content(resource_id UUID, resource_media_type TEXT, resource_content BYTEA)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  binary_id UUID;
BEGIN
  PERFORM hall.require_resource(resource_id, 'document');
  binary_id := hall.store_binary_object(resource_media_type, resource_content);
  UPDATE hall.document_resource
  SET binary_object_id = binary_id
  WHERE id = resource_id;
  PERFORM hall.touch_resource(resource_id);
  RETURN hall.resource_detail(resource_id);
END
$function$;

-- @requirement-reference HALL-TR-DOC-040 JSON_PROJECTIONS_ARE_EXPLICIT:
CREATE FUNCTION hall_api.read_document_content(resource_id UUID)
RETURNS TABLE (
  content BYTEA,
  media_type TEXT,
  byte_size BIGINT,
  content_sha256 TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  PERFORM hall.require_resource(resource_id, 'document');
  RETURN QUERY
  SELECT binary_object.content,
         binary_object.media_type,
         binary_object.byte_size,
         binary_object.content_sha256
  FROM hall.document_resource
  JOIN hall.binary_object ON binary_object.id = document_resource.binary_object_id
  WHERE document_resource.id = resource_id;
END
$function$;

-- @functional-requirement HALL-FR-DOC-150 RESOURCE_DELETION_IS_COMPLETE:
CREATE FUNCTION hall_api.delete_resource(resource_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  target hall.resource;
  deleted_summary JSONB;
BEGIN
  PERFORM hall.lock_resource_namespace();
  SELECT * INTO target FROM hall.require_resource(resource_id);
  deleted_summary := hall.resource_summary(target);

  DELETE FROM hall.resource WHERE id = resource_id;

  IF target.folder_resource_id IS NOT NULL THEN
    DELETE FROM hall.folder_resource WHERE id = target.folder_resource_id;
  ELSIF target.text_resource_id IS NOT NULL THEN
    DELETE FROM hall.text_resource WHERE id = target.text_resource_id;
  ELSIF target.remote_resource_id IS NOT NULL THEN
    DELETE FROM hall.remote_resource WHERE id = target.remote_resource_id;
  ELSIF target.spreadsheet_resource_id IS NOT NULL THEN
    DELETE FROM hall.spreadsheet_resource WHERE id = target.spreadsheet_resource_id;
  ELSIF target.geographic_resource_id IS NOT NULL THEN
    DELETE FROM hall.geographic_resource WHERE id = target.geographic_resource_id;
  ELSIF target.document_resource_id IS NOT NULL THEN
    DELETE FROM hall.document_resource WHERE id = target.document_resource_id;
  ELSIF target.legal_reference_resource_id IS NOT NULL THEN
    DELETE FROM hall.legal_reference_resource WHERE id = target.legal_reference_resource_id;
  END IF;

  RETURN deleted_summary;
END
$function$;
