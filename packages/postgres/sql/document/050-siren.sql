-- Documentary Siren is a PostgreSQL projection because its affordances depend
-- on the persisted resource variant and on the database authorization context.

-- @functional-requirement HALL-FR-DOC-220 DOCUMENTARY_SIREN_IS_DATABASE_OWNED:
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
  -- @requirement-reference HALL-FR-DOC-180 WORKSPACE_CATALOG_IS_FLAT:
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
  RETURN links;
END
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
  IF NOT hall.is_administrator() THEN
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
  ELSIF resource_kind = 'legalReference' THEN
    -- @requirement-reference HALL-FR-DOC-220 DOCUMENTARY_SIREN_IS_DATABASE_OWNED:
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

  IF proposal_text THEN
    SELECT coalesce(jsonb_agg(action), '[]'::jsonb) INTO actions
    FROM jsonb_array_elements(actions) action WHERE action ->> 'name' <> 'resource.relocate';
    RETURN actions;
  END IF;
  -- Availability mirrors existing restrictive references. DELETE still rechecks
  -- all constraints atomically, including links created after this projection.
  IF EXISTS (SELECT FROM hall.council_business_resource linked WHERE linked.resource = (resource_siren_actions.resource ->> 'id')::UUID)
    OR EXISTS (SELECT FROM hall.resource target
      JOIN hall.meeting_attendance attendance ON attendance.proxy_document = target.document_resource_id
      WHERE target.id = (resource_siren_actions.resource ->> 'id')::UUID)
    OR EXISTS (SELECT FROM hall.resource target
      JOIN hall.meeting_attendance_event attendance ON attendance.proxy_document = target.document_resource_id
      WHERE target.id = (resource_siren_actions.resource ->> 'id')::UUID)
  THEN
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
  SELECT jsonb_build_object(
      'class', jsonb_build_array('resource'),
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

CREATE FUNCTION hall.resource_collection_siren_actions()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  IF NOT hall.is_administrator() THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN jsonb_build_array(
    hall.siren_action(
      'resource.create',
      'POST',
      '/api/resources',
      jsonb_build_array(
        jsonb_build_object('name', 'kind', 'type', 'text'),
        jsonb_build_object('name', 'path', 'type', 'text', 'value', ''),
        jsonb_build_object('name', 'name', 'type', 'text')
      )
    ),
    hall.siren_action(
      'resource.create-document',
      'POST',
      '/api/resources/documents',
      jsonb_build_array(
        jsonb_build_object('name', 'file', 'type', 'file'),
        jsonb_build_object('name', 'path', 'type', 'text', 'value', ''),
        jsonb_build_object('name', 'name', 'type', 'text')
      ),
      'multipart/form-data'
    ),
    hall.siren_action(
      'resource.import-spreadsheet',
      'POST',
      '/api/resources/spreadsheets/import',
      jsonb_build_array(
        jsonb_build_object('name', 'file', 'type', 'file'),
        jsonb_build_object('name', 'path', 'type', 'text', 'value', ''),
        jsonb_build_object('name', 'name', 'type', 'text')
      ),
      'multipart/form-data'
    ),
    hall.siren_action(
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
    ),
    hall.siren_action(
      'resource.search-legal-references',
      'POST',
      '/api/resources/legal-references/search'
    )
  );
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
  include_collection_actions BOOLEAN DEFAULT true
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
      WHEN include_collection_actions AND jsonb_array_length(hall.resource_collection_siren_actions()) > 0
        THEN jsonb_build_object('actions', hall.resource_collection_siren_actions())
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
  SELECT jsonb_build_object(
    'class', jsonb_build_array('resource-search'),
    'properties', search_result,
    'links', jsonb_build_array(
      hall.siren_link('self', '/api/resources/search'),
      hall.siren_link('collection', '/api/resources')
    )
  )
$function$;
