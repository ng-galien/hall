-- @implements-requirement HALL-FR-DOC-080
-- Content-addressed bytes never change in place. Replacing content creates a
-- new binary object and updates the owning document through a future API.
CREATE FUNCTION hall.reject_binary_object_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'HV605',
    MESSAGE = 'A binary object is immutable';
END;
$$;

CREATE TRIGGER binary_object_reject_change
BEFORE UPDATE OR DELETE
ON hall.binary_object
FOR EACH ROW
EXECUTE FUNCTION hall.reject_binary_object_change();

-- @implements-requirement HALL-FR-DOC-090
-- Location changes update path or name. They never replace the concrete
-- resource component and therefore never change the resource nature.
CREATE FUNCTION hall.reject_resource_nature_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'HV606',
    MESSAGE = 'A resource nature is immutable';
END;
$$;

CREATE TRIGGER resource_reject_nature_change
BEFORE UPDATE OF
  folder_resource_id,
  text_resource_id,
  remote_resource_id,
  spreadsheet_resource_id,
  geographic_resource_id,
  event_resource_id,
  document_resource_id,
  legal_reference_resource_id,
  geographic_layer_resource_id
ON hall.resource
FOR EACH ROW
WHEN (
  ROW(
    OLD.folder_resource_id,
    OLD.text_resource_id,
    OLD.remote_resource_id,
    OLD.spreadsheet_resource_id,
    OLD.geographic_resource_id,
    OLD.event_resource_id,
    OLD.document_resource_id,
    OLD.legal_reference_resource_id,
    OLD.geographic_layer_resource_id
  ) IS DISTINCT FROM ROW(
    NEW.folder_resource_id,
    NEW.text_resource_id,
    NEW.remote_resource_id,
    NEW.spreadsheet_resource_id,
    NEW.geographic_resource_id,
    NEW.event_resource_id,
    NEW.document_resource_id,
    NEW.legal_reference_resource_id,
    NEW.geographic_layer_resource_id
  )
)
EXECUTE FUNCTION hall.reject_resource_nature_change();

-- @implements-requirement HALL-FR-DOC-170
CREATE FUNCTION hall.reject_resource_slug_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'HV611',
    MESSAGE = 'A resource slug is immutable';
END;
$$;

CREATE TRIGGER resource_reject_slug_change
BEFORE UPDATE OF slug
ON hall.resource
FOR EACH ROW
WHEN (OLD.slug IS DISTINCT FROM NEW.slug)
EXECUTE FUNCTION hall.reject_resource_slug_change();

-- @implements-requirement HALL-FR-DOC-200
CREATE FUNCTION hall.touch_resource_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER resource_touch_updated_at
BEFORE UPDATE
ON hall.resource
FOR EACH ROW
EXECUTE FUNCTION hall.touch_resource_updated_at();

-- @implements-requirement HALL-FR-WSP-380
CREATE FUNCTION hall.personal_workspaces_root()
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT 'Espaces personnels'::TEXT
$$;

CREATE FUNCTION hall.is_personal_workspace_location(target_full_path TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, hall
AS $$
  SELECT target_full_path = hall.personal_workspaces_root()
    OR starts_with(target_full_path, hall.personal_workspaces_root() || '/')
$$;

CREATE FUNCTION hall.personal_workspace_owner(target_full_path TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $$
  SELECT workspace.contact
  FROM hall.personal_workspace AS workspace
  JOIN hall.resource AS folder ON folder.folder_resource_id = workspace.folder_resource
  WHERE target_full_path = folder.full_path
    OR starts_with(target_full_path, folder.full_path || '/')
$$;

CREATE FUNCTION hall.child_full_path(parent_path TEXT, resource_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE WHEN parent_path = '' THEN resource_name ELSE parent_path || '/' || resource_name END
$$;

-- @implements-requirement HALL-FR-DOC-550
-- @implements-requirement HALL-FR-WSP-390
-- @implements-requirement HALL-FR-WSP-410
-- @implements-requirement HALL-FR-DIR-160
-- One write predicate per location serves both the accepted writes and the
-- Siren affordances: common folders follow workspace.write, personal folders
-- follow personal-workspaces.manage, and a council member writes only inside
-- the personal folder of their own contact while their mandate is active.
CREATE FUNCTION hall.can_write_location(target_full_path TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $$
DECLARE
  caller_contact TEXT := nullif(current_setting('hall.contact_id', true), '');
  owner_contact UUID;
BEGIN
  IF hall.is_administrator() THEN
    RETURN TRUE;
  END IF;
  IF NOT hall.is_personal_workspace_location(target_full_path) THEN
    RETURN hall.has_permission('workspace.write');
  END IF;
  IF hall.has_permission('personal-workspaces.manage') THEN
    RETURN TRUE;
  END IF;
  IF caller_contact IS NULL OR NOT hall.has_permission('personal-workspace.write') THEN
    RETURN FALSE;
  END IF;
  owner_contact := hall.personal_workspace_owner(target_full_path);
  RETURN owner_contact IS NOT NULL
    AND owner_contact::TEXT = caller_contact
    AND EXISTS (
      SELECT FROM hall.council_member AS member
      WHERE member.contact = owner_contact AND member.term_ended_on IS NULL
    );
END;
$$;

CREATE FUNCTION hall.require_location_write(target_full_path TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, hall
AS $$
BEGIN
  IF NOT hall.can_write_location(target_full_path) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV614',
      MESSAGE = 'The caller cannot write at this workspace location';
  END IF;
END;
$$;

-- @implements-requirement HALL-FR-WSP-380
CREATE FUNCTION hall.is_personal_workspace_structure(target hall.resource)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $$
  SELECT target.full_path = hall.personal_workspaces_root()
    OR EXISTS (
      SELECT FROM hall.personal_workspace AS workspace
      WHERE workspace.folder_resource = target.folder_resource_id
    )
$$;

CREATE FUNCTION hall.require_personal_workspace_structure_change(target hall.resource)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, hall
AS $$
BEGIN
  IF hall.is_personal_workspace_structure(target) AND NOT hall.is_administrator() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV615',
      MESSAGE = 'Only an administrator renames, moves or deletes a personal workspace folder';
  END IF;
END;
$$;

-- @implements-requirement HALL-FR-WSP-380
CREATE FUNCTION hall.enforce_personal_workspace_placement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM hall.personal_workspace AS workspace
    JOIN hall.resource AS folder ON folder.folder_resource_id = workspace.folder_resource
    WHERE folder.path <> hall.personal_workspaces_root()
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV616',
      MESSAGE = 'A personal workspace folder sits directly under the personal workspaces root';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER personal_workspace_placement
AFTER INSERT OR UPDATE
ON hall.personal_workspace
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION hall.enforce_personal_workspace_placement();

CREATE CONSTRAINT TRIGGER resource_personal_workspace_placement
AFTER UPDATE OF path, name
ON hall.resource
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW.folder_resource_id IS NOT NULL)
EXECUTE FUNCTION hall.enforce_personal_workspace_placement();
