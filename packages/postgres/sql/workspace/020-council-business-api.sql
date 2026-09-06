-- CouncilBusiness workspace application surface
-- =============================================
--
-- The projection returns only aggregate and resource identities. The report
-- content remains an independently fetched Resource, keeping hydration scoped.

-- @functional-requirement HALL-FR-WSP-040 COUNCIL_BUSINESS_PROJECTION_IS_SCOPED:
CREATE FUNCTION hall.council_business_workspace_projection(target_business UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
    'id', workspace.council_business,
    'folderResourceId', workspace.folder_resource,
    'reportResourceId', workspace.report_resource
  )
  FROM hall.council_business_workspace AS workspace
  WHERE workspace.council_business = target_business
$function$;

CREATE FUNCTION hall_api.open_council_business(target_business UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.council_business_workspace_projection(target_business)
$function$;

CREATE FUNCTION hall_api.list_council_business()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(
    jsonb_agg(
      hall.council_business_workspace_projection(business.id)
      ORDER BY business.created_at, business.id
    ),
    '[]'::jsonb
  )
  FROM hall.council_business AS business
$function$;

-- @functional-requirement HALL-FR-WSP-180 BUSINESS_WORKSPACE_LIST_IS_BULK_PROJECTED:
-- This list projection deliberately carries the primary report because the
-- existing search, meeting preparation and live-meeting UI all consume it.
-- Working-resource presentations remain on the separate flat bulk projection
-- below so this query never builds a nested documentary aggregate.
CREATE FUNCTION hall_api.list_council_business_workspace_items()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', workspace.council_business,
        'folderResourceId', workspace.folder_resource,
        'reportResourceId', workspace.report_resource,
        'title', folder.name,
        'folderPath', folder.path,
        'report', report_content.content,
        'createdAt', folder.created_at,
        'updatedAt', greatest(folder.updated_at, report.updated_at)
      )
      ORDER BY folder.created_at, workspace.council_business
    ),
    '[]'::jsonb
  )
  FROM hall.council_business_workspace AS workspace
  JOIN hall.resource AS folder
    ON folder.id = workspace.folder_resource
  JOIN hall.resource AS report
    ON report.id = workspace.report_resource
  JOIN hall.text_resource AS report_content
    ON report_content.id = workspace.report_resource
$function$;

-- @functional-requirement HALL-FR-WSP-050 COUNCIL_BUSINESS_WORKSPACE_IS_CREATED_ATOMICALLY:
-- This internal named action is reused by the standalone creation API and by
-- the atomic create-and-schedule commands. It returns only the new identity;
-- each public operation chooses its own scoped projection.
CREATE FUNCTION hall.create_council_business_workspace(
  parent_path TEXT,
  business_name TEXT,
  report_name TEXT,
  report_content TEXT
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  business_id UUID := gen_random_uuid();
  folder_id UUID := gen_random_uuid();
  report_id UUID := gen_random_uuid();
  business_path TEXT;
BEGIN
  -- The existing namespace lock serializes slug and path allocation for the
  -- complete folder/report creation transaction.
  PERFORM hall.lock_resource_namespace();
  PERFORM hall.ensure_folder_path(parent_path);

  IF business_name IS NULL OR NOT hall.is_valid_resource_name(business_name)
    OR report_name IS NULL OR NOT hall.is_valid_resource_name(report_name)
    OR report_content IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV607',
      MESSAGE = 'Council business workspace input is invalid';
  END IF;

  business_path := CASE
    WHEN parent_path = '' THEN business_name
    ELSE parent_path || '/' || business_name
  END;

  INSERT INTO hall.council_business (id) VALUES (business_id);

  INSERT INTO hall.folder_resource (id) VALUES (folder_id);
  INSERT INTO hall.resource (id, path, name, slug, folder_resource_id)
  VALUES (
    folder_id,
    parent_path,
    business_name,
    hall.claim_resource_slug(business_name),
    folder_id
  );

  INSERT INTO hall.text_resource (id, content) VALUES (report_id, report_content);
  INSERT INTO hall.resource (id, path, name, slug, text_resource_id)
  VALUES (
    report_id,
    business_path,
    report_name,
    hall.claim_resource_slug(report_name),
    report_id
  );

  INSERT INTO hall.council_business_workspace (
    council_business,
    folder_resource,
    report_resource
  ) VALUES (business_id, folder_id, report_id);

  RETURN business_id;
END
$function$;

CREATE FUNCTION hall_api.create_council_business(
  parent_path TEXT,
  business_name TEXT,
  report_name TEXT,
  report_content TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  business_id UUID;
BEGIN
  business_id := hall.create_council_business_workspace(
    parent_path,
    business_name,
    report_name,
    report_content
  );
  RETURN hall.council_business_workspace_projection(business_id);
END
$function$;

-- @functional-requirement HALL-FR-WSP-130 BUSINESS_RESOURCE_PROJECTION_IS_SCOPED:
CREATE FUNCTION hall.council_business_resource_projection(target hall.council_business_resource)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog
AS $function$
  SELECT jsonb_build_object(
    'councilBusinessId', target.council_business,
    'resourceId', target.resource,
    'position', target.position
  )
$function$;

CREATE FUNCTION hall_api.list_council_business_resources(target_business UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(
    jsonb_agg(
      hall.council_business_resource_projection(association)
      ORDER BY association.position, association.resource
    ),
    '[]'::jsonb
  )
  FROM hall.council_business_resource AS association
  WHERE association.council_business = target_business
$function$;

-- @functional-requirement HALL-FR-WSP-190 BUSINESS_RESOURCES_ARE_BULK_PROJECTED:
-- Each result row is flat and independently parseable. The caller groups rows
-- by councilBusinessId without one HTTP/SQL query per aggregate.
CREATE FUNCTION hall_api.list_council_business_resource_items(target_businesses UUID[])
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  result JSONB;
BEGIN
  IF target_businesses IS NULL
    OR cardinality(target_businesses) = 0
    OR cardinality(target_businesses) > 100
    OR (SELECT count(DISTINCT business_id) FROM unnest(target_businesses) AS requested(business_id))
      <> cardinality(target_businesses)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV607',
      MESSAGE = 'council business resource projection requires between one and one hundred unique business identities';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'councilBusinessId', association.council_business,
        'position', association.position
      ) || hall.resource_presentation(projected_resource)
      ORDER BY association.council_business, association.position, association.resource
    ),
    '[]'::jsonb
  )
  INTO result
  FROM hall.council_business_resource AS association
  JOIN hall.resource_read_model AS projected_resource
    ON projected_resource.id = association.resource
  WHERE association.council_business = ANY(target_businesses);

  RETURN result;
END
$function$;

-- @functional-requirement HALL-FR-WSP-140 BUSINESS_RESOURCE_IS_ASSOCIATED_WITHOUT_RELOCATION:
CREATE FUNCTION hall_api.associate_council_business_resource(
  target_business UUID,
  target_resource UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  next_position INTEGER;
  association hall.council_business_resource;
BEGIN
  PERFORM 1
  FROM hall.council_business
  WHERE id = target_business
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV905',
      MESSAGE = format('unknown council business %s', target_business);
  END IF;

  SELECT coalesce(max(position), 0) + 1
  INTO next_position
  FROM hall.council_business_resource
  WHERE council_business = target_business;

  INSERT INTO hall.council_business_resource (council_business, resource, position)
  VALUES (target_business, target_resource, next_position)
  RETURNING * INTO association;

  RETURN hall.council_business_resource_projection(association);
END
$function$;

-- @functional-requirement HALL-FR-WSP-150 BUSINESS_RESOURCE_CAN_BE_DISSOCIATED:
CREATE FUNCTION hall_api.dissociate_council_business_resource(
  target_business UUID,
  target_resource UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  association hall.council_business_resource;
BEGIN
  DELETE FROM hall.council_business_resource
  WHERE council_business = target_business
    AND resource = target_resource
  RETURNING * INTO association;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV703',
      MESSAGE = 'council business resource association does not exist';
  END IF;

  RETURN hall.council_business_resource_projection(association);
END
$function$;

-- @functional-requirement HALL-FR-WSP-160 BUSINESS_RESOURCE_REORDER_IS_EXACT:
CREATE FUNCTION hall_api.reorder_council_business_resources(
  target_business UUID,
  ordered_resources UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall, hall_api
AS $function$
DECLARE
  associated_count INTEGER;
BEGIN
  PERFORM 1
  FROM hall.council_business
  WHERE id = target_business
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV905',
      MESSAGE = format('unknown council business %s', target_business);
  END IF;

  SELECT count(*)::INTEGER
  INTO associated_count
  FROM hall.council_business_resource
  WHERE council_business = target_business;

  IF ordered_resources IS NULL
    OR cardinality(ordered_resources) <> associated_count
    OR (SELECT count(DISTINCT resource_id) FROM unnest(ordered_resources) AS requested(resource_id)) <> associated_count
    OR EXISTS (
      SELECT
      FROM unnest(ordered_resources) AS requested(resource_id)
      LEFT JOIN hall.council_business_resource AS association
        ON association.council_business = target_business
       AND association.resource = requested.resource_id
      WHERE association.resource IS NULL
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV705',
      MESSAGE = 'a council business resource reorder must contain every associated resource exactly once';
  END IF;

  UPDATE hall.council_business_resource AS association
  SET position = requested.position
  FROM unnest(ordered_resources) WITH ORDINALITY AS requested(resource_id, position)
  WHERE association.council_business = target_business
    AND association.resource = requested.resource_id;

  RETURN hall_api.list_council_business_resources(target_business);
END
$function$;
