-- @verifies-requirement HALL-FR-MIN-300
BEGIN;
SET LOCAL search_path=hall,public,pg_catalog;
SET LOCAL hall.actor_id='minutes-secretary';
SET LOCAL hall.roles='["administrator"]';
\ir support/helpers.sql
SELECT no_plan();

CREATE FUNCTION pg_temp.act_as(roles TEXT, contact UUID DEFAULT NULL)
RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('hall.roles', roles, true), set_config('hall.contact_id', coalesce(contact::TEXT, ''), true);
$$;

CREATE FUNCTION pg_temp.open_meeting(target_meeting UUID, chair UUID, secretary UUID, opened_at TIMESTAMPTZ)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE i INTEGER;
BEGIN
  FOR i IN 1..3 LOOP
    INSERT INTO meeting_attendance(id,council_member,council_meeting,status)
    VALUES(gen_random_uuid(),test_uuid('secretary:member:'||i),target_meeting,'present');
  END LOOP;
  PERFORM set_council_meeting_officers(target_meeting, chair, secretary);
  PERFORM test_confirm_declared_membership(target_meeting);
  PERFORM test_prepare_notice(target_meeting);
  PERFORM start_council_meeting(target_meeting, opened_at);
END $$;

SELECT test_ensure_council_member(test_uuid('secretary:member:'||i)) FROM generate_series(1,3) i;

-- First meeting: member 2 is designated secretary before opening, member 3 takes over during the meeting.
INSERT INTO council_meetings(id,number,scheduled_at,location)
VALUES(test_uuid('secretary:first'),1,'2026-01-01 18:00Z','Council chamber');
SELECT pg_temp.open_meeting(test_uuid('secretary:first'),test_uuid('secretary:member:1'),test_uuid('secretary:member:2'),'2026-01-01 18:00Z');
SELECT lives_ok($$SELECT record_meeting_officer_change(test_uuid('secretary:first'),'secretary',test_uuid('secretary:member:3'),'2026-01-01 18:10Z')$$,
  'the secretary is handed over during the meeting');
CREATE TEMP TABLE second_meeting AS SELECT close_council_meeting(test_uuid('secretary:first'),'2026-01-01 19:00Z') id;
CREATE TEMP TABLE first_minutes AS SELECT id FROM minutes WHERE council_meeting=test_uuid('secretary:first');

SELECT is((SELECT facts#>>'{meeting,secretary,id}' FROM minutes JOIN first_minutes USING(id)), test_uuid('secretary:member:3')::TEXT,
  'the minutes facts retain the secretary in office at closure');
SELECT is((SELECT facts#>>'{meeting,chair,id}' FROM minutes JOIN first_minutes USING(id)), test_uuid('secretary:member:1')::TEXT,
  'the minutes facts retain the chair in office at closure');

-- Second meeting: member 2 is secretary from opening to closure.
UPDATE council_meetings SET scheduled_at='2026-02-01 18:00Z', location='Council chamber' WHERE id=(SELECT id FROM second_meeting);
SELECT pg_temp.open_meeting((SELECT id FROM second_meeting),test_uuid('secretary:member:1'),test_uuid('secretary:member:2'),'2026-02-01 18:00Z');
SELECT close_council_meeting((SELECT id FROM second_meeting),'2026-02-01 19:00Z');
CREATE TEMP TABLE second_minutes AS SELECT id FROM minutes WHERE council_meeting=(SELECT id FROM second_meeting);

CREATE FUNCTION pg_temp.target(minutes_table TEXT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE result JSONB;
BEGIN
  EXECUTE format('SELECT jsonb_build_object(''minutesId'', id) FROM %I', minutes_table) INTO result;
  RETURN result;
END $$;

-- The role matrix offers the condition for this access and gives it to the councillor preset.
SELECT is(authorization_access_conditions('minutes.draft'), '["always", "minutesSecretary"]'::jsonb,
  'the minutes access offers the minutes secretary condition');
SELECT set_eq($$SELECT role, condition FROM authorization_default_grant WHERE access='minutes.draft'$$,
  $$VALUES ('administrator','always'),('clerk','always'),('councillor','minutesSecretary')$$,
  'the councillor preset drafts the minutes of the meeting it was secretary of');
SELECT is((SELECT condition FROM role_access WHERE role='councillor' AND access='minutes.draft'), 'minutesSecretary',
  'a new installation records the councillor grant');

-- The secretary in office at closure drafts and generates these minutes.
SELECT pg_temp.act_as('["councillor"]', test_uuid('secretary:member:3'));
SELECT ok(hall.allows('minutes.update-draft', pg_temp.target('first_minutes'))
  AND hall.allows('minutes.generate', pg_temp.target('first_minutes')),
  'the secretary in office at closure edits and generates the minutes of that meeting');
SELECT ok(hall_api.allowed_actions(pg_temp.target('first_minutes')) @> '["minutes.update-draft","minutes.generate"]'::jsonb,
  'the allowed actions of the secretary include the minutes actions');
SELECT ok(NOT hall.allows('minutes.update-draft', pg_temp.target('second_minutes')),
  'the same councillor does not edit the minutes of a meeting it was not secretary of');
SELECT ok(NOT hall.allows('minutes.update-draft'), 'without a minutes target the edit is refused');
SELECT ok(NOT hall.allows('minutes.update-draft', '{"minutesId":"not-a-minutes"}'), 'an unknown minutes target is refused');

-- The secretary replaced during the meeting and the chair do not draft its minutes.
SELECT pg_temp.act_as('["councillor"]', test_uuid('secretary:member:2'));
SELECT ok(NOT hall.allows('minutes.update-draft', pg_temp.target('first_minutes')),
  'the secretary replaced during the meeting no longer edits its minutes');
SELECT ok(hall.allows('minutes.generate', pg_temp.target('second_minutes')),
  'the secretary of the other meeting generates its minutes');
SELECT pg_temp.act_as('["councillor"]', test_uuid('secretary:member:1'));
SELECT ok(NOT hall.allows('minutes.update-draft', pg_temp.target('first_minutes'))
  AND NOT hall_api.allowed_actions(pg_temp.target('first_minutes')) ? 'minutes.generate',
  'another councillor, chair of the meeting, neither edits nor generates the minutes');
SELECT pg_temp.act_as('["councillor"]');
SELECT ok(NOT hall.allows('minutes.update-draft', pg_temp.target('first_minutes')),
  'a councillor account without linked contact does not edit the minutes');

-- Other presets keep their grants.
SELECT pg_temp.act_as('["contributor"]', test_uuid('secretary:member:3'));
SELECT ok(NOT hall.allows('minutes.update-draft', pg_temp.target('first_minutes')),
  'the contributor preset does not edit minutes, even as secretary');
SELECT pg_temp.act_as('["clerk"]');
SELECT ok(hall.allows('minutes.update-draft', pg_temp.target('second_minutes')), 'the secretariat edits any minutes');

SELECT * FROM finish();
ROLLBACK;
