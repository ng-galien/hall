-- @verifies-requirement HALL-FR-USR-080
-- @verifies-requirement HALL-FR-USR-090
BEGIN;
SET LOCAL search_path = hall, public;
SELECT no_plan();
CREATE TEMP TABLE link_fixture (name TEXT PRIMARY KEY, id UUID);
INSERT INTO link_fixture SELECT 'holder', (hall_api.create_app_user('holder@example.test', 'Holder', 'hash-initial', NULL, ARRAY['contributor'], true)->>'id')::uuid;
INSERT INTO link_fixture SELECT 'other', (hall_api.create_app_user('other@example.test', 'Other', 'hash-other', NULL, ARRAY['clerk'])->>'id')::uuid;
CREATE FUNCTION pg_temp.holder() RETURNS UUID LANGUAGE sql AS $$ SELECT id FROM link_fixture WHERE name = 'holder' $$;
CREATE FUNCTION pg_temp.other() RETURNS UUID LANGUAGE sql AS $$ SELECT id FROM link_fixture WHERE name = 'other' $$;

-- Lifetime and opening
SELECT is(hall_api.issue_account_password_link(pg_temp.holder(), 'invitation', 'invite-1', '2026-11-12 10:00Z')->>'outcome', 'issued', 'an active account receives an invitation link');
SELECT is((SELECT expires_at FROM hall.account_password_link WHERE token_hash = 'invite-1'), '2026-11-19 10:00Z'::timestamptz, 'an invitation link lasts seven days');
SELECT is(hall_api.open_account_password_link('invite-1', '2026-11-19 09:59Z')->>'purpose', 'invitation', 'an invitation opens until its expiry');
SELECT is(hall_api.open_account_password_link('invite-1', '2026-11-19 10:00Z'), NULL, 'an expired invitation does not open');
SELECT is(hall_api.open_account_password_link('invite-1', '2026-11-12 10:05Z')->>'email', 'holder@example.test', 'an open link names the address of its account');
SELECT is(hall_api.open_account_password_link('invite-1', '2026-11-12 10:05Z')->>'email', 'holder@example.test', 'opening a link twice does not use it');
SELECT is(hall_api.open_account_password_link('unknown', '2026-11-12 10:05Z'), NULL, 'an unknown secret opens nothing');

-- Frequency: one per minute, three per hour
SELECT is(hall_api.issue_account_password_link(pg_temp.holder(), 'recovery', 'recovery-early', '2026-11-12 10:00:30Z')->>'outcome', 'too_frequent', 'a second link within a minute is refused');
SELECT is((SELECT count(*)::int FROM hall.account_password_link WHERE user_id = pg_temp.holder()), 1, 'a refused issue stores nothing');
SELECT is(hall_api.open_account_password_link('invite-1', '2026-11-12 10:00:30Z')->>'purpose', 'invitation', 'a refused issue leaves the previous link usable');
SELECT is(hall_api.issue_account_password_link(pg_temp.holder(), 'recovery', 'recovery-1', '2026-11-12 10:02Z')->>'outcome', 'issued', 'a second link after a minute is issued');
SELECT is((SELECT expires_at FROM hall.account_password_link WHERE token_hash = 'recovery-1'), '2026-11-12 11:02Z'::timestamptz, 'a recovery link lasts one hour');
SELECT is(hall_api.open_account_password_link('invite-1', '2026-11-12 10:03Z'), NULL, 'a newer link ends the previous one');
SELECT is(hall_api.issue_account_password_link(pg_temp.holder(), 'recovery', 'recovery-2', '2026-11-12 10:04Z')->>'outcome', 'issued', 'a third link within the hour is issued');
SELECT is(hall_api.issue_account_password_link(pg_temp.holder(), 'recovery', 'recovery-3', '2026-11-12 10:30Z')->>'outcome', 'too_frequent', 'a fourth link within the hour is refused');
SELECT is((SELECT status FROM hall.app_user WHERE id = pg_temp.holder()), 'active', 'the frequency limit never disables the account');
SELECT is(hall_api.issue_account_password_link(pg_temp.other(), 'recovery', 'other-1', '2026-11-12 10:30Z')->>'outcome', 'issued', 'the limit of one account does not restrict another');

-- Completion
INSERT INTO hall.app_session (user_id, token_hash, expires_at) VALUES (pg_temp.holder(), 'holder-session', '2026-11-13 00:00Z');
SELECT is(hall_api.complete_account_password_link('recovery-1', 'hash-ended', '2026-11-12 10:31Z'), NULL, 'an ended link records no password');
SELECT is(hall_api.complete_account_password_link('recovery-2', 'hash-late', '2026-11-12 11:04Z'), NULL, 'an expired link records no password');
SELECT is((SELECT password_hash FROM hall.app_user WHERE id = pg_temp.holder()), 'hash-initial', 'a refused completion leaves the password');
SELECT is(hall_api.complete_account_password_link('recovery-2', 'hash-chosen', '2026-11-12 10:31Z')->>'email', 'holder@example.test', 'a usable link records the chosen password');
SELECT is((SELECT password_hash FROM hall.app_user WHERE id = pg_temp.holder()), 'hash-chosen', 'the chosen password replaces the previous one');
SELECT is((SELECT password_change_required FROM hall.app_user WHERE id = pg_temp.holder()), false, 'a chosen password lifts the temporary-password requirement');
SELECT is((SELECT count(*)::int FROM hall.app_session WHERE user_id = pg_temp.holder()), 0, 'a chosen password closes the sessions of the account');
SELECT is((SELECT array_agg(role ORDER BY role) FROM hall.app_user_role WHERE user_id = pg_temp.holder()), ARRAY['contributor'], 'a link does not change the roles');
SELECT is(hall_api.complete_account_password_link('recovery-2', 'hash-again', '2026-11-12 10:32Z'), NULL, 'a link records a password only once');
SELECT is(hall_api.open_account_password_link('recovery-2', '2026-11-12 10:32Z'), NULL, 'a used link no longer opens');

-- A password change and a disabled account end the links
SELECT is(hall_api.issue_account_password_link(pg_temp.holder(), 'recovery', 'recovery-4', '2026-11-12 11:10Z')->>'outcome', 'issued', 'a link is issued again once the hour has passed');
SELECT ok(hall_api.replace_app_user_password(pg_temp.holder(), 'hash-chosen', 'hash-personal'), 'a personal change replaces the password');
SELECT is(hall_api.open_account_password_link('recovery-4', '2026-11-12 11:11Z'), NULL, 'a password change ends the open links');
SELECT is(hall_api.open_account_password_link('other-1', '2026-11-12 10:35Z')->>'purpose', 'recovery', 'the link of another account stays usable');
SELECT hall_api.disable_app_user(pg_temp.other());
SELECT is(hall_api.open_account_password_link('other-1', '2026-11-12 10:35Z'), NULL, 'a disabled account has no usable link');
SELECT is(hall_api.issue_account_password_link(pg_temp.other(), 'recovery', 'other-2', '2026-11-12 12:00Z')->>'outcome', 'inactive', 'a disabled account receives no link');
SELECT is(hall_api.complete_account_password_link('other-1', 'hash-reactivated', '2026-11-12 10:36Z'), NULL, 'a link does not reactivate a disabled account');
SELECT is((SELECT status FROM hall.app_user WHERE id = pg_temp.other()), 'disabled', 'the disabled account stays disabled');

-- Account mail record
SELECT is(hall_api.open_app_user(pg_temp.holder(), false)->'account_mail', 'null'::jsonb, 'an account without account email has no record');
SELECT ok(hall_api.record_account_mail(pg_temp.holder(), 'invitation', 'failed', 'transport_not_configured', '2026-11-12 10:00Z'), 'a failed account email is recorded');
SELECT ok(hall_api.record_account_mail(pg_temp.holder(), 'recovery', 'unknown', 'transport_submission_uncertain', '2026-11-12 10:31Z'), 'an uncertain account email is recorded');
SELECT is(hall_api.open_app_user(pg_temp.holder(), false)->'account_mail', '{"kind": "recovery", "outcome": "unknown", "failure_code": "transport_submission_uncertain", "sent_at": "2026-11-12T10:31:00.000Z"}'::jsonb, 'the account shows its latest account email with its failure cause, without link');
SELECT ok(hall_api.record_account_mail(pg_temp.holder(), 'recovery', 'sent', NULL, '2026-11-12 10:40Z'), 'a sent account email is recorded');
SELECT is(hall_api.open_app_user(pg_temp.holder(), false)->'account_mail'->'failure_code', 'null'::jsonb, 'a sent account email carries no failure cause');
SELECT throws_ok($$INSERT INTO hall.account_mail (user_id, kind, outcome, failure_code, sent_at) VALUES (pg_temp.holder(), 'recovery', 'sent', 'code', now())$$, '23514', NULL, 'a sent account email carries no failure code');
SELECT ok(NOT hall_api.record_account_mail(gen_random_uuid(), 'recovery', 'sent', NULL, now()), 'an unknown account records no email');
SELECT is((SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'hall' AND table_name IN ('account_password_link', 'account_mail') AND column_name ~ '^(token|link|password|url)$'), 0, 'no clear secret, link or password column exists');
SELECT * FROM finish();
ROLLBACK;
