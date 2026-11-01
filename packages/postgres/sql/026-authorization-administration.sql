-- @implements-requirement HALL-FR-USR-060
CREATE FUNCTION hall.authorization_access_conditions(target_access TEXT)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN target_access IN ('meeting.conduct', 'agenda-item.conduct', 'ballot.record')
      THEN '["always", "meetingOfficer"]'::jsonb
    WHEN target_access IN ('personal-resource.write', 'personal-resource.delete')
      THEN '["always", "ownPersonalWorkspace"]'::jsonb
    ELSE '["always"]'::jsonb END;
$$;

CREATE FUNCTION hall.authorization_role_json(target_role TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object('id', r.id, 'name', r.name, 'builtIn', r.id = 'administrator',
    'revision', r.revision, 'grants', CASE WHEN r.id = 'administrator' THEN
      (SELECT jsonb_agg(jsonb_build_object('access', a.access, 'condition', 'always') ORDER BY a.access) FROM hall.access a)
    ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('access', g.access, 'condition', g.condition) ORDER BY g.access)
      FROM hall.authorization_grant g WHERE g.role = r.id), '[]'::jsonb) END)
  FROM hall.authorization_role r WHERE r.id = target_role;
$$;

CREATE FUNCTION hall.require_authorization_administrator()
RETURNS VOID LANGUAGE plpgsql STABLE SET search_path = pg_catalog, hall AS $$
BEGIN
  IF NOT hall.allows('role.update') THEN
    RAISE EXCEPTION USING ERRCODE = 'HV614', MESSAGE = 'Only the built-in administrator configures authorization';
  END IF;
END;
$$;

CREATE FUNCTION hall_api.authorization_requires_personal_workspace(target_roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT 'councillor' = ANY(target_roles) OR EXISTS(SELECT FROM hall.authorization_grant WHERE role = ANY(target_roles) AND condition = 'ownPersonalWorkspace');
$$;
ALTER FUNCTION hall_api.authorization_requires_personal_workspace(TEXT[]) OWNER TO hall_owner;
REVOKE ALL ON FUNCTION hall_api.authorization_requires_personal_workspace(TEXT[]) FROM PUBLIC;

CREATE FUNCTION hall_api.authorization_role_options()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name,
    'builtIn', r.id = 'administrator', 'requiresActiveMember', hall_api.authorization_requires_personal_workspace(ARRAY[r.id])) ORDER BY r.id <> 'administrator', r.name), '[]'::jsonb)
  FROM hall.authorization_role r;
$$;

CREATE FUNCTION hall_api.authorization_configuration()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
BEGIN
  PERFORM hall.require_authorization_administrator();
  RETURN jsonb_build_object(
    'roles', (SELECT jsonb_agg(hall.authorization_role_json(r.id) ORDER BY r.id <> 'administrator', r.name) FROM hall.authorization_role r),
    'accesses', (SELECT jsonb_agg(jsonb_build_object('access', a.access, 'resource', a.resource, 'operation', a.operation,
      'conditions', hall.authorization_access_conditions(a.access),
      'configurable', a.access NOT IN ('authorization.manage', 'installation', 'session')) ORDER BY a.resource, a.operation) FROM hall.access a));
END;
$$;

CREATE FUNCTION hall_api.save_authorization_role(target_role TEXT, input JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE
  before_value JSONB;
  after_value JSONB;
  expected_revision INTEGER := (input ->> 'revision')::INTEGER;
BEGIN
  PERFORM hall.require_authorization_administrator();
  IF target_role = 'administrator' THEN
    RAISE EXCEPTION USING ERRCODE = 'HV801', MESSAGE = 'The built-in administrator cannot be changed';
  END IF;
  IF jsonb_typeof(input -> 'grants') IS DISTINCT FROM 'array' OR expected_revision IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV802', MESSAGE = 'Invalid authorization role';
  END IF;
  IF EXISTS (SELECT FROM jsonb_array_elements(input -> 'grants') g
    WHERE NOT EXISTS (SELECT FROM hall.access a WHERE a.access = g ->> 'access')
      OR g ->> 'access' IN ('authorization.manage', 'installation', 'session')
      OR g ->> 'condition' IS NULL
      OR NOT hall.authorization_access_conditions(g ->> 'access') ? (g ->> 'condition'))
    OR (SELECT count(*) <> count(DISTINCT g ->> 'access') FROM jsonb_array_elements(input -> 'grants') g) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV802', MESSAGE = 'Unknown access, duplicate access or inapplicable condition';
  END IF;
  PERFORM 1 FROM hall.authorization_role WHERE id = target_role FOR UPDATE;
  before_value := hall.authorization_role_json(target_role);
  IF expected_revision = 0 AND before_value IS NULL THEN
    INSERT INTO hall.authorization_role(id, name) VALUES (target_role, btrim(input ->> 'name'));
  ELSIF before_value IS NOT NULL AND (before_value ->> 'revision')::INTEGER = expected_revision THEN
    UPDATE hall.authorization_role SET name = btrim(input ->> 'name'), revision = revision + 1 WHERE id = target_role;
  ELSE
    RAISE EXCEPTION USING ERRCODE = 'HV803', MESSAGE = 'The authorization role changed; reload it before saving';
  END IF;
  DELETE FROM hall.authorization_grant WHERE role = target_role;
  INSERT INTO hall.authorization_grant(role, access, condition)
    SELECT target_role, g ->> 'access', g ->> 'condition' FROM jsonb_array_elements(input -> 'grants') g;
  after_value := hall.authorization_role_json(target_role);
  PERFORM hall.record_audit_event('authorization-role', target_role, 'succeeded', jsonb_build_object('before', before_value, 'after', after_value));
  RETURN after_value;
END;
$$;

CREATE FUNCTION hall_api.delete_authorization_role(target_role TEXT, expected_revision INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE before_value JSONB;
BEGIN
  PERFORM hall.require_authorization_administrator();
  IF target_role = 'administrator' THEN
    RAISE EXCEPTION USING ERRCODE = 'HV801', MESSAGE = 'The built-in administrator cannot be deleted';
  END IF;
  PERFORM 1 FROM hall.authorization_role WHERE id = target_role FOR UPDATE;
  before_value := hall.authorization_role_json(target_role);
  IF before_value IS NULL OR (before_value ->> 'revision')::INTEGER IS DISTINCT FROM expected_revision THEN
    RAISE EXCEPTION USING ERRCODE = 'HV803', MESSAGE = 'The authorization role changed; reload it before deleting';
  END IF;
  DELETE FROM hall.authorization_role WHERE id = target_role;
  PERFORM hall.record_audit_event('authorization-role', target_role, 'succeeded', jsonb_build_object('before', before_value));
  RETURN before_value;
EXCEPTION WHEN foreign_key_violation THEN
  RAISE EXCEPTION USING ERRCODE = 'HV804', MESSAGE = 'Remove this role from its accounts before deleting it';
END;
$$;

ALTER FUNCTION hall.authorization_access_conditions(TEXT) OWNER TO hall_owner;
ALTER FUNCTION hall.authorization_role_json(TEXT) OWNER TO hall_owner;
ALTER FUNCTION hall.require_authorization_administrator() OWNER TO hall_owner;
ALTER FUNCTION hall_api.authorization_role_options() OWNER TO hall_owner;
ALTER FUNCTION hall_api.authorization_configuration() OWNER TO hall_owner;
ALTER FUNCTION hall_api.save_authorization_role(TEXT, JSONB) OWNER TO hall_owner;
ALTER FUNCTION hall_api.delete_authorization_role(TEXT, INTEGER) OWNER TO hall_owner;
REVOKE ALL ON FUNCTION hall.authorization_access_conditions(TEXT), hall.authorization_role_json(TEXT),
  hall.require_authorization_administrator(), hall_api.authorization_role_options(), hall_api.authorization_configuration(),
  hall_api.save_authorization_role(TEXT, JSONB), hall_api.delete_authorization_role(TEXT, INTEGER) FROM PUBLIC;
