-- @verifies-requirement HALL-FR-USR-110
BEGIN;
SET LOCAL search_path = hall, public;
SELECT no_plan();
CREATE TEMP TABLE grantor_fixture (name TEXT PRIMARY KEY, id UUID);

-- An administrator gives the administrator role at creation and by a change of roles
SET LOCAL hall.roles = '["administrator"]';
INSERT INTO grantor_fixture SELECT 'administrator', (hall_api.create_app_user('admin-two@example.test', 'Second administrator', 'hash', NULL, ARRAY['administrator'])->>'id')::uuid;
INSERT INTO grantor_fixture SELECT 'clerk', (hall_api.create_app_user('clerk@example.test', 'Clerk', 'hash', NULL, ARRAY['clerk'])->>'id')::uuid;
SELECT is(hall_api.set_app_user_roles((SELECT id FROM grantor_fixture WHERE name = 'clerk'), ARRAY['clerk', 'administrator'])->'roles', '["administrator", "clerk"]'::jsonb, 'an administrator gives the administrator role');
SELECT is(hall_api.set_app_user_roles((SELECT id FROM grantor_fixture WHERE name = 'clerk'), ARRAY['clerk'])->'roles', '["clerk"]'::jsonb, 'an administrator withdraws the administrator role');

-- An account manager without the administrator role
SET LOCAL hall.roles = '["account-manager"]';
SELECT throws_ok($$SELECT hall_api.create_app_user('self-made@example.test', 'Self made', 'hash', NULL, ARRAY['administrator'])$$, 'HV619', NULL, 'creating an administrator is refused');
SELECT is((SELECT count(*)::int FROM hall.app_user WHERE email = 'self-made@example.test'), 0, 'the refused creation records no account');
SELECT throws_ok(format($$SELECT hall_api.set_app_user_roles(%L, ARRAY['clerk', 'administrator'])$$, (SELECT id FROM grantor_fixture WHERE name = 'clerk')), 'HV619', NULL, 'giving the administrator role is refused');
SELECT throws_ok(format($$SELECT hall_api.set_app_user_roles(%L, ARRAY['contributor'])$$, (SELECT id FROM grantor_fixture WHERE name = 'administrator')), 'HV619', NULL, 'withdrawing the administrator role is refused');
SELECT is((SELECT array_agg(role ORDER BY role) FROM hall.app_user_role WHERE user_id = (SELECT id FROM grantor_fixture WHERE name = 'administrator')), ARRAY['administrator'], 'the refused withdrawal keeps the roles');
SELECT is(hall_api.set_app_user_roles((SELECT id FROM grantor_fixture WHERE name = 'administrator'), ARRAY['administrator', 'clerk'])->'roles', '["administrator", "clerk"]'::jsonb, 'another role is given to an administrator who keeps the administrator role');
SELECT is(hall_api.set_app_user_roles((SELECT id FROM grantor_fixture WHERE name = 'clerk'), ARRAY['contributor'])->'roles', '["contributor"]'::jsonb, 'the other roles are given and withdrawn');
SELECT is(hall_api.create_app_user('contributor@example.test', 'Contributor', 'hash', NULL, ARRAY['contributor'])->'roles', '["contributor"]'::jsonb, 'an account with another role is created');

SELECT * FROM finish();
ROLLBACK;
