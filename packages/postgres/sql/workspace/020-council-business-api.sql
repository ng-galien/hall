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

-- @functional-requirement HALL-FR-WSP-050 COUNCIL_BUSINESS_WORKSPACE_IS_CREATED_ATOMICALLY:
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

  RETURN hall.council_business_workspace_projection(business_id);
END
$function$;
