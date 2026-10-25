BEGIN;
SET LOCAL search_path = hall, hall_api, public, pg_catalog;
SET LOCAL hall.roles = '["administrator"]';
SELECT no_plan();

-- @verifies-requirement HALL-FR-DOC-280
CREATE TEMP TABLE resource_changes_fixture AS
SELECT
  (hall_api.create_text_resource('', 'tracked-note', 'first') ->> 'id')::UUID AS tracked,
  (hall_api.create_text_resource('', 'other-note', 'first') ->> 'id')::UUID AS other,
  (hall_api.create_folder('', 'not-a-text') ->> 'id')::UUID AS folder;

INSERT INTO hall.audit_event(request_id, actor_id, action, target_type, target_id, outcome, details, occurred_at)
SELECT 'older', 'author-a', 'resource.updateText', 'resource', tracked::TEXT, 'succeeded',
  '{"changedFields":["content"]}'::JSONB, '2026-01-01 09:00Z'::TIMESTAMPTZ
FROM resource_changes_fixture;
INSERT INTO hall.audit_event(request_id, actor_id, action, target_type, target_id, outcome, details, occurred_at)
SELECT 'latest-a', 'author-a', 'resource.updateMetadata', 'resource', tracked::TEXT, 'succeeded',
  '{"changedFields":["tags"]}'::JSONB, '2026-01-01 10:00Z'::TIMESTAMPTZ
FROM resource_changes_fixture;
INSERT INTO hall.audit_event(request_id, actor_id, action, target_type, target_id, outcome, details, occurred_at)
SELECT 'latest-b', 'author-b', 'resource.relocate', 'resource', tracked::TEXT, 'succeeded',
  '{"changedFields":["name"]}'::JSONB, '2026-01-01 11:00Z'::TIMESTAMPTZ
FROM resource_changes_fixture;
INSERT INTO hall.audit_event(request_id, actor_id, action, target_type, target_id, outcome, details, occurred_at)
SELECT 'failed-a', 'author-a', 'resource.updateText', 'resource', tracked::TEXT, 'failed',
  '{"changedFields":["content"]}'::JSONB, '2026-01-01 12:00Z'::TIMESTAMPTZ
FROM resource_changes_fixture;
INSERT INTO hall.audit_event(request_id, actor_id, action, target_type, target_id, outcome, details, occurred_at)
SELECT 'other-resource', 'author-c', 'resource.updateText', 'resource', other::TEXT, 'succeeded',
  '{"changedFields":["content"]}'::JSONB, '2026-01-01 13:00Z'::TIMESTAMPTZ
FROM resource_changes_fixture;

SELECT is(jsonb_array_length(hall_api.list_resource_changes(tracked)), 3,
  'the projection returns every successful event, including repeated authors for this resource')
FROM resource_changes_fixture;
SELECT is(hall_api.list_resource_changes(tracked)->0->>'actorId', 'author-b',
  'the authors are ordered by their latest change descending')
FROM resource_changes_fixture;
SELECT is(hall_api.list_resource_changes(tracked)->1->>'kind', 'metadata',
  'a later failed change does not replace the last successful change')
FROM resource_changes_fixture;
SELECT is(hall_api.list_resource_changes(tracked)->1->'changedFields', '["tags"]'::JSONB,
  'the typed change fields come from the committed audit fact')
FROM resource_changes_fixture;
SELECT is(jsonb_array_length(hall_api.list_resource_changes(other)), 1,
  'another resource is isolated from the requested resource')
FROM resource_changes_fixture;

INSERT INTO hall.audit_event(request_id, actor_id, action, target_type, target_id, outcome, details)
SELECT 'folder-change', NULL, 'resource.rename', 'resource', folder::TEXT, 'succeeded',
  '{"changedFields":["name"]}'::JSONB FROM resource_changes_fixture;
SELECT is(jsonb_array_length(hall_api.list_resource_changes(folder)), 1,
  'non-text resources expose their recorded history including an unknown actor') FROM resource_changes_fixture;
SELECT is(hall_api.list_resource_changes(folder)->0->'actorId', 'null'::JSONB,
  'an unrecorded author is not fabricated') FROM resource_changes_fixture;
SELECT is(hall_api.list_resource_changes(tracked)->2->>'kind', 'content',
  'an earlier event from the same author is retained') FROM resource_changes_fixture;
SELECT ok(hall_api.list_resource_changes(tracked)->0 ? 'id',
  'each fact has a stable event identity') FROM resource_changes_fixture;
SELECT ok(
  has_function_privilege('hall_api_authenticated', 'hall_api.list_resource_changes(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('hall_api_anonymous', 'hall_api.list_resource_changes(uuid)', 'EXECUTE'),
  'only the authenticated API role may execute the projection'
);

INSERT INTO hall.audit_event(request_id, actor_id, action, target_type, target_id, outcome, details, occurred_at)
SELECT 'link-created-layer', 'author-a', 'resource.createGeographicLayer', 'resource', other::TEXT, 'succeeded',
  '{"linkedGeographicLayerId":"recorded-layer","visible":true}'::JSONB, '2026-01-02 09:00Z'::TIMESTAMPTZ
FROM resource_changes_fixture;
SELECT is(hall_api.list_resource_changes(other)->0->>'kind', 'content',
  'linking a new geographic layer modifies the existing map rather than creating it')
FROM resource_changes_fixture;

SELECT * FROM finish();
ROLLBACK;
