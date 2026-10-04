-- @technical-requirement HALL-TR-AUD-010 AUDIT_IS_ATOMIC_WITH_COMMAND:
-- A successful command and its audit fact commit or roll back together.
CREATE TYPE hall.audit_outcome AS ENUM ('succeeded', 'denied', 'failed');

CREATE TABLE hall.audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  actor_id text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  outcome hall.audit_outcome NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CONSTRAINT "audit_event_details_check" CHECK (jsonb_typeof(details) = 'object'::text),
  occurred_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

ALTER TYPE hall.audit_outcome OWNER TO hall_owner;
ALTER TABLE hall.audit_event OWNER TO hall_owner;
REVOKE ALL ON hall.audit_event FROM PUBLIC;

CREATE FUNCTION hall.record_audit_event(
  target_type text,
  target_id text,
  outcome hall.audit_outcome,
  details jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  audit_id uuid;
  context jsonb := hall.call_context();
BEGIN
  INSERT INTO hall.audit_event (
    request_id,
    actor_id,
    action,
    target_type,
    target_id,
    outcome,
    details
  )
  VALUES (
    context ->> 'requestId',
    context ->> 'actorId',
    context ->> 'action',
    target_type,
    target_id,
    outcome,
    details
  )
  RETURNING id INTO audit_id;

  RETURN audit_id;
END
$function$;

ALTER FUNCTION hall.record_audit_event(text, text, hall.audit_outcome, jsonb) OWNER TO hall_owner;
REVOKE ALL ON FUNCTION hall.record_audit_event(text, text, hall.audit_outcome, jsonb) FROM PUBLIC;

CREATE FUNCTION hall_api.record_audit_event(
  target_type text,
  target_id text,
  outcome hall.audit_outcome,
  details jsonb
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.record_audit_event(target_type, target_id, outcome, details)
$function$;

ALTER FUNCTION hall_api.record_audit_event(text, text, hall.audit_outcome, jsonb) OWNER TO hall_owner;
REVOKE ALL ON FUNCTION hall_api.record_audit_event(text, text, hall.audit_outcome, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hall_api.record_audit_event(text, text, hall.audit_outcome, jsonb)
  TO hall_api_anonymous, hall_api_authenticated, hall_api_worker;
