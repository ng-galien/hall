SET LOCAL ROLE hall_owner;
CREATE TYPE hall.delegation_role AS ENUM ('primary','alternate');
CREATE TABLE hall.council_delegation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CONSTRAINT "council_delegation_name_check" CHECK (btrim(name) <> ''::text),
  description TEXT NOT NULL DEFAULT ''::text,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  -- @implements-requirement HALL-TR-SCH-060
  options JSONB NOT NULL DEFAULT '{}'::jsonb CONSTRAINT "council_delegation_options_is_object" CHECK (jsonb_typeof(options) = 'object'::text)
);

CREATE UNIQUE INDEX council_delegation_one_active_name ON hall.council_delegation USING btree (lower(name)) WHERE (archived_at IS NULL);

-- @implements-requirement HALL-FR-DIR-140
CREATE TABLE hall.delegation_membership (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation UUID NOT NULL REFERENCES hall.council_delegation (id) ON DELETE RESTRICT,
  contact UUID NOT NULL REFERENCES hall.contact (id) ON DELETE RESTRICT,
  role hall.delegation_role NOT NULL,
  started_on DATE NOT NULL,
  ended_on DATE,
  CONSTRAINT "delegation_membership_dates_are_ordered" CHECK (ended_on IS NULL OR ended_on >= started_on)
);

CREATE UNIQUE INDEX delegation_membership_one_active_per_member ON hall.delegation_membership USING btree (delegation, contact) WHERE (ended_on IS NULL);

CREATE FUNCTION hall.enforce_delegation_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  parent_archived_at TIMESTAMPTZ;
  contact_archived_at TIMESTAMPTZ;
BEGIN
  SELECT archived_at INTO parent_archived_at
  FROM hall.council_delegation WHERE id = NEW.delegation FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV830', MESSAGE = 'Council delegation not found';
  END IF;
  SELECT archived_at INTO contact_archived_at
  FROM hall.contact WHERE id = NEW.contact FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV801', MESSAGE = 'Contact not found';
  END IF;
  IF NEW.ended_on IS NULL AND parent_archived_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV831', MESSAGE = 'Council delegation is archived';
  END IF;
  IF NEW.ended_on IS NULL AND contact_archived_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV802', MESSAGE = 'Contact is archived';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER delegation_membership_enforce_invariants
BEFORE INSERT OR UPDATE OF delegation, contact, started_on, ended_on
ON hall.delegation_membership
FOR EACH ROW
EXECUTE FUNCTION hall.enforce_delegation_membership();

CREATE FUNCTION hall.end_memberships_with_delegation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
    UPDATE hall.delegation_membership
    SET ended_on = NEW.archived_at::DATE
    WHERE delegation = NEW.id
      AND ended_on IS NULL;
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER council_delegation_end_memberships
AFTER UPDATE OF archived_at
ON hall.council_delegation
FOR EACH ROW
EXECUTE FUNCTION hall.end_memberships_with_delegation();

CREATE FUNCTION hall.council_delegation_projection(target hall.council_delegation)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
    'id', target.id,
    'name', target.name,
    'description', target.description,
    'archivedAt', target.archived_at,
    'createdAt', target.created_at,
    'updatedAt', target.updated_at
  )
$function$;

CREATE FUNCTION hall.delegation_membership_projection(target hall.delegation_membership)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
    'id', target.id,
    'delegationId', target.delegation,
    'contactId', target.contact,
    'role', target.role,
    'startedOn', target.started_on,
    'endedOn', target.ended_on
  )
$function$;

-- @implements-requirement HALL-FR-DIR-080
CREATE FUNCTION hall_api.list_council_delegations(include_archived BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(
    jsonb_agg(hall.council_delegation_projection(delegation) ORDER BY delegation.name, delegation.id),
    '[]'::jsonb
  )
  FROM hall.council_delegation AS delegation
  WHERE include_archived OR delegation.archived_at IS NULL
$function$;

CREATE FUNCTION hall_api.open_council_delegation(target_delegation UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.council_delegation_projection(delegation)
  FROM hall.council_delegation AS delegation
  WHERE delegation.id = target_delegation
$function$;

CREATE FUNCTION hall_api.create_council_delegation(delegation_name TEXT, delegation_description TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  created hall.council_delegation;
BEGIN
  INSERT INTO hall.council_delegation (name, description)
  VALUES (delegation_name, delegation_description)
  RETURNING * INTO created;
  RETURN hall.council_delegation_projection(created);
END
$function$;

CREATE FUNCTION hall_api.update_council_delegation(
  target_delegation UUID,
  delegation_name TEXT,
  delegation_description TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.council_delegation;
BEGIN
  UPDATE hall.council_delegation
  SET name = delegation_name,
      description = delegation_description,
      updated_at = transaction_timestamp()
  WHERE id = target_delegation
    AND archived_at IS NULL
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    IF EXISTS (SELECT FROM hall.council_delegation WHERE id = target_delegation) THEN
      RAISE EXCEPTION USING ERRCODE = 'HV831', MESSAGE = 'An archived delegation cannot be updated';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'HV830', MESSAGE = 'Council delegation not found';
  END IF;
  RETURN hall.council_delegation_projection(changed);
END
$function$;

CREATE FUNCTION hall_api.archive_council_delegation(target_delegation UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.council_delegation;
BEGIN
  UPDATE hall.council_delegation
  SET archived_at = coalesce(archived_at, transaction_timestamp()),
      updated_at = CASE WHEN archived_at IS NULL THEN transaction_timestamp() ELSE updated_at END
  WHERE id = target_delegation
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV830', MESSAGE = 'Council delegation not found';
  END IF;
  RETURN hall.council_delegation_projection(changed);
END
$function$;

CREATE FUNCTION hall_api.list_delegation_memberships(target_delegation UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(
    jsonb_agg(hall.delegation_membership_projection(membership) ORDER BY membership.started_on, membership.id),
    '[]'::jsonb
  )
  FROM hall.delegation_membership AS membership
  WHERE membership.delegation = target_delegation
$function$;

CREATE FUNCTION hall_api.open_delegation_membership(target_delegation UUID, target_membership UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.delegation_membership_projection(membership)
  FROM hall.delegation_membership AS membership
  WHERE membership.id = target_membership
    AND membership.delegation = target_delegation
$function$;

CREATE FUNCTION hall_api.add_delegation_membership(
  target_delegation UUID,
  target_member UUID,
  membership_role TEXT,
  membership_started_on DATE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  created hall.delegation_membership;
BEGIN
  INSERT INTO hall.delegation_membership (delegation, contact, role, started_on)
  VALUES (target_delegation, target_member, membership_role::hall.delegation_role, membership_started_on)
  RETURNING * INTO created;
  RETURN hall.delegation_membership_projection(created);
END
$function$;

CREATE FUNCTION hall_api.update_delegation_membership(
  target_delegation UUID,
  target_membership UUID,
  membership_role TEXT,
  membership_started_on DATE,
  membership_ended_on DATE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.delegation_membership;
BEGIN
  UPDATE hall.delegation_membership
  SET role = membership_role::hall.delegation_role,
      started_on = membership_started_on,
      ended_on = membership_ended_on
  WHERE id = target_membership
    AND delegation = target_delegation
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV834', MESSAGE = 'Committee membership not found';
  END IF;
  RETURN hall.delegation_membership_projection(changed);
END
$function$;

CREATE FUNCTION hall_api.end_delegation_membership(
  target_delegation UUID,
  target_membership UUID,
  membership_ended_on DATE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.delegation_membership;
BEGIN
  UPDATE hall.delegation_membership
  SET ended_on = coalesce(ended_on, membership_ended_on)
  WHERE id = target_membership
    AND delegation = target_delegation
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV834', MESSAGE = 'Committee membership not found';
  END IF;
  RETURN hall.delegation_membership_projection(changed);
END
$function$;
