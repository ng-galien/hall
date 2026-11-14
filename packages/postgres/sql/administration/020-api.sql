-- Administration API: accounts, sessions, settings, document templates and audit journal
-- =====================================================================================
-- The server decides who may call these functions; PostgreSQL keeps the
-- invariants of the rows. Timestamps are returned as ISO 8601 UTC strings.

-- @implements-requirement HALL-TR-SCH-030
CREATE FUNCTION hall.iso_timestamp(moment TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT to_char(moment AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

CREATE FUNCTION hall.app_user_row(account hall.app_user)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object(
    'id', account.id,
    'email', account.email,
    'display_name', account.display_name,
    'password_hash', account.password_hash,
    'password_change_required', account.password_change_required,
    'status', account.status,
    'contact_id', account.contact_id,
    'roles', coalesce((SELECT jsonb_agg(assigned.role ORDER BY assigned.role) FROM hall.app_user_role assigned
      WHERE assigned.user_id = account.id), '[]'::jsonb),
    'created_at', hall.iso_timestamp(account.created_at),
    'updated_at', hall.iso_timestamp(account.updated_at),
    'account_mail', (SELECT jsonb_build_object('kind', mail.kind, 'outcome', mail.outcome,
      'failure_code', mail.failure_code, 'sent_at', hall.iso_timestamp(mail.sent_at))
      FROM hall.account_mail mail WHERE mail.user_id = account.id ORDER BY mail.sent_at DESC, mail.id DESC LIMIT 1))
$$;

-- @implements-requirement HALL-FR-USR-080
-- Every open link of the account ends: a changed password or a changed account status invalidates them.
CREATE FUNCTION hall.end_account_password_links(target UUID)
RETURNS VOID LANGUAGE sql SET search_path = pg_catalog, hall AS $$
  UPDATE hall.account_password_link SET ended_at = greatest(issued_at, transaction_timestamp())
  WHERE user_id = target AND ended_at IS NULL
$$;

CREATE FUNCTION hall_api.count_app_users()
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT count(*)::INTEGER FROM hall.app_user
$$;

CREATE FUNCTION hall_api.count_active_administrators()
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT count(*)::INTEGER FROM hall.app_user account
  JOIN hall.app_user_role assigned ON assigned.user_id = account.id
  WHERE account.status = 'active' AND assigned.role = 'administrator'
$$;

CREATE FUNCTION hall_api.lock_administrator_invariant()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('hall.active_administrator_invariant'));
  RETURN true;
END;
$$;

CREATE FUNCTION hall_api.list_app_users()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT coalesce(jsonb_agg(hall.app_user_row(account) ORDER BY account.display_name, account.email), '[]'::jsonb)
  FROM hall.app_user account
$$;

CREATE FUNCTION hall_api.open_app_user(target UUID, lock_for_update BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE account hall.app_user;
BEGIN
  IF lock_for_update THEN
    SELECT * INTO account FROM hall.app_user WHERE id = target FOR UPDATE;
  ELSE
    SELECT * INTO account FROM hall.app_user WHERE id = target;
  END IF;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN hall.app_user_row(account);
END;
$$;

CREATE FUNCTION hall_api.find_app_user_by_email(target_email TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT hall.app_user_row(account) FROM hall.app_user account WHERE account.email = target_email
$$;

CREATE FUNCTION hall_api.create_app_user(
  user_email TEXT,
  user_display_name TEXT,
  user_password_hash TEXT,
  user_contact UUID,
  user_roles TEXT[],
  require_password_change BOOLEAN DEFAULT false
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE created hall.app_user;
BEGIN
  INSERT INTO hall.app_user (email, display_name, password_hash, contact_id, password_change_required)
  VALUES (user_email, user_display_name, user_password_hash, user_contact, require_password_change)
  RETURNING * INTO created;
  INSERT INTO hall.app_user_role (user_id, role) SELECT created.id, assigned FROM unnest(user_roles) assigned;
  RETURN hall.app_user_row(created);
END;
$$;

-- The first administrator is created only while no account exists.
CREATE FUNCTION hall_api.bootstrap_app_administrator(user_email TEXT, user_display_name TEXT, user_password_hash TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE created hall.app_user;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('hall.active_administrator_invariant'));
  IF EXISTS (SELECT FROM hall.app_user) THEN RETURN NULL; END IF;
  INSERT INTO hall.app_user (email, display_name, password_hash)
  VALUES (user_email, user_display_name, user_password_hash)
  RETURNING * INTO created;
  INSERT INTO hall.app_user_role (user_id, role) VALUES (created.id, 'administrator');
  RETURN hall.app_user_row(created);
END;
$$;

CREATE FUNCTION hall_api.set_app_user_roles(target UUID, user_roles TEXT[])
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE account hall.app_user;
BEGIN
  DELETE FROM hall.app_user_role WHERE user_id = target;
  INSERT INTO hall.app_user_role (user_id, role) SELECT target, assigned FROM unnest(user_roles) assigned;
  SELECT * INTO account FROM hall.app_user WHERE id = target;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN hall.app_user_row(account);
END;
$$;

CREATE FUNCTION hall_api.update_app_user(target UUID, user_email TEXT, user_display_name TEXT, user_contact UUID, require_password_change BOOLEAN DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE account hall.app_user;
BEGIN
  -- Marking a password as temporary closes every session of the account.
  IF require_password_change AND NOT (SELECT password_change_required FROM hall.app_user WHERE id = target FOR UPDATE) THEN
    DELETE FROM hall.app_session WHERE user_id = target;
  END IF;
  UPDATE hall.app_user SET email = user_email, display_name = user_display_name, contact_id = user_contact,
    password_change_required = coalesce(require_password_change, password_change_required),
    updated_at = transaction_timestamp()
  WHERE id = target RETURNING * INTO account;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN hall.app_user_row(account);
END;
$$;

-- A replaced password closes every session of the account.
CREATE FUNCTION hall_api.replace_app_user_password(target UUID, previous_hash TEXT, new_hash TEXT, require_password_change BOOLEAN DEFAULT false)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
BEGIN
  UPDATE hall.app_user SET password_hash = new_hash,
    password_change_required = coalesce(require_password_change, password_change_required), updated_at = transaction_timestamp()
  WHERE id = target AND password_hash = previous_hash;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM hall.app_session WHERE user_id = target;
  PERFORM hall.end_account_password_links(target);
  RETURN true;
END;
$$;

-- @implements-requirement HALL-FR-USR-020
CREATE FUNCTION hall_api.reactivate_app_user(target UUID, new_hash TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE account hall.app_user;
BEGIN
  UPDATE hall.app_user SET status = 'active', password_hash = new_hash, updated_at = transaction_timestamp()
  WHERE id = target AND status = 'disabled' RETURNING * INTO account;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM hall.end_account_password_links(target);
  RETURN hall.app_user_row(account);
END;
$$;

-- @implements-requirement HALL-FR-USR-020
CREATE FUNCTION hall_api.disable_app_user(target UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE account hall.app_user;
BEGIN
  UPDATE hall.app_user SET status = 'disabled', updated_at = transaction_timestamp()
  WHERE id = target RETURNING * INTO account;
  DELETE FROM hall.app_session WHERE user_id = target;
  PERFORM hall.end_account_password_links(target);
  IF account.id IS NULL THEN RETURN NULL; END IF;
  RETURN hall.app_user_row(account);
END;
$$;

CREATE FUNCTION hall_api.create_app_session(target_user UUID, session_token_hash TEXT, session_expires_at TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE created hall.app_session;
BEGIN
  INSERT INTO hall.app_session (user_id, token_hash, expires_at)
  VALUES (target_user, session_token_hash, session_expires_at)
  RETURNING * INTO created;
  RETURN jsonb_build_object('id', created.id, 'user_id', created.user_id,
    'expires_at', hall.iso_timestamp(created.expires_at));
END;
$$;

CREATE FUNCTION hall_api.find_app_session(session_token_hash TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object('id', active.id, 'user_id', active.user_id,
    'expires_at', hall.iso_timestamp(active.expires_at))
  FROM hall.app_session active
  WHERE active.token_hash = session_token_hash AND active.expires_at > statement_timestamp()
$$;

CREATE FUNCTION hall_api.delete_app_session(target UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
BEGIN
  DELETE FROM hall.app_session WHERE id = target;
  RETURN FOUND;
END;
$$;

-- @implements-requirement HALL-FR-USR-080
-- Issues a link for an active account. The account receives at most one link per minute and three per hour,
-- whatever their purpose; a refused issue leaves the account unchanged. A new link ends the previous open ones.
-- The lifetime is one hour to recover a password and seven days for the invitation of a new account.
CREATE FUNCTION hall_api.issue_account_password_link(target UUID, link_purpose TEXT, link_token_hash TEXT, issued TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE
  account hall.app_user;
  created hall.account_password_link;
BEGIN
  SELECT * INTO account FROM hall.app_user WHERE id = target FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  IF account.status <> 'active' THEN RETURN jsonb_build_object('outcome', 'inactive'); END IF;
  IF EXISTS (SELECT FROM hall.account_password_link link WHERE link.user_id = target
      AND link.issued_at > issued - interval '1 minute')
    OR (SELECT count(*) FROM hall.account_password_link link WHERE link.user_id = target
      AND link.issued_at > issued - interval '1 hour') >= 3 THEN
    RETURN jsonb_build_object('outcome', 'too_frequent');
  END IF;
  UPDATE hall.account_password_link SET ended_at = greatest(issued_at, issued)
  WHERE user_id = target AND ended_at IS NULL;
  INSERT INTO hall.account_password_link (user_id, purpose, token_hash, issued_at, expires_at)
  VALUES (target, link_purpose, link_token_hash, issued,
    issued + CASE link_purpose WHEN 'invitation' THEN interval '7 days' ELSE interval '1 hour' END)
  RETURNING * INTO created;
  RETURN jsonb_build_object('outcome', 'issued', 'purpose', created.purpose,
    'expires_at', hall.iso_timestamp(created.expires_at), 'email', account.email,
    'display_name', account.display_name);
END;
$$;

-- @implements-requirement HALL-FR-USR-080
-- A link is usable while it has not ended, has not expired and its account is active. Opening it changes nothing.
CREATE FUNCTION hall_api.open_account_password_link(link_token_hash TEXT, opened TIMESTAMPTZ)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object('purpose', link.purpose, 'email', account.email, 'user_id', account.id)
  FROM hall.account_password_link link
  JOIN hall.app_user account ON account.id = link.user_id
  WHERE link.token_hash = link_token_hash AND link.ended_at IS NULL AND link.expires_at > opened
    AND account.status = 'active'
$$;

-- @implements-requirement HALL-FR-USR-080
-- Recording the password is the only use of a link: it replaces the password, ends every open link of the account,
-- closes its sessions and lifts a temporary-password requirement. Roles and status are not changed.
CREATE FUNCTION hall_api.complete_account_password_link(link_token_hash TEXT, new_hash TEXT, completed TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE
  link hall.account_password_link;
  account hall.app_user;
BEGIN
  SELECT * INTO link FROM hall.account_password_link WHERE token_hash = link_token_hash FOR UPDATE;
  IF NOT FOUND OR link.ended_at IS NOT NULL OR link.expires_at <= completed THEN RETURN NULL; END IF;
  UPDATE hall.app_user SET password_hash = new_hash, password_change_required = false,
    updated_at = transaction_timestamp()
  WHERE id = link.user_id AND status = 'active' RETURNING * INTO account;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE hall.account_password_link SET ended_at = greatest(issued_at, completed)
  WHERE user_id = link.user_id AND ended_at IS NULL;
  DELETE FROM hall.app_session WHERE user_id = link.user_id;
  RETURN hall.app_user_row(account);
END;
$$;

-- @implements-requirement HALL-FR-USR-090
CREATE FUNCTION hall_api.record_account_mail(target UUID, mail_kind TEXT, mail_outcome TEXT, mail_failure_code TEXT, sent TIMESTAMPTZ)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
BEGIN
  INSERT INTO hall.account_mail (user_id, kind, outcome, failure_code, sent_at)
  SELECT account.id, mail_kind, mail_outcome, mail_failure_code, sent FROM hall.app_user account WHERE account.id = target;
  RETURN FOUND;
END;
$$;

-- @implements-requirement HALL-FR-USR-080
-- The sender of account emails: the outgoing-mail settings of the commune, readable before authentication.
CREATE FUNCTION hall_api.account_mail_sender()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object('name', current_settings.name,
    'sender_name', current_settings.outbound_email_sender_name,
    'sender_address', coalesce(current_settings.outbound_email_sender_address, current_settings.email),
    'reply_to_address', current_settings.outbound_email_reply_to_address,
    'time_zone', current_settings.time_zone)
  FROM hall.settings current_settings WHERE current_settings.id = 'hall'
$$;

-- @implements-requirement HALL-TR-AUD-010
-- One audit journal: an actor is reported when the account still exists.
CREATE FUNCTION hall.audit_event_row(event hall.audit_event)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object(
    'id', event.id,
    'actor_user_id', (SELECT account.id FROM hall.app_user account WHERE account.id::TEXT = event.actor_id),
    'request_id', event.request_id,
    'action', event.action,
    'target_type', event.target_type,
    'target_id', event.target_id,
    'outcome', event.outcome,
    'details_json', event.details,
    'occurred_at', hall.iso_timestamp(event.occurred_at))
$$;

CREATE FUNCTION hall_api.list_audit_events(event_limit INTEGER)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT coalesce(jsonb_agg(hall.audit_event_row(recent) ORDER BY recent.occurred_at DESC, recent.id), '[]'::jsonb)
  FROM (SELECT * FROM hall.audit_event ORDER BY occurred_at DESC, id LIMIT event_limit) recent
$$;

CREATE FUNCTION hall_api.open_audit_event(target UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT hall.audit_event_row(event) FROM hall.audit_event event WHERE event.id = target
$$;

-- @implements-requirement HALL-FR-CFG-030
-- @implements-requirement HALL-FR-LOC-040
CREATE FUNCTION hall_api.hall_settings()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT to_jsonb(current_settings) - 'updated_at' || jsonb_build_object(
    'updated_at', hall.iso_timestamp(current_settings.updated_at),
    'meeting_locations', coalesce((SELECT jsonb_agg(location.name ORDER BY location.position)
      FROM hall.meeting_location location), '[]'::jsonb))
  FROM hall.settings current_settings WHERE current_settings.id = 'hall'
$$;

CREATE FUNCTION hall_api.update_hall_settings(submitted JSONB, locations TEXT[])
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
BEGIN
  UPDATE hall.settings SET
    name = submitted ->> 'name',
    insee_code = submitted ->> 'inseeCode',
    siren = submitted ->> 'siren',
    population = (submitted ->> 'population')::INTEGER,
    population_reference_date = submitted ->> 'populationReferenceDate',
    address_line_1 = submitted ->> 'addressLine1',
    address_line_2 = submitted ->> 'addressLine2',
    postal_code = submitted ->> 'postalCode',
    city = submitted ->> 'city',
    geographic_longitude = (submitted ->> 'geographicLongitude')::DOUBLE PRECISION,
    geographic_latitude = (submitted ->> 'geographicLatitude')::DOUBLE PRECISION,
    phone = submitted ->> 'phone',
    email = submitted ->> 'email',
    website = submitted ->> 'website',
    time_zone = submitted ->> 'timeZone',
    outbound_email_sender_name = submitted ->> 'outboundEmailSenderName',
    outbound_email_sender_address = submitted ->> 'outboundEmailSenderAddress',
    outbound_email_reply_to_address = submitted ->> 'outboundEmailReplyToAddress',
    outbound_email_signature_markdown = submitted ->> 'outboundEmailSignatureMarkdown',
    outbound_email_footer_markdown = submitted ->> 'outboundEmailFooterMarkdown',
    updated_at = transaction_timestamp()
  WHERE id = 'hall';
  IF NOT FOUND THEN RETURN NULL; END IF;
  DELETE FROM hall.meeting_location;
  INSERT INTO hall.meeting_location (position, name)
  SELECT ordinal::INTEGER, name FROM unnest(locations) WITH ORDINALITY AS submitted_location(name, ordinal);
  RETURN hall_api.hall_settings();
END;
$$;

CREATE FUNCTION hall.document_template_row(template hall.document_template)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT to_jsonb(template) - 'created_at' - 'updated_at' || jsonb_build_object(
    'created_at', hall.iso_timestamp(template.created_at),
    'updated_at', hall.iso_timestamp(template.updated_at))
$$;

-- @implements-requirement HALL-FR-CFG-020
CREATE FUNCTION hall_api.list_document_templates()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT coalesce(jsonb_agg(hall.document_template_row(template) ORDER BY template.document_type, template.kind), '[]'::jsonb)
  FROM hall.document_template template
$$;

CREATE FUNCTION hall_api.open_document_template(target UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT hall.document_template_row(template) FROM hall.document_template template WHERE template.id = target
$$;

CREATE FUNCTION hall_api.create_document_template(submitted JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE created hall.document_template;
BEGIN
  INSERT INTO hall.document_template (kind, document_type, name, body_markdown, subject, stylesheet, header_html, footer_html)
  VALUES (submitted ->> 'kind', submitted ->> 'documentType', submitted ->> 'name', submitted ->> 'bodyMarkdown',
    submitted ->> 'subject', submitted ->> 'stylesheet', submitted ->> 'headerHtml', submitted ->> 'footerHtml')
  RETURNING * INTO created;
  RETURN hall.document_template_row(created);
END;
$$;

CREATE FUNCTION hall_api.update_document_template(target UUID, submitted JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE updated hall.document_template;
BEGIN
  UPDATE hall.document_template SET kind = submitted ->> 'kind', document_type = submitted ->> 'documentType',
    name = submitted ->> 'name', body_markdown = submitted ->> 'bodyMarkdown', subject = submitted ->> 'subject',
    stylesheet = submitted ->> 'stylesheet', header_html = submitted ->> 'headerHtml',
    footer_html = submitted ->> 'footerHtml', updated_at = transaction_timestamp()
  WHERE id = target RETURNING * INTO updated;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN hall.document_template_row(updated);
END;
$$;

CREATE FUNCTION hall_api.delete_document_template(target UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
BEGIN
  DELETE FROM hall.document_template WHERE id = target;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION hall.iso_timestamp(TIMESTAMPTZ), hall.app_user_row(hall.app_user),
  hall.end_account_password_links(UUID),
  hall.audit_event_row(hall.audit_event), hall.document_template_row(hall.document_template) FROM PUBLIC;
