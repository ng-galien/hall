-- @implements-requirement HALL-FR-DOC-280
-- Return the last committed text-resource change by each author. The caller
-- can only project a concrete text resource, never enumerate the audit table.
CREATE FUNCTION hall_api.list_text_resource_changes(resource_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  PERFORM hall.require_resource(resource_id, 'text');

  RETURN (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'actorId', latest.actor_id,
          'action', latest.action,
          'changedFields', coalesce(latest.details -> 'changedFields', '[]'::jsonb),
          'occurredAt', latest.occurred_at
        )
        ORDER BY latest.occurred_at DESC, latest.id DESC
      ),
      '[]'::jsonb
    )
    FROM (
      SELECT DISTINCT ON (audit.actor_id)
        audit.id, audit.actor_id, audit.action, audit.details, audit.occurred_at
      FROM hall.audit_event AS audit
      WHERE audit.target_type = 'resource'
        AND audit.target_id = resource_id::text
        AND audit.outcome = 'succeeded'
        AND audit.actor_id IS NOT NULL
        AND audit.action IN (
          'resource.updateMetadata',
          'resource.updateText',
          'resource.relocate'
        )
      ORDER BY audit.actor_id, audit.occurred_at DESC, audit.id DESC
    ) AS latest
  );
END
$function$;

ALTER FUNCTION hall_api.list_text_resource_changes(UUID) OWNER TO hall_owner;
REVOKE ALL ON FUNCTION hall_api.list_text_resource_changes(UUID) FROM PUBLIC;
