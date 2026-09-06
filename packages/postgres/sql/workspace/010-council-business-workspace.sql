-- CouncilBusiness documentary identity
-- ====================================
--
-- This relation is the only articulation between the council model and the
-- documentary namespace. It contains identifiers, never copied paths: moving
-- or renaming the folder therefore leaves CouncilBusiness stable.

-- @functional-requirement HALL-FR-WSP-010 COUNCIL_BUSINESS_HAS_ONE_FOLDER_AND_ONE_REPORT:
CREATE TABLE hall.council_business_workspace (
  council_business UUID PRIMARY KEY
    REFERENCES hall.council_business (id) ON DELETE RESTRICT,
  folder_resource UUID NOT NULL UNIQUE
    REFERENCES hall.folder_resource (id) ON DELETE RESTRICT,
  report_resource UUID NOT NULL UNIQUE
    REFERENCES hall.text_resource (id) ON DELETE RESTRICT,
  CONSTRAINT council_business_workspace_resources_differ
    CHECK (folder_resource <> report_resource)
);

-- @functional-requirement HALL-FR-WSP-015 COUNCIL_BUSINESS_ALWAYS_HAS_A_WORKSPACE:
CREATE FUNCTION hall.council_business_has_workspace(target_business UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT EXISTS (
    SELECT
    FROM hall.council_business_workspace AS workspace
    WHERE workspace.council_business = target_business
  )
$function$;

CREATE FUNCTION hall.enforce_council_business_has_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  -- The constraint is deferred so the root, folder, report and mapping can be
  -- inserted in one transaction without exposing an incomplete commit.
  IF NOT hall.council_business_has_workspace(NEW.id) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV702',
      MESSAGE = 'a council business must have one documentary workspace';
  END IF;

  RETURN NEW;
END
$function$;

CREATE CONSTRAINT TRIGGER council_business_enforce_workspace
AFTER INSERT OR UPDATE ON hall.council_business
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION hall.enforce_council_business_has_workspace();

-- @functional-requirement HALL-FR-WSP-020 COUNCIL_BUSINESS_REPORT_IS_IN_ITS_FOLDER:
CREATE FUNCTION hall.council_business_workspace_is_valid(target_business UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT EXISTS (
    SELECT
    FROM hall.council_business_workspace AS workspace
    JOIN hall.resource AS folder
      ON folder.id = workspace.folder_resource
     AND folder.folder_resource_id = workspace.folder_resource
    JOIN hall.resource AS report
      ON report.id = workspace.report_resource
     AND report.text_resource_id = workspace.report_resource
    WHERE workspace.council_business = target_business
      AND report.path = folder.full_path
  )
$function$;

CREATE FUNCTION hall.enforce_council_business_workspace_mapping()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  target_business UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.council_business ELSE NEW.council_business END;
BEGIN
  -- The assertion is deferred: relocating a folder updates its envelope and
  -- descendants in successive statements but must be valid at transaction end.
  IF TG_OP <> 'DELETE' AND NOT hall.council_business_workspace_is_valid(target_business) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV701',
      MESSAGE = 'a council business report must be a text resource inside its folder resource';
  END IF;

  -- Removing or retargeting a mapping cannot leave its former aggregate root
  -- alive without a workspace.
  IF TG_OP IN ('UPDATE', 'DELETE')
    AND EXISTS (SELECT FROM hall.council_business WHERE id = OLD.council_business)
    AND NOT hall.council_business_has_workspace(OLD.council_business)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV702',
      MESSAGE = 'a council business must have one documentary workspace';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$function$;

CREATE CONSTRAINT TRIGGER council_business_workspace_enforce_shape
AFTER INSERT OR UPDATE OR DELETE ON hall.council_business_workspace
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION hall.enforce_council_business_workspace_mapping();

CREATE FUNCTION hall.enforce_council_business_workspace_resource()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  target_business UUID;
BEGIN
  SELECT workspace.council_business
  INTO target_business
  FROM hall.council_business_workspace AS workspace
  WHERE workspace.folder_resource = NEW.id OR workspace.report_resource = NEW.id;

  -- Unrelated documentary resources do not participate in this aggregate.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- The deferred check observes the final namespace after every descendant of
  -- a relocated folder has received its new path.
  IF NOT hall.council_business_workspace_is_valid(target_business) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV701',
      MESSAGE = 'a council business report must be a text resource inside its folder resource';
  END IF;

  RETURN NEW;
END
$function$;

-- @functional-requirement HALL-FR-WSP-030 RESOURCE_RELOCATION_PRESERVES_BUSINESS_IDENTITY:
CREATE CONSTRAINT TRIGGER resource_enforce_council_business_workspace
AFTER UPDATE OF path, name, folder_resource_id, text_resource_id ON hall.resource
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION hall.enforce_council_business_workspace_resource();

-- CouncilBusiness working resources
-- =================================
--
-- This relation classifies an existing documentary resource as supporting one
-- affair. It deliberately carries no path: association, dissociation and
-- ordering never relocate the resource in the workspace namespace.

-- @functional-requirement HALL-FR-WSP-090 BUSINESS_RESOURCE_ASSOCIATION_PRESERVES_LOCATION:
-- @functional-requirement HALL-FR-WSP-100 BUSINESS_RESOURCES_HAVE_A_STABLE_ORDER:
CREATE TABLE hall.council_business_resource (
  council_business UUID NOT NULL
    REFERENCES hall.council_business (id) ON DELETE CASCADE,
  resource UUID NOT NULL
    REFERENCES hall.resource (id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position > 0),
  PRIMARY KEY (council_business, resource),
  CONSTRAINT council_business_resource_position_unique
    UNIQUE (council_business, position)
    DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE hall.council_business_resource IS
  'Ordered many-to-many association between an affair and existing non-folder working resources; FolderPath remains owned by hall.resource.';

CREATE FUNCTION hall.enforce_council_business_resource()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  associated_is_folder BOOLEAN;
BEGIN
  -- @technical-requirement HALL-TR-CON-210 BUSINESS_RESOURCE_WRITES_ARE_SERIALIZED:
  -- One aggregate-root lock serializes append, dissociation and exact reorder.
  PERFORM 1
  FROM hall.council_business
  WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.council_business ELSE NEW.council_business END
  FOR UPDATE;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- @functional-requirement HALL-FR-WSP-110 BUSINESS_RESOURCE_IDENTITY_IS_IMMUTABLE:
  IF TG_OP = 'UPDATE'
    AND (
      NEW.council_business IS DISTINCT FROM OLD.council_business
      OR NEW.resource IS DISTINCT FROM OLD.resource
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV704',
      MESSAGE = 'a council business resource identity is immutable';
  END IF;

  SELECT candidate.is_folder
  INTO associated_is_folder
  FROM hall.resource AS candidate
  WHERE candidate.id = NEW.resource;

  -- @functional-requirement HALL-FR-WSP-120 BUSINESS_RESOURCE_IS_A_WORKING_RESOURCE:
  -- The intrinsic folder and report already have dedicated identities. A
  -- folder cannot be attached as a working document and the report cannot be
  -- duplicated in the ordered association.
  IF associated_is_folder IS NULL
    OR associated_is_folder
    OR EXISTS (
      SELECT
      FROM hall.council_business_workspace AS workspace
      WHERE workspace.council_business = NEW.council_business
        AND NEW.resource IN (workspace.folder_resource, workspace.report_resource)
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV703',
      MESSAGE = 'a council business resource must be a non-folder working resource distinct from its report';
  END IF;

  RETURN NEW;
END
$function$;

CREATE TRIGGER council_business_resource_enforce_invariants
BEFORE INSERT OR UPDATE OR DELETE ON hall.council_business_resource
FOR EACH ROW
EXECUTE FUNCTION hall.enforce_council_business_resource();
