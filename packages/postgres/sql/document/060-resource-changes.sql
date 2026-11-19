-- @implements-requirement HALL-FR-DOC-280
-- Project committed facts for one readable resource without exposing audit details.
CREATE FUNCTION hall_api.list_resource_changes(resource_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  PERFORM hall.require_resource(resource_id);

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', audit.id,
      'actorId', audit.actor_id,
      'kind', CASE
        WHEN audit.action = 'resource.createGeographicLayer'
          AND audit.details ? 'linkedGeographicLayerId' THEN 'content'
        WHEN audit.action IN ('resource.rename', 'resource.move', 'resource.relocate') THEN 'location'
        WHEN audit.action = 'resource.updateMetadata' THEN 'metadata'
        WHEN audit.action IN ('resource.updateText', 'resource.updateRemote', 'resource.updateSpreadsheet',
          'resource.updateGeographic', 'resource.updateEvent', 'resource.updateLegalReference',
          'resource.resolveLegalReference', 'resource.replaceDocumentContent',
          'resource.setGeographicMapOverlay', 'resource.removeGeographicMapOverlay') THEN 'content'
        WHEN audit.action IN ('resource.createFolder', 'resource.createText', 'resource.createRemote',
          'resource.createSpreadsheet', 'resource.createGeographic', 'resource.createEvent',
          'resource.createLegalReference', 'resource.createDocument', 'resource.createGeographicLayer',
          'resource.createGeographicFeatureNote', 'resource.createGeographicDrawnElementNote') THEN 'creation'
        ELSE 'operation'
      END,
      'changedFields', coalesce(audit.details -> 'changedFields', '[]'::jsonb),
      'occurredAt', audit.occurred_at
    ) ORDER BY audit.occurred_at DESC, audit.id DESC), '[]'::jsonb)
    FROM hall.audit_event AS audit
    WHERE audit.target_type = 'resource'
      AND audit.target_id = resource_id::text
      AND audit.outcome = 'succeeded'
  );
END
$function$;

ALTER FUNCTION hall_api.list_resource_changes(UUID) OWNER TO hall_owner;
REVOKE ALL ON FUNCTION hall_api.list_resource_changes(UUID) FROM PUBLIC;

-- @implements-requirement HALL-FR-DOC-280
-- The state a change of one resource is recorded against: name, location,
-- tags, autosave choice, folder colour and a digest of the owned content, so
-- the changed fields are found without carrying the content out of the database.
CREATE FUNCTION hall_api.resource_audit_state(resource_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
    'kind', current_state.detail ->> 'kind',
    'name', current_state.detail ->> 'name',
    'path', current_state.detail ->> 'path',
    'tags', current_state.detail -> 'tags',
    'autosaveEnabled', current_state.detail -> 'autosaveEnabled',
    'color', current_state.detail -> 'color',
    'contentDigest', md5(jsonb_build_array(
      current_state.detail -> 'content',
      current_state.detail -> 'document',
      current_state.detail -> 'target',
      current_state.detail -> 'contentSha256'
    )::text)
  )
  FROM (SELECT hall.resource_detail(resource_id) AS detail) AS current_state
$function$;

ALTER FUNCTION hall_api.resource_audit_state(UUID) OWNER TO hall_owner;
REVOKE ALL ON FUNCTION hall_api.resource_audit_state(UUID) FROM PUBLIC;
