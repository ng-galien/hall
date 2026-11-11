-- Administration model: accounts, sessions, municipality settings and document templates
-- ======================================================================================

-- @implements-requirement HALL-TR-SCH-030
-- Accounts, sessions, settings and document templates are durable state of the
-- hall schema, reached only through hall_api functions like every other domain.

CREATE TABLE hall.app_user (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL CONSTRAINT "app_user_email_key" UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  -- @implements-requirement HALL-FR-USR-070
  password_change_required BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active'::text CONSTRAINT "app_user_status_check" CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text])),
  contact_id UUID CONSTRAINT "app_user_contact_id_key" UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  -- @implements-requirement HALL-TR-SCH-060
  options JSONB NOT NULL DEFAULT '{}'::jsonb CONSTRAINT "app_user_options_is_object" CHECK (jsonb_typeof(options) = 'object'::text)
);

CREATE INDEX app_user_by_status ON hall.app_user USING btree (status, display_name);

-- An account holds roles of the role catalogue; a role assigned to an account cannot be deleted.
CREATE TABLE hall.app_user_role (
  user_id UUID NOT NULL CONSTRAINT "app_user_role_user_id_fkey" REFERENCES hall.app_user (id) ON DELETE CASCADE,
  role TEXT NOT NULL CONSTRAINT "app_user_role_catalog" REFERENCES hall.authorization_role (id),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE hall.app_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL CONSTRAINT "app_session_user_id_fkey" REFERENCES hall.app_user (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL CONSTRAINT "app_session_token_hash_key" UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX app_session_by_user ON hall.app_session USING btree (user_id, expires_at);
CREATE INDEX app_session_by_expiry ON hall.app_session USING btree (expires_at);

-- @implements-requirement HALL-FR-CFG-030
CREATE TABLE hall.settings (
  id TEXT PRIMARY KEY CONSTRAINT "settings_singleton" CHECK (id = 'hall'::text),
  name TEXT NOT NULL DEFAULT ''::text,
  insee_code TEXT,
  siren TEXT,
  population INTEGER CONSTRAINT "settings_population_check" CHECK (population IS NULL OR population >= 0),
  population_reference_date TEXT,
  address_line_1 TEXT NOT NULL DEFAULT ''::text,
  address_line_2 TEXT NOT NULL DEFAULT ''::text,
  postal_code TEXT NOT NULL DEFAULT ''::text,
  city TEXT NOT NULL DEFAULT ''::text,
  geographic_longitude DOUBLE PRECISION,
  geographic_latitude DOUBLE PRECISION,
  phone TEXT NOT NULL DEFAULT ''::text,
  email TEXT,
  website TEXT,
  time_zone TEXT NOT NULL DEFAULT 'Europe/Paris'::text,
  outbound_email_sender_name TEXT NOT NULL DEFAULT ''::text,
  outbound_email_sender_address TEXT,
  outbound_email_reply_to_address TEXT,
  outbound_email_signature_markdown TEXT NOT NULL DEFAULT ''::text,
  outbound_email_footer_markdown TEXT NOT NULL DEFAULT ''::text,
  updated_at TIMESTAMPTZ,
  CONSTRAINT "settings_geographic_position_paired" CHECK ((geographic_longitude IS NULL) = (geographic_latitude IS NULL)),
  CONSTRAINT "settings_geographic_longitude_range" CHECK (geographic_longitude IS NULL OR geographic_longitude >= '-180'::integer::double precision AND geographic_longitude <= 180::double precision),
  CONSTRAINT "settings_geographic_latitude_range" CHECK (geographic_latitude IS NULL OR geographic_latitude >= '-90'::integer::double precision AND geographic_latitude <= 90::double precision)
);

INSERT INTO hall.settings (id) VALUES ('hall');

-- Hall's ordered venue catalogue. The first entry is the default; meetings keep their own location text.
CREATE TABLE hall.meeting_location (
  -- @implements-requirement HALL-FR-LOC-010
  hall_id TEXT NOT NULL DEFAULT 'hall'::text CONSTRAINT "meeting_location_hall_id_fkey" REFERENCES hall.settings (id)
    CONSTRAINT "meeting_location_hall_id_check" CHECK (hall_id = 'hall'::text),
  -- @implements-requirement HALL-FR-LOC-020
  position INTEGER PRIMARY KEY CONSTRAINT "meeting_location_position_check" CHECK ("position" > 0),
  -- @implements-requirement HALL-FR-LOC-030
  name TEXT NOT NULL CONSTRAINT "meeting_location_name_key" UNIQUE
    CONSTRAINT "meeting_location_name_check" CHECK (name = btrim(name) AND length(name) >= 1 AND length(name) <= 200)
);

-- @implements-requirement HALL-FR-CFG-020
CREATE TABLE hall.document_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CONSTRAINT "document_template_kind_check" CHECK (kind = ANY (ARRAY['pdf'::text, 'message'::text])),
  document_type TEXT NOT NULL,
  name TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  subject TEXT,
  stylesheet TEXT NOT NULL DEFAULT ''::text,
  header_html TEXT NOT NULL DEFAULT ''::text,
  footer_html TEXT NOT NULL DEFAULT ''::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  -- @implements-requirement HALL-TR-SCH-060
  options JSONB NOT NULL DEFAULT '{}'::jsonb CONSTRAINT "document_template_options_is_object" CHECK (jsonb_typeof(options) = 'object'::text),
  CONSTRAINT "document_template_kind_document_type_key" UNIQUE (kind, document_type),
  CONSTRAINT "document_template_subject_by_kind" CHECK (kind = 'message'::text AND subject IS NOT NULL OR kind = 'pdf'::text AND subject IS NULL),
  CONSTRAINT "document_template_presentation_by_kind" CHECK (kind = 'pdf'::text OR stylesheet = ''::text AND header_html = ''::text AND footer_html = ''::text)
);

CREATE INDEX document_template_by_document_type ON hall.document_template USING btree (document_type, kind);

CREATE INDEX audit_event_by_occurrence ON hall.audit_event USING btree (occurred_at DESC);
