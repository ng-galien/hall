-- @technical-requirement HALL-TR-CTX-020 TRANSACTION_LOCAL_CALL_CONTEXT:
-- Database functions read an immutable request context installed with SET LOCAL
-- semantics. Missing mandatory values are rejected instead of being invented.
CREATE FUNCTION hall.require_setting(setting_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog
AS $function$
DECLARE
  setting_value text := current_setting(setting_name, true);
BEGIN
  IF nullif(setting_value, '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV001',
      MESSAGE = format('Required Hall call setting is missing: %s', setting_name);
  END IF;

  RETURN setting_value;
END
$function$;

ALTER FUNCTION hall.require_setting(text) OWNER TO hall_owner;
REVOKE ALL ON FUNCTION hall.require_setting(text) FROM PUBLIC;

CREATE FUNCTION hall.call_context()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
    'requestId', hall.require_setting('hall.request_id'),
    'actorId', nullif(current_setting('hall.actor_id', true), ''),
    'action', hall.require_setting('hall.action'),
    'contactId', nullif(current_setting('hall.contact_id', true), ''),
    'roles', coalesce(nullif(current_setting('hall.roles', true), '')::jsonb, '[]'::jsonb)
  )
$function$;

ALTER FUNCTION hall.call_context() OWNER TO hall_owner;
REVOKE ALL ON FUNCTION hall.call_context() FROM PUBLIC;

-- @technical-requirement HALL-TR-CTX-030 MINIMAL_DATABASE_RBAC_CONTEXT:
-- Siren affordances are derived in PostgreSQL. This first connection keeps the
-- RBAC intentionally narrow: only the administrator role receives documentary
-- mutation affordances. The role matrix can later move to relations without
-- changing the Siren contract.
CREATE FUNCTION hall.is_administrator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT coalesce(nullif(current_setting('hall.roles', true), '')::jsonb, '[]'::jsonb) ? 'administrator'
$function$;

ALTER FUNCTION hall.is_administrator() OWNER TO hall_owner;
REVOKE ALL ON FUNCTION hall.is_administrator() FROM PUBLIC;

-- @implements-requirement HALL-FR-DOC-350
-- The server owns the role to permission matrix and installs the permissions
-- granted to the caller; PostgreSQL reads them to project affordances.
CREATE FUNCTION hall.has_permission(permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT coalesce(nullif(current_setting('hall.permissions', true), '')::jsonb, '[]'::jsonb) ? permission
$function$;

ALTER FUNCTION hall.has_permission(TEXT) OWNER TO hall_owner;
REVOKE ALL ON FUNCTION hall.has_permission(TEXT) FROM PUBLIC;

CREATE FUNCTION hall_api.call_context()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.call_context()
$function$;

ALTER FUNCTION hall_api.call_context() OWNER TO hall_owner;
REVOKE ALL ON FUNCTION hall_api.call_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hall_api.call_context() TO hall_api_anonymous, hall_api_authenticated, hall_api_worker;
