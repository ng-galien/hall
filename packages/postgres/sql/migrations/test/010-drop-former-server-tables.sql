-- @implements-requirement HALL-TR-SCH-030
-- Drops the seven former server tables of schema public copied into schema hall by migration 007 and no longer read
-- or written since release 1.1.0. Before the drop, every account and every audit event of the former tables must be
-- in hall, and the settings row with it; otherwise the migration fails and the whole upgrade rolls back.
-- Roles, sessions, meeting locations and templates are not compared: they change in hall after the copy.
-- A database without these tables, a new installation or a second run, is left unchanged.
DO $migration$
DECLARE
  missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    IF EXISTS (SELECT id::UUID FROM public.users EXCEPT SELECT id FROM hall.app_user) THEN
      missing := missing || 'users'::TEXT;
    END IF;
  END IF;
  IF to_regclass('public.audit_events') IS NOT NULL THEN
    IF EXISTS (SELECT id::UUID FROM public.audit_events EXCEPT SELECT id FROM hall.audit_event) THEN
      missing := missing || 'audit_events'::TEXT;
    END IF;
  END IF;
  IF to_regclass('public.hall_settings') IS NOT NULL THEN
    IF EXISTS (SELECT id FROM public.hall_settings EXCEPT SELECT id FROM hall.settings) THEN
      missing := missing || 'hall_settings'::TEXT;
    END IF;
  END IF;
  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION 'Cannot drop the former server tables: schema hall lacks rows of %', array_to_string(missing, ', ')
      USING HINT = 'Nothing was dropped. Inspect these tables before running hall migrate again.';
  END IF;

  DROP TABLE IF EXISTS public.audit_events, public.sessions, public.user_roles, public.users, public.templates,
    public.hall_meeting_locations, public.hall_settings;
END
$migration$;
