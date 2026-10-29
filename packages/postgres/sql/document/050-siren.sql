-- Documentary Siren is a PostgreSQL projection because its affordances depend
-- on the persisted resource variant and on the database authorization context.

-- @implements-requirement HALL-FR-DOC-220
CREATE FUNCTION hall.siren_link(relation TEXT, target_href TEXT, target_type TEXT DEFAULT 'application/vnd.siren+json')
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
  SELECT jsonb_build_object('rel', jsonb_build_array(relation), 'href', target_href, 'type', target_type)
$function$;

CREATE FUNCTION hall.siren_action(
  action_name TEXT,
  action_method TEXT,
  target_href TEXT,
  action_fields JSONB DEFAULT NULL,
  content_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
  SELECT jsonb_build_object('name', action_name, 'method', action_method, 'href', target_href)
    || CASE WHEN action_fields IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('fields', action_fields) END
    || CASE WHEN content_type IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('type', content_type) END
$function$;

CREATE FUNCTION hall.resource_public_reference(resource JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $function$
  SELECT coalesce(resource ->> 'slug', resource ->> 'id')
$function$;

CREATE FUNCTION hall.resource_siren_links(resource JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  reference TEXT := hall.resource_public_reference(resource);
  links JSONB := jsonb_build_array(
    hall.siren_link('self', '/api/resources/' || reference)
  );
  media_type TEXT;
  preview_type TEXT;
BEGIN
  -- @implements-requirement HALL-FR-DOC-180
  -- A catalogue entry intentionally omits binary metadata. Content and preview
  -- links are therefore advertised only by hydrated document projections; a
  -- flat catalogue must never manufacture a Siren link whose media type is
  -- JSON null.
  IF resource ->> 'kind' = 'document'
     AND resource #>> '{binary,mediaType}' IS NOT NULL THEN
    media_type := resource #>> '{binary,mediaType}';
    links := links || jsonb_build_array(
      hall.siren_link('content', '/api/resources/' || reference || '/content', media_type)
    );
    preview_type := CASE split_part(media_type, ';', 1)
      WHEN 'application/pdf' THEN media_type
      WHEN 'image/jpeg' THEN media_type
      WHEN 'image/png' THEN media_type
      WHEN 'text/plain' THEN media_type
      WHEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        THEN 'text/markdown; charset=utf-8'
      ELSE NULL
    END;
    IF preview_type IS NOT NULL THEN
      links := links || jsonb_build_array(
        hall.siren_link('preview', '/api/resources/' || reference || '/preview', preview_type)
      );
    END IF;
  END IF;
  -- @implements-requirement HALL-FR-DOC-310
  -- @implements-requirement HALL-FR-DOC-390
  IF resource ->> 'kind' = 'geographicLayer' THEN
    links := links || jsonb_build_array(
      hall.siren_link('features', '/api/resources/' || reference || '/features', 'application/geo+json'),
      hall.siren_link('feature-notes', '/api/resources/' || reference || '/feature-notes')
    );
  END IF;
  -- @implements-requirement HALL-FR-DOC-400
  -- @implements-requirement HALL-FR-DOC-430
  IF resource ->> 'kind' = 'geographic' THEN
    links := links || jsonb_build_array(
      hall.siren_link('municipal-property', '/api/resources/geographic-layers/municipal-property'),
      hall.siren_link('feature-notes', '/api/resources/' || reference || '/feature-notes')
    );
  END IF;
  RETURN links;
END
$function$;

-- @implements-requirement HALL-FR-DOC-330
-- @implements-requirement HALL-FR-DOC-340
CREATE FUNCTION hall.geographic_layer_import_siren_action(target_path TEXT, map_id TEXT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.siren_action(
    'resource.import-geographic-layer',
    'POST',
    '/api/resources/geographic-layers/import',
    jsonb_build_array(
      jsonb_build_object('name', 'file', 'type', 'file', 'accept', '.geojson,.json,application/geo+json'),
      jsonb_build_object('name', 'name', 'type', 'text'),
      jsonb_build_object('name', 'path', 'type', 'text', 'value', target_path)
    ) || CASE
      WHEN map_id IS NULL THEN '[]'::jsonb
      ELSE jsonb_build_array(jsonb_build_object('name', 'geographicResourceId', 'type', 'hidden', 'value', map_id))
    END,
    'multipart/form-data'
  )
$function$;

-- @implements-requirement HALL-FR-DOC-390
CREATE FUNCTION hall.geographic_feature_note_siren_action(reference TEXT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.siren_action(
    'resource.create-geographic-feature-note',
    'POST',
    '/api/resources/' || reference || '/feature-notes',
    jsonb_build_array(jsonb_build_object('name', 'position', 'type', 'number'))
  )
$function$;

-- @implements-requirement HALL-FR-DOC-430
CREATE FUNCTION hall.geographic_drawn_element_note_siren_action(reference TEXT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.siren_action(
    'resource.create-geographic-feature-note',
    'POST',
    '/api/resources/' || reference || '/feature-notes',
    jsonb_build_array(jsonb_build_object('name', 'elementId', 'type', 'text'))
  )
$function$;

-- @implements-requirement HALL-FR-DOC-330
CREATE FUNCTION hall.geographic_map_overlay_siren_actions(resource JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_array(
    hall.geographic_layer_import_siren_action(resource ->> 'path', resource ->> 'id'),
    hall.siren_action(
      'resource.link-geographic-layer',
      'PUT',
      '/api/resources/' || hall.resource_public_reference(resource) || '/overlays',
      jsonb_build_array(
        jsonb_build_object('name', 'layerId', 'type', 'text'),
        jsonb_build_object('name', 'visible', 'type', 'checkbox'),
        jsonb_build_object('name', 'opacity', 'type', 'number')
      )
    ),
    hall.siren_action(
      'resource.unlink-geographic-layer',
      'POST',
      '/api/resources/' || hall.resource_public_reference(resource) || '/overlays/unlink',
      jsonb_build_array(jsonb_build_object('name', 'layerId', 'type', 'text'))
    )
  )
$function$;

CREATE FUNCTION hall.resource_siren_actions(resource JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  reference TEXT := hall.resource_public_reference(resource);
  actions JSONB := '[]'::jsonb;
  resource_kind TEXT := resource ->> 'kind';
  proposal_text BOOLEAN;
BEGIN
  -- @implements-requirement HALL-FR-DOC-350
  -- @implements-requirement HALL-FR-DOC-550
  -- @implements-requirement HALL-FR-WSP-390
  -- The same location predicate decides the affordances and the accepted writes.
  IF NOT hall.can_write_location(coalesce(
    resource ->> 'fullPath',
    hall.child_full_path(resource ->> 'path', resource ->> 'name')
  )) THEN
    RETURN actions;
  END IF;

  -- @implements-requirement HALL-FR-WSP-280
  IF NOT hall.agenda_subject_text_is_editable((resource ->> 'id')::UUID) THEN
    RETURN actions;
  END IF;

  SELECT EXISTS (SELECT FROM hall.council_decision_proposal_workspace
    WHERE text_resource = (resource ->> 'id')::UUID) INTO proposal_text;
  IF proposal_text AND hall.proposal_text_is_sealed((resource ->> 'id')::UUID) THEN
    RETURN actions;
  END IF;

  actions := actions || jsonb_build_array(
    hall.siren_action(
      'resource.relocate',
      'PATCH',
      '/api/resources/' || reference || '/location',
      jsonb_build_array(
        jsonb_build_object('name', 'path', 'type', 'text', 'value', resource ->> 'path'),
        jsonb_build_object('name', 'name', 'type', 'text', 'value', resource ->> 'name')
      )
    ),
    hall.siren_action('resource.update-metadata', 'PATCH', '/api/resources/' || reference || '/metadata')
  );

  IF resource_kind IN ('text', 'remote', 'spreadsheet', 'geographic', 'event') THEN
    actions := actions || jsonb_build_array(
      hall.siren_action('resource.update-content', 'PUT', '/api/resources/' || reference || '/content')
    );
    IF resource_kind = 'event' THEN
      actions := actions || jsonb_build_array(
        hall.siren_action(
          'resource.generate-event-invitation',
          'POST',
          '/api/resources/' || reference || '/event-invitation',
          jsonb_build_array(jsonb_build_object('name', 'method', 'type', 'text'))
        )
      );
    END IF;
    -- @implements-requirement HALL-FR-DOC-330
    -- @implements-requirement HALL-FR-DOC-340
    IF resource_kind = 'geographic' THEN
      actions := actions || hall.geographic_map_overlay_siren_actions(resource)
        || jsonb_build_array(hall.geographic_drawn_element_note_siren_action(reference));
    END IF;
  ELSIF resource_kind = 'document' THEN
    actions := actions || jsonb_build_array(
      hall.siren_action(
        'resource.replace-document-content',
        'PUT',
        '/api/resources/' || reference || '/binary',
        jsonb_build_array(jsonb_build_object('name', 'file', 'type', 'file')),
        'multipart/form-data'
      )
    );
  ELSIF resource_kind = 'geographicLayer' THEN
    actions := actions || jsonb_build_array(hall.geographic_feature_note_siren_action(reference));
  ELSIF resource_kind = 'legalReference' THEN
    -- @implements-requirement HALL-FR-DOC-220
    -- A folder listing carries a summary without the legal document. It must
    -- never advertise an action as JSON null; detail projections add the
    -- state-dependent legal action once the resolution status is available.
    IF resource #>> '{document,resolutionStatus}' = 'draft' THEN
      actions := actions || jsonb_build_array(
        hall.siren_action(
          'resource.resolve-legal-reference',
          'POST',
          '/api/resources/' || reference || '/legal-reference/resolve'
        )
      );
    ELSIF resource #>> '{document,resolutionStatus}' = 'resolved' THEN
      actions := actions || jsonb_build_array(
        hall.siren_action(
          'resource.refresh-legal-reference',
          'POST',
          '/api/resources/' || reference || '/legal-reference/refresh',
          jsonb_build_array(
            jsonb_build_object(
              'name',
              'expectedSnapshotHash',
              'type',
              'text',
              'value',
              resource #>> '{document,snapshotHash}'
            )
          )
        )
      );
    END IF;
  END IF;

  -- @implements-requirement HALL-FR-WSP-380
  IF NOT hall.allows('personal-workspace.restructure') AND (
    resource ->> 'fullPath' = hall.personal_workspaces_root()
    OR EXISTS (SELECT FROM hall.personal_workspace AS workspace
      WHERE workspace.folder_resource = (resource ->> 'id')::UUID)
  ) THEN
    SELECT coalesce(jsonb_agg(action), '[]'::jsonb) INTO actions
    FROM jsonb_array_elements(actions) action WHERE action ->> 'name' <> 'resource.relocate';
    RETURN actions;
  END IF;

  IF proposal_text THEN
    SELECT coalesce(jsonb_agg(action), '[]'::jsonb) INTO actions
    FROM jsonb_array_elements(actions) action WHERE action ->> 'name' <> 'resource.relocate';
    RETURN actions;
  END IF;
  -- Availability mirrors existing restrictive references. DELETE still rechecks
  -- all constraints atomically, including links created after this projection.
  IF NOT hall.resource_business_allows_deletion((resource_siren_actions.resource ->> 'id')::UUID)
    -- @implements-requirement HALL-FR-WSP-440
    OR EXISTS (SELECT FROM hall.council_business_workspace workspace
      WHERE workspace.report_resource = (resource_siren_actions.resource ->> 'id')::UUID)
    -- @implements-requirement HALL-FR-WSP-450
    OR EXISTS (SELECT FROM hall.council_business_workspace workspace
      JOIN hall.resource folder ON folder.folder_resource_id = workspace.folder_resource
      WHERE folder.id = (resource_siren_actions.resource ->> 'id')::UUID)
    OR EXISTS (SELECT FROM hall.resource target
      JOIN hall.meeting_attendance attendance ON attendance.proxy_document = target.document_resource_id
      WHERE target.id = (resource_siren_actions.resource ->> 'id')::UUID)
    OR EXISTS (SELECT FROM hall.resource target
      JOIN hall.meeting_attendance_event attendance ON attendance.proxy_document = target.document_resource_id
      WHERE target.id = (resource_siren_actions.resource ->> 'id')::UUID)
    -- @implements-requirement HALL-FR-DOC-330
    OR EXISTS (SELECT FROM hall.geographic_map_overlay overlay
      WHERE overlay.geographic_layer_resource_id = (resource_siren_actions.resource ->> 'id')::UUID)
  THEN
    RETURN actions;
  END IF;
  IF NOT hall.can_delete_location(coalesce(
    resource ->> 'fullPath',
    hall.child_full_path(resource ->> 'path', resource ->> 'name')
  )) THEN
    RETURN actions;
  END IF;
  RETURN actions || jsonb_build_array(
    hall.siren_action('resource.delete', 'DELETE', '/api/resources/' || reference)
  );
END
$function$;

CREATE FUNCTION hall.resource_siren_entity(resource JSONB, include_actions BOOLEAN DEFAULT true)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  -- @implements-requirement HALL-FR-WSP-420
  -- A resource of a personal folder carries the personal-workspace class: an
  -- affair picker presents it as to be taken over before its association.
  SELECT jsonb_build_object(
      'class', jsonb_build_array('resource') || CASE
        WHEN hall.is_personal_workspace_location(coalesce(
          resource ->> 'fullPath',
          hall.child_full_path(resource ->> 'path', resource ->> 'name')
        )) THEN jsonb_build_array('personal-workspace')
        ELSE '[]'::jsonb
      END,
      'properties', resource,
      'links', hall.resource_siren_links(resource)
    )
    || CASE
      WHEN include_actions AND jsonb_array_length(hall.resource_siren_actions(resource)) > 0
        THEN jsonb_build_object('actions', hall.resource_siren_actions(resource))
      ELSE '{}'::jsonb
    END
$function$;

CREATE FUNCTION hall.resource_siren_item(resource JSONB, include_actions BOOLEAN DEFAULT true)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.resource_siren_entity(resource, include_actions)
    || jsonb_build_object('rel', jsonb_build_array('item'))
$function$;

CREATE FUNCTION hall.editor_asset_siren_action()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.siren_action(
    'resource.create-editor-asset',
    'POST',
    '/api/resources/editor-assets',
    jsonb_build_array(
      jsonb_build_object('name', 'file', 'type', 'file'),
      jsonb_build_object('name', 'ownerKind', 'type', 'text', 'value', 'textResourceContent'),
      jsonb_build_object('name', 'ownerId', 'type', 'text'),
      jsonb_build_object('name', 'title', 'type', 'text')
    ),
    'multipart/form-data'
  )
$function$;

-- @implements-requirement HALL-FR-DOC-550
-- @implements-requirement HALL-FR-WSP-390
-- Creation affordances belong to the listed folder: they follow the same
-- location predicate as the accepted creations in that folder.
CREATE FUNCTION hall.resource_collection_siren_actions(collection_path TEXT DEFAULT '')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  IF NOT hall.can_write_location(collection_path) THEN
    -- @implements-requirement HALL-FR-DOC-230
    -- Images may be uploaded by anyone who may edit a text; the server checks
    -- that the owner text offers resource.update-content to the caller.
    IF hall.holds_access('common-resource.write') OR hall.holds_access('personal-resource.write') THEN
      RETURN jsonb_build_array(hall.editor_asset_siren_action());
    END IF;
    RETURN '[]'::jsonb;
  END IF;
  RETURN jsonb_build_array(
    hall.siren_action(
      'resource.create',
      'POST',
      '/api/resources',
      jsonb_build_array(
        jsonb_build_object('name', 'kind', 'type', 'text'),
        jsonb_build_object('name', 'path', 'type', 'text', 'value', collection_path),
        jsonb_build_object('name', 'name', 'type', 'text')
      )
    ),
    hall.siren_action(
      'resource.create-document',
      'POST',
      '/api/resources/documents',
      jsonb_build_array(
        jsonb_build_object('name', 'file', 'type', 'file', 'accept', '.pdf,.jpg,.jpeg,.png,.docx,.odt,.pptx,.txt'),
        jsonb_build_object('name', 'path', 'type', 'text', 'value', collection_path),
        jsonb_build_object('name', 'name', 'type', 'text')
      ),
      'multipart/form-data'
    ),
    hall.siren_action(
      'resource.import-spreadsheet',
      'POST',
      '/api/resources/spreadsheets/import',
      jsonb_build_array(
        jsonb_build_object('name', 'file', 'type', 'file', 'accept', '.csv,.xlsx'),
        jsonb_build_object('name', 'path', 'type', 'text', 'value', collection_path),
        jsonb_build_object('name', 'name', 'type', 'text')
      ),
      'multipart/form-data'
    ),
    -- @implements-requirement HALL-FR-DOC-510
    hall.siren_action(
      'resource.convert-spreadsheet-table',
      'POST',
      '/api/resources/spreadsheets/table',
      jsonb_build_array(jsonb_build_object('name', 'file', 'type', 'file', 'accept', '.csv,.xlsx')),
      'multipart/form-data'
    ),
    hall.editor_asset_siren_action(),
    hall.siren_action(
      'resource.search-legal-references',
      'POST',
      '/api/resources/legal-references/search'
    )
  ) || CASE
    -- @implements-requirement HALL-FR-WSP-420
    -- An affair is created or imported only in a common folder.
    WHEN hall.allows('council-business.create')
      AND NOT hall.is_personal_workspace_location(collection_path)
    THEN jsonb_build_array(
      hall.siren_action(
        'council-business.create',
        'POST',
        '/api/council-business',
        jsonb_build_array(
          jsonb_build_object('name', 'path', 'type', 'text', 'value', collection_path),
          jsonb_build_object('name', 'name', 'type', 'text'),
          jsonb_build_object('name', 'reportName', 'type', 'text'),
          jsonb_build_object('name', 'reportContent', 'type', 'text', 'value', '')
        )
      ),
      hall.siren_action(
        'council-business.import-bundle',
        'POST',
        '/api/council-business/import-bundle',
        jsonb_build_array(jsonb_build_object('name', 'file', 'type', 'file')),
        'multipart/form-data'
      )
    )
    ELSE '[]'::jsonb
  END;
END
$function$;

CREATE FUNCTION hall_api.present_editor_asset(asset JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
    'class', jsonb_build_array('editor-asset'),
    'properties', asset,
    'links', jsonb_build_array(
      hall.siren_link('self', '/api/resources/editor-assets/' || (asset ->> 'id')),
      hall.siren_link(
        'content',
        '/api/resources/editor-assets/' || (asset ->> 'id') || '/content',
        asset ->> 'mediaType'
      ),
      hall.siren_link(
        'preview',
        '/api/resources/editor-assets/' || (asset ->> 'id') || '/content',
        asset ->> 'mediaType'
      )
    )
  )
$function$;

CREATE FUNCTION hall_api.present_resource(resource JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.resource_siren_entity(resource)
$function$;

CREATE FUNCTION hall_api.present_resource_collection(
  resources JSONB,
  self_href TEXT,
  include_item_actions BOOLEAN DEFAULT true,
  include_collection_actions BOOLEAN DEFAULT true,
  collection_path TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
      'class', jsonb_build_array('resource-collection'),
      'properties', '{}'::jsonb,
      'entities', coalesce(
        (
          SELECT jsonb_agg(hall.resource_siren_item(resource, include_item_actions))
          FROM jsonb_array_elements(resources) AS resource
        ),
        '[]'::jsonb
      ),
      'links', jsonb_build_array(
        hall.siren_link('self', self_href),
        hall.siren_link('catalog', '/api/resources/catalog'),
        hall.siren_link('search', '/api/resources/search')
      )
    )
    || CASE
      WHEN include_collection_actions AND jsonb_array_length(hall.resource_collection_siren_actions(collection_path)) > 0
        THEN jsonb_build_object('actions', hall.resource_collection_siren_actions(collection_path))
      ELSE '{}'::jsonb
    END
$function$;

CREATE FUNCTION hall_api.present_resource_search(search_result JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  -- @implements-requirement HALL-FR-WSP-420
  -- Each result carries its resource entity, without actions, so a picker reads
  -- the classes projected by the base.
  SELECT jsonb_build_object(
    'class', jsonb_build_array('resource-search'),
    'properties', search_result,
    'entities', coalesce(
      (SELECT jsonb_agg(hall.resource_siren_item(item, false))
       FROM jsonb_array_elements(search_result -> 'items') AS item),
      '[]'::jsonb
    ),
    'links', jsonb_build_array(
      hall.siren_link('self', '/api/resources/search'),
      hall.siren_link('collection', '/api/resources')
    )
  )
$function$;

-- @implements-requirement HALL-FR-DOC-310
CREATE FUNCTION hall_api.present_geographic_layer_collection(layers JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
      'class', jsonb_build_array('resource-collection'),
      'properties', '{}'::jsonb,
      'entities', coalesce(
        (SELECT jsonb_agg(hall.resource_siren_item(layer, true)) FROM jsonb_array_elements(layers) AS layer),
        '[]'::jsonb
      ),
      'links', jsonb_build_array(hall.siren_link('self', '/api/resources/geographic-layers'))
    )
    || CASE
      WHEN hall.allows('resource.import-geographic-layer', jsonb_build_object('location', ''))
        THEN jsonb_build_object('actions', jsonb_build_array(hall.geographic_layer_import_siren_action('', NULL)))
      ELSE '{}'::jsonb
    END
$function$;

-- @implements-requirement HALL-FR-DOC-400
CREATE FUNCTION hall_api.present_municipal_property(state JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
      'class', jsonb_build_array('municipal-property'),
      'properties', state,
      'links', jsonb_build_array(hall.siren_link('self', '/api/resources/geographic-layers/municipal-property'))
    )
    || CASE
      WHEN hall.allows('resource.import-municipal-property') THEN jsonb_build_object(
        'actions',
        jsonb_build_array(
          hall.siren_action(
            'resource.import-municipal-property',
            'POST',
            '/api/resources/geographic-layers/municipal-property/import',
            jsonb_build_array(
              jsonb_build_object('name', 'label', 'type', 'text'),
              jsonb_build_object('name', 'file', 'type', 'file'),
              jsonb_build_object('name', 'list', 'type', 'textarea')
            ),
            'multipart/form-data'
          )
        )
      )
      ELSE '{}'::jsonb
    END
$function$;
