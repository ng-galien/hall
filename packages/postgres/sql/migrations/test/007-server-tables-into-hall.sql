-- Data move for HALL-TR-SCH-030: accounts, roles, sessions, settings, meeting
-- locations, document templates and audit events of the seven former server
-- tables of schema public are copied into schema hall with their identifiers,
-- password hashes, active sessions, customizations and dates. Each copy is
-- checked against its source (same row count, same identifiers); a difference
-- fails the migration and rolls the whole upgrade back. The former tables stay
-- in place unchanged and are no longer read or written; a later migration
-- drops them. Once hall holds an account, the copy is not repeated.
DO $migration$
DECLARE
  former TEXT;
  account_contact TEXT;
  differing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  INSERT INTO hall.settings (id) VALUES ('hall') ON CONFLICT (id) DO NOTHING;

  IF to_regclass('public.users') IS NULL OR EXISTS (SELECT FROM hall.app_user) THEN
    RETURN;
  END IF;

  -- An account of a release before 1.0.4 refers to its council member instead of its contact.
  IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name = 'contact_id') THEN
    account_contact := 'NULLIF(former.contact_id, '''')::UUID';
  ELSIF EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name = 'council_member_id') THEN
    account_contact := '(SELECT member.contact FROM hall.council_member member WHERE member.id::TEXT = former.council_member_id)';
  ELSE
    account_contact := 'NULL::UUID';
  END IF;
  EXECUTE format($copy$
    INSERT INTO hall.app_user (id, email, display_name, password_hash, status, contact_id, created_at, updated_at)
    SELECT former.id::UUID, former.email, former.display_name, former.password_hash, former.status, %s,
      former.created_at::TIMESTAMPTZ, former.updated_at::TIMESTAMPTZ
    FROM public.users former
    ON CONFLICT (id) DO NOTHING
  $copy$, account_contact);

  -- The reader and meeting conductor roles of former releases became the councillor role.
  IF to_regclass('public.user_roles') IS NOT NULL THEN
    INSERT INTO hall.app_user_role (user_id, role)
    SELECT DISTINCT former.user_id::UUID,
      CASE WHEN former.role IN ('reader', 'meetingConductor') THEN 'councillor' ELSE former.role END
    FROM public.user_roles former
    JOIN hall.app_user account ON account.id = former.user_id::UUID
    JOIN hall.authorization_role catalogued
      ON catalogued.id = CASE WHEN former.role IN ('reader', 'meetingConductor') THEN 'councillor' ELSE former.role END
    ON CONFLICT DO NOTHING;
  END IF;

  IF to_regclass('public.sessions') IS NOT NULL THEN
    INSERT INTO hall.app_session (id, user_id, token_hash, created_at, expires_at)
    SELECT former.id::UUID, former.user_id::UUID, former.token_hash, former.created_at::TIMESTAMPTZ,
      former.expires_at::TIMESTAMPTZ
    FROM public.sessions former
    JOIN hall.app_user account ON account.id = former.user_id::UUID
    ON CONFLICT DO NOTHING;
  END IF;

  IF to_regclass('public.hall_settings') IS NOT NULL THEN
    UPDATE hall.settings moved SET
      name = former.name, insee_code = former.insee_code, siren = former.siren, population = former.population,
      population_reference_date = former.population_reference_date, address_line_1 = former.address_line_1,
      address_line_2 = former.address_line_2, postal_code = former.postal_code, city = former.city,
      geographic_longitude = former.geographic_longitude, geographic_latitude = former.geographic_latitude,
      phone = former.phone, email = former.email, website = former.website, time_zone = former.time_zone,
      outbound_email_sender_name = former.outbound_email_sender_name,
      outbound_email_sender_address = former.outbound_email_sender_address,
      outbound_email_reply_to_address = former.outbound_email_reply_to_address,
      updated_at = NULLIF(former.updated_at, '')::TIMESTAMPTZ
    FROM public.hall_settings former
    WHERE former.id = 'hall' AND moved.id = 'hall';
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'hall_settings'
        AND column_name = 'outbound_email_signature_markdown') THEN
      UPDATE hall.settings moved SET
        outbound_email_signature_markdown = former.outbound_email_signature_markdown,
        outbound_email_footer_markdown = former.outbound_email_footer_markdown
      FROM public.hall_settings former
      WHERE former.id = 'hall' AND moved.id = 'hall';
    END IF;
  END IF;

  IF to_regclass('public.hall_meeting_locations') IS NOT NULL THEN
    INSERT INTO hall.meeting_location (position, name)
    SELECT former.position, former.name FROM public.hall_meeting_locations former
    ON CONFLICT DO NOTHING;
  END IF;

  -- A customized template replaces the default of its type added by migration 005.
  IF to_regclass('public.templates') IS NOT NULL THEN
    DELETE FROM hall.document_template added
    USING public.templates former
    WHERE former.kind = added.kind AND former.document_type = added.document_type AND former.id::UUID <> added.id;
    INSERT INTO hall.document_template (id, kind, document_type, name, body_markdown, subject, stylesheet,
      header_html, footer_html, created_at, updated_at)
    SELECT former.id::UUID, former.kind, former.document_type, former.name, former.body_markdown, former.subject,
      former.stylesheet, former.header_html, former.footer_html, former.created_at::TIMESTAMPTZ,
      former.updated_at::TIMESTAMPTZ
    FROM public.templates former
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF to_regclass('public.audit_events') IS NOT NULL THEN
    INSERT INTO hall.audit_event (id, request_id, actor_id, action, target_type, target_id, outcome, details, occurred_at)
    SELECT former.id::UUID, former.request_id, former.actor_user_id, former.action, former.target_type,
      former.target_id, former.outcome::hall.audit_outcome,
      CASE WHEN jsonb_typeof(former.details_json) = 'object' THEN former.details_json
        ELSE jsonb_build_object('value', former.details_json) END,
      former.occurred_at::TIMESTAMPTZ
    FROM public.audit_events former
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF EXISTS (SELECT id::UUID FROM public.users EXCEPT SELECT id FROM hall.app_user)
      OR (SELECT count(*) FROM public.users) <> (SELECT count(*) FROM hall.app_user) THEN
    differing := differing || 'users'::TEXT;
  END IF;
  IF to_regclass('public.user_roles') IS NOT NULL AND (
      EXISTS (SELECT DISTINCT user_id::UUID,
          CASE WHEN role IN ('reader', 'meetingConductor') THEN 'councillor' ELSE role END FROM public.user_roles
        EXCEPT SELECT user_id, role FROM hall.app_user_role)
      OR (SELECT count(DISTINCT (user_id,
          CASE WHEN role IN ('reader', 'meetingConductor') THEN 'councillor' ELSE role END)) FROM public.user_roles)
        <> (SELECT count(*) FROM hall.app_user_role)) THEN
    differing := differing || 'user_roles'::TEXT;
  END IF;
  IF to_regclass('public.sessions') IS NOT NULL AND (
      EXISTS (SELECT id::UUID FROM public.sessions EXCEPT SELECT id FROM hall.app_session)
      OR (SELECT count(*) FROM public.sessions) <> (SELECT count(*) FROM hall.app_session)) THEN
    differing := differing || 'sessions'::TEXT;
  END IF;
  IF to_regclass('public.hall_settings') IS NOT NULL
      AND EXISTS (SELECT id FROM public.hall_settings EXCEPT SELECT id FROM hall.settings) THEN
    differing := differing || 'hall_settings'::TEXT;
  END IF;
  IF to_regclass('public.hall_meeting_locations') IS NOT NULL AND (
      EXISTS (SELECT position, name FROM public.hall_meeting_locations EXCEPT SELECT position, name FROM hall.meeting_location)
      OR (SELECT count(*) FROM public.hall_meeting_locations) <> (SELECT count(*) FROM hall.meeting_location)) THEN
    differing := differing || 'hall_meeting_locations'::TEXT;
  END IF;
  IF to_regclass('public.templates') IS NOT NULL
      AND EXISTS (SELECT id::UUID FROM public.templates EXCEPT SELECT id FROM hall.document_template) THEN
    differing := differing || 'templates'::TEXT;
  END IF;
  IF to_regclass('public.audit_events') IS NOT NULL
      AND EXISTS (SELECT id::UUID FROM public.audit_events EXCEPT SELECT id FROM hall.audit_event) THEN
    differing := differing || 'audit_events'::TEXT;
  END IF;
  IF cardinality(differing) > 0 THEN
    RAISE EXCEPTION 'Cannot move the server tables: the copy of % differs from its source', array_to_string(differing, ', ')
      USING HINT = 'Nothing was moved. Inspect these tables before running hall migrate again.';
  END IF;
END
$migration$;
