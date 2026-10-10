-- @functional-requirement HALL-FR-DOC-100 RESOURCE_READ_MODEL_IS_STABLE:
-- This is the single derivation of the public resource discriminant. The
-- discriminant is projected from the structural XOR; it is never persisted.
CREATE FUNCTION hall.resource_kind(target hall.resource)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog
AS $function$
  SELECT CASE
    WHEN target.folder_resource_id IS NOT NULL THEN 'folder'
    WHEN target.text_resource_id IS NOT NULL THEN 'text'
    WHEN target.remote_resource_id IS NOT NULL THEN 'remote'
    WHEN target.spreadsheet_resource_id IS NOT NULL THEN 'spreadsheet'
    WHEN target.geographic_resource_id IS NOT NULL THEN 'geographic'
    WHEN target.event_resource_id IS NOT NULL THEN 'event'
    WHEN target.document_resource_id IS NOT NULL THEN 'document'
    WHEN target.legal_reference_resource_id IS NOT NULL THEN 'legalReference'
    WHEN target.geographic_layer_resource_id IS NOT NULL THEN 'geographicLayer'
  END
$function$;

-- @functional-requirement HALL-FR-DOC-180 WORKSPACE_CATALOG_IS_FLAT:
CREATE FUNCTION hall.resource_catalog_entry(target hall.resource)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
    'id', target.id,
    'slug', target.slug,
    'path', target.path,
    'name', target.name,
    'fullPath', target.full_path,
    'kind', hall.resource_kind(target)
  )
$function$;

-- @requirement-reference HALL-FR-DOC-200 RESOURCE_PRESENTATION_IS_AUTHORITATIVE:
-- The view is the sole set-based read model for list presentation. Its joins
-- are evaluated once per batch; neither SQL nor the HTTP edge opens resources
-- one by one. The resource columns are listed explicitly so that a column
-- appended to hall.resource does not change the view's column list.
CREATE VIEW hall.resource_read_model AS
SELECT resource.id,
       resource.path,
       resource.name,
       resource.slug,
       resource.created_at,
       resource.updated_at,
       resource.folder_resource_id,
       resource.text_resource_id,
       resource.remote_resource_id,
       resource.spreadsheet_resource_id,
       resource.event_resource_id,
       resource.geographic_resource_id,
       resource.document_resource_id,
       resource.legal_reference_resource_id,
       resource.full_path,
       resource.is_folder,
       resource.container_path,
       resource.container_is_folder,
       hall.resource_kind(resource) AS kind,
       coalesce(tags.values, '[]'::jsonb) AS tags,
       CASE
         WHEN resource.remote_resource_id IS NOT NULL AND remote_target.remote_resource_id IS NULL THEN 'incomplete'
         WHEN resource.text_resource_id IS NOT NULL AND text_resource.content = '' THEN 'empty'
         WHEN resource.spreadsheet_resource_id IS NOT NULL AND spreadsheet_resource.document = '{}'::jsonb THEN 'empty'
         WHEN resource.legal_reference_resource_id IS NOT NULL
              AND legal_reference_resource.document = '{}'::jsonb THEN 'incomplete'
         ELSE 'ready'
       END AS readiness,
       CASE
         WHEN remote_target.remote_resource_id IS NOT NULL THEN 'unchecked'
         ELSE NULL
       END AS availability,
       coalesce(
         text_resource.autosave_enabled,
         remote_resource.autosave_enabled,
         spreadsheet_resource.autosave_enabled,
         geographic_resource.autosave_enabled,
         event_resource.autosave_enabled
       ) AS autosave_enabled,
       CASE WHEN resource.document_resource_id IS NOT NULL THEN jsonb_build_object(
         'id', binary_object.id,
         'mediaType', binary_object.media_type,
         'byteSize', binary_object.byte_size,
         'contentSha256', binary_object.content_sha256
       ) ELSE NULL END AS binary
FROM hall.resource AS resource
LEFT JOIN hall.text_resource ON text_resource.id = resource.text_resource_id
LEFT JOIN hall.remote_resource ON remote_resource.id = resource.remote_resource_id
LEFT JOIN hall.remote_resource_target AS remote_target
  ON remote_target.remote_resource_id = remote_resource.id
LEFT JOIN hall.spreadsheet_resource ON spreadsheet_resource.id = resource.spreadsheet_resource_id
LEFT JOIN hall.geographic_resource ON geographic_resource.id = resource.geographic_resource_id
LEFT JOIN hall.event_resource ON event_resource.id = resource.event_resource_id
LEFT JOIN hall.legal_reference_resource
  ON legal_reference_resource.id = resource.legal_reference_resource_id
LEFT JOIN hall.document_resource ON document_resource.id = resource.document_resource_id
LEFT JOIN hall.binary_object ON binary_object.id = document_resource.binary_object_id
LEFT JOIN (
  SELECT resource_tag.resource_id,
         jsonb_agg(resource_tag.value ORDER BY resource_tag.value) AS values
  FROM hall.resource_tag
  GROUP BY resource_tag.resource_id
) AS tags ON tags.resource_id = resource.id;

CREATE FUNCTION hall.resource_presentation(target hall.resource_read_model)
RETURNS JSONB
LANGUAGE sql
STABLE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
    'id', target.id,
    'slug', target.slug,
    'path', target.path,
    'name', target.name,
    'fullPath', target.full_path,
    'kind', target.kind,
    'tags', target.tags,
    'state', jsonb_build_object('readiness', target.readiness, 'availability', target.availability),
    'createdAt', target.created_at,
    'updatedAt', target.updated_at
  ) || CASE
    WHEN target.autosave_enabled IS NOT NULL
      THEN jsonb_build_object('autosaveEnabled', target.autosave_enabled)
    ELSE '{}'::jsonb
  END || CASE
    WHEN target.binary IS NOT NULL THEN jsonb_build_object('binary', target.binary)
    ELSE '{}'::jsonb
  END
$function$;

-- @technical-requirement HALL-TR-DOC-040 JSON_PROJECTIONS_ARE_EXPLICIT:
CREATE FUNCTION hall.resource_summary(target hall.resource)
RETURNS JSONB
LANGUAGE sql
STABLE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.resource_presentation(read_model)
  FROM hall.resource_read_model AS read_model
  WHERE read_model.id = target.id
$function$;

CREATE FUNCTION hall.require_resource_by_slug(resource_slug TEXT)
RETURNS hall.resource
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  target hall.resource;
BEGIN
  -- @requirement-reference HALL-FR-DOC-170 RESOURCE_SLUG_IS_STABLE:
  SELECT resource.*
  INTO target
  FROM hall.resource AS resource
  WHERE resource.slug = resource_slug;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV601',
      MESSAGE = 'Resource not found';
  END IF;

  RETURN target;
END
$function$;

CREATE FUNCTION hall.require_resource(resource_id UUID, expected_kind TEXT DEFAULT NULL)
RETURNS hall.resource
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  target hall.resource;
BEGIN
  -- @requirement-reference HALL-FR-DOC-100 RESOURCE_READ_MODEL_IS_STABLE:
  SELECT resource.*
  INTO target
  FROM hall.resource AS resource
  WHERE resource.id = resource_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV601',
      MESSAGE = 'Resource not found';
  END IF;

  -- @requirement-reference HALL-FR-DOC-100 RESOURCE_READ_MODEL_IS_STABLE:
  -- A variant-specific operation cannot reinterpret another resource nature.
  IF expected_kind IS NOT NULL AND hall.resource_kind(target) <> expected_kind THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV609',
      MESSAGE = 'Resource kind does not match the operation';
  END IF;

  RETURN target;
END
$function$;

-- @implements-requirement HALL-FR-DOC-310
-- A box is projected as [west, south, east, north] in WGS84 degrees.
CREATE FUNCTION hall.geographic_extent_bounds(extent BOX)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog
AS $function$
  SELECT jsonb_build_array((extent[1])[0], (extent[1])[1], (extent[0])[0], (extent[0])[1])
$function$;

-- @implements-requirement HALL-FR-DOC-330
CREATE FUNCTION hall.geographic_map_overlays(map_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'layerId', layer_resource.id,
        'slug', layer_resource.slug,
        'name', layer_resource.name,
        'featureCount', layer.feature_count,
        'version', layer.version,
        'position', overlay.position,
        'visible', overlay.visible,
        'opacity', overlay.opacity
      )
      ORDER BY overlay.position
    ),
    '[]'::jsonb
  )
  FROM hall.geographic_map_overlay AS overlay
  JOIN hall.geographic_layer_resource AS layer ON layer.id = overlay.geographic_layer_resource_id
  JOIN hall.resource AS layer_resource ON layer_resource.geographic_layer_resource_id = layer.id
  WHERE overlay.geographic_resource_id = map_id
$function$;

CREATE FUNCTION hall.resource_detail(resource_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  target hall.resource;
  detail JSONB;
BEGIN
  SELECT * INTO target FROM hall.require_resource(resource_id);
  detail := hall.resource_summary(target);

  -- @requirement-reference HALL-FR-DOC-100 RESOURCE_READ_MODEL_IS_STABLE:
  -- Each branch enriches the same summary with only the data owned by its
  -- concrete component. The XOR guarantees exactly one branch.
  IF target.folder_resource_id IS NOT NULL THEN
    RETURN detail;
  ELSIF target.text_resource_id IS NOT NULL THEN
    RETURN detail || (
      SELECT jsonb_build_object('content', text_resource.content, 'version', text_resource.version)
      FROM hall.text_resource
      WHERE text_resource.id = target.text_resource_id
    );
  ELSIF target.remote_resource_id IS NOT NULL THEN
    RETURN detail || (
      SELECT jsonb_build_object(
        'target', CASE
          WHEN remote_target.remote_resource_id IS NULL
            THEN jsonb_build_object('kind', 'unconfigured')
          ELSE jsonb_build_object('kind', 'url', 'url', remote_target.url)
        END,
        'version', remote_resource.version
      )
      FROM hall.remote_resource
      LEFT JOIN hall.remote_resource_target AS remote_target
        ON remote_target.remote_resource_id = remote_resource.id
      WHERE remote_resource.id = target.remote_resource_id
    );
  ELSIF target.spreadsheet_resource_id IS NOT NULL THEN
    RETURN detail || (
      SELECT jsonb_build_object('document', spreadsheet_resource.document, 'version', spreadsheet_resource.version)
      FROM hall.spreadsheet_resource
      WHERE spreadsheet_resource.id = target.spreadsheet_resource_id
    );
  ELSIF target.geographic_resource_id IS NOT NULL THEN
    -- @implements-requirement HALL-FR-DOC-330
    RETURN detail || (
      SELECT jsonb_build_object(
        'document', geographic_resource.document,
        'version', geographic_resource.version,
        'overlays', hall.geographic_map_overlays(geographic_resource.id)
      )
      FROM hall.geographic_resource
      WHERE geographic_resource.id = target.geographic_resource_id
    );
  ELSIF target.geographic_layer_resource_id IS NOT NULL THEN
    -- @implements-requirement HALL-FR-DOC-310
    RETURN detail || (
      SELECT jsonb_build_object(
        'featureCount', layer.feature_count,
        'extent', hall.geographic_extent_bounds(layer.extent),
        'source', layer.source,
        'version', layer.version
      )
      FROM hall.geographic_layer_resource AS layer
      WHERE layer.id = target.geographic_layer_resource_id
    );
  ELSIF target.event_resource_id IS NOT NULL THEN
    RETURN detail || (
      SELECT jsonb_build_object('document', event_resource.document, 'version', event_resource.version)
      FROM hall.event_resource
      WHERE event_resource.id = target.event_resource_id
    );
  ELSIF target.legal_reference_resource_id IS NOT NULL THEN
    RETURN detail || (
      SELECT jsonb_build_object(
        'document', legal_reference_resource.document,
        'version', legal_reference_resource.version
      )
      FROM hall.legal_reference_resource
      WHERE legal_reference_resource.id = target.legal_reference_resource_id
    );
  ELSIF target.document_resource_id IS NOT NULL THEN
    RETURN detail || (
      SELECT jsonb_build_object(
        'binary', jsonb_build_object(
          'id', binary_object.id,
          'mediaType', binary_object.media_type,
          'byteSize', binary_object.byte_size,
          'contentSha256', binary_object.content_sha256
        )
      )
      FROM hall.document_resource
      JOIN hall.binary_object ON binary_object.id = document_resource.binary_object_id
      WHERE document_resource.id = target.document_resource_id
    );
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = 'HV609',
    MESSAGE = 'Resource kind cannot be projected';
END
$function$;

-- @requirement-reference HALL-FR-DOC-230 EDITOR_ASSET_BELONGS_TO_TEXT_CONTENT:
CREATE FUNCTION hall.editor_asset_detail(asset_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
    'id', editor_asset.id,
    'title', editor_asset.title,
    'fileName', editor_asset.file_name,
    'mediaType', binary_object.media_type,
    'byteSize', binary_object.byte_size,
    'contentSha256', binary_object.content_sha256,
    'owner', jsonb_build_object(
      'kind', 'textResourceContent',
      'id', editor_asset.owner_text_resource_id
    ),
    'createdAt', editor_asset.created_at
  )
  FROM hall.editor_asset
  JOIN hall.binary_object ON binary_object.id = editor_asset.binary_object_id
  WHERE editor_asset.id = asset_id
$function$;
