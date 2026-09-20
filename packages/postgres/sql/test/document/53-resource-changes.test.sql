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

SELECT is(jsonb_array_length(hall_api.list_text_resource_changes(tracked)), 2,
  'the projection returns one successful latest event per author for this resource')
FROM resource_changes_fixture;
SELECT is(hall_api.list_text_resource_changes(tracked)->0->>'actorId', 'author-b',
  'the authors are ordered by their latest change descending')
FROM resource_changes_fixture;
SELECT is(hall_api.list_text_resource_changes(tracked)->1->>'action', 'resource.updateMetadata',
  'a later failed change does not replace the last successful change')
FROM resource_changes_fixture;
SELECT is(hall_api.list_text_resource_changes(tracked)->1->'changedFields', '["tags"]'::JSONB,
  'the typed change fields come from the committed audit fact')
FROM resource_changes_fixture;
SELECT is(jsonb_array_length(hall_api.list_text_resource_changes(other)), 1,
  'another resource is isolated from the requested resource')
FROM resource_changes_fixture;

SELECT throws_ok(
  format('SELECT hall_api.list_text_resource_changes(%L::uuid)', folder),
  'HV609', 'Resource kind does not match the operation',
  'a non-text resource cannot expose a text change projection'
)
FROM resource_changes_fixture;
SELECT ok(
  has_function_privilege('hall_api_authenticated', 'hall_api.list_text_resource_changes(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('hall_api_anonymous', 'hall_api.list_text_resource_changes(uuid)', 'EXECUTE'),
  'only the authenticated API role may execute the projection'
);

SELECT * FROM finish();
ROLLBACK;
