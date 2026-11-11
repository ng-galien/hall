-- @implements-requirement HALL-FR-EML-010
-- @implements-requirement HALL-FR-EML-030
-- @implements-requirement HALL-FR-EML-040
-- @implements-requirement HALL-FR-EML-060
CREATE TABLE hall.mail_message (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    body_markdown text DEFAULT ''::text NOT NULL,
    source jsonb DEFAULT '{"kind": "free"}'::jsonb NOT NULL,
    created_by text NOT NULL,
    updated_by text NOT NULL,
    created_at timestamp with time zone DEFAULT transaction_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT transaction_timestamp() NOT NULL,
    CONSTRAINT mail_message_created_by_check CHECK ((btrim(created_by) <> ''::text)),
    CONSTRAINT mail_message_revision_check CHECK ((revision > 0)),
    CONSTRAINT "mail_message_source_check" CHECK (jsonb_typeof(source) = 'object'::text AND ((source ->> 'kind'::text) = ANY (ARRAY['free'::text, 'notice'::text, 'event'::text]))),
    CONSTRAINT mail_message_subject_check CHECK ((subject !~ '[
]'::text)),
    CONSTRAINT mail_message_updated_by_check CHECK ((btrim(updated_by) <> ''::text))
);

CREATE TABLE hall.mail_recipient_group (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_by text NOT NULL,
    updated_by text NOT NULL,
    created_at timestamp with time zone DEFAULT transaction_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT transaction_timestamp() NOT NULL,
    CONSTRAINT mail_recipient_group_created_by_check CHECK ((btrim(created_by) <> ''::text)),
    CONSTRAINT mail_recipient_group_name_check CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT mail_recipient_group_revision_check CHECK ((revision > 0)),
    CONSTRAINT mail_recipient_group_updated_by_check CHECK ((btrim(updated_by) <> ''::text))
);

CREATE TABLE hall.mail_submission (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    revision integer NOT NULL,
    request_key uuid NOT NULL,
    status text DEFAULT 'submitting'::text NOT NULL,
    requested_by text NOT NULL,
    started_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    finished_at timestamp with time zone,
    payload jsonb NOT NULL,
    error_code text,
    verification_outcome text,
    verification_notes text,
    verified_by text,
    verified_at timestamp with time zone,
    CONSTRAINT mail_submission_check CHECK (((status = 'submitting'::text) = (finished_at IS NULL))),
    CONSTRAINT "mail_submission_check1" CHECK (verification_outcome IS NULL AND verification_notes IS NULL AND verified_by IS NULL AND verified_at IS NULL OR status = 'unknown'::text AND verification_outcome IS NOT NULL AND verification_notes IS NOT NULL AND btrim(verification_notes) <> ''::text AND verified_by IS NOT NULL AND verified_at IS NOT NULL),
    CONSTRAINT mail_submission_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text)),
    CONSTRAINT mail_submission_requested_by_check CHECK ((btrim(requested_by) <> ''::text)),
    CONSTRAINT mail_submission_revision_check CHECK ((revision > 0)),
    CONSTRAINT mail_submission_status_check CHECK ((status = ANY (ARRAY['submitting'::text, 'accepted'::text, 'failed'::text, 'unknown'::text]))),
    CONSTRAINT mail_submission_verification_outcome_check CHECK ((verification_outcome = ANY (ARRAY['sent'::text, 'not-sent'::text])))
);

CREATE TABLE hall.mail_attachment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    file_name text NOT NULL,
    binary_object_id uuid NOT NULL,
    resource_id uuid,
    created_at timestamp with time zone DEFAULT transaction_timestamp() NOT NULL,
    CONSTRAINT mail_attachment_file_name_check CHECK ((btrim(file_name) <> ''::text))
);

CREATE TABLE hall.mail_recipient (
    message_id uuid NOT NULL,
    "position" integer NOT NULL,
    kind text NOT NULL,
    name text NOT NULL,
    address text NOT NULL,
    contact_id uuid,
    CONSTRAINT mail_recipient_kind_check CHECK ((kind = ANY (ARRAY['to'::text, 'cc'::text, 'bcc'::text]))),
    CONSTRAINT mail_recipient_position_check CHECK (("position" >= 0))
);

CREATE TABLE hall.mail_recipient_group_member (
    group_id uuid NOT NULL,
    "position" integer NOT NULL,
    contact_id uuid,
    name text NOT NULL,
    address text NOT NULL,
    CONSTRAINT mail_recipient_group_member_position_check CHECK (("position" >= 0))
);

CREATE TABLE hall.mail_submission_attachment (
    submission_id uuid NOT NULL,
    attachment_id uuid NOT NULL,
    file_name text NOT NULL,
    binary_object_id uuid NOT NULL
);

ALTER TABLE ONLY hall.mail_attachment
    ADD CONSTRAINT mail_attachment_pkey PRIMARY KEY (id);

ALTER TABLE ONLY hall.mail_message
    ADD CONSTRAINT mail_message_pkey PRIMARY KEY (id);

ALTER TABLE ONLY hall.mail_recipient_group_member
    ADD CONSTRAINT mail_recipient_group_member_pkey PRIMARY KEY (group_id, "position");

ALTER TABLE ONLY hall.mail_recipient_group
    ADD CONSTRAINT mail_recipient_group_pkey PRIMARY KEY (id);

ALTER TABLE ONLY hall.mail_recipient
    ADD CONSTRAINT mail_recipient_pkey PRIMARY KEY (message_id, "position");

ALTER TABLE ONLY hall.mail_submission_attachment
    ADD CONSTRAINT mail_submission_attachment_pkey PRIMARY KEY (submission_id, attachment_id);

ALTER TABLE ONLY hall.mail_submission
    ADD CONSTRAINT mail_submission_message_id_request_key_key UNIQUE (message_id, request_key);

ALTER TABLE ONLY hall.mail_submission
    ADD CONSTRAINT mail_submission_pkey PRIMARY KEY (id);

ALTER TABLE ONLY hall.mail_attachment
    ADD CONSTRAINT mail_attachment_binary_object_id_fkey FOREIGN KEY (binary_object_id) REFERENCES hall.binary_object(id) ON DELETE RESTRICT;

ALTER TABLE ONLY hall.mail_attachment
    ADD CONSTRAINT mail_attachment_message_id_fkey FOREIGN KEY (message_id) REFERENCES hall.mail_message(id) ON DELETE CASCADE;

ALTER TABLE ONLY hall.mail_attachment
    ADD CONSTRAINT mail_attachment_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES hall.resource(id) ON DELETE SET NULL;

ALTER TABLE ONLY hall.mail_recipient
    ADD CONSTRAINT mail_recipient_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES hall.contact(id) ON DELETE SET NULL;

ALTER TABLE ONLY hall.mail_recipient_group_member
    ADD CONSTRAINT mail_recipient_group_member_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES hall.contact(id) ON DELETE SET NULL;

ALTER TABLE ONLY hall.mail_recipient_group_member
    ADD CONSTRAINT mail_recipient_group_member_group_id_fkey FOREIGN KEY (group_id) REFERENCES hall.mail_recipient_group(id) ON DELETE CASCADE;

ALTER TABLE ONLY hall.mail_recipient
    ADD CONSTRAINT mail_recipient_message_id_fkey FOREIGN KEY (message_id) REFERENCES hall.mail_message(id) ON DELETE CASCADE;

ALTER TABLE ONLY hall.mail_submission_attachment
    ADD CONSTRAINT mail_submission_attachment_binary_object_id_fkey FOREIGN KEY (binary_object_id) REFERENCES hall.binary_object(id) ON DELETE RESTRICT;

ALTER TABLE ONLY hall.mail_submission_attachment
    ADD CONSTRAINT mail_submission_attachment_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES hall.mail_submission(id) ON DELETE RESTRICT;

ALTER TABLE ONLY hall.mail_submission
    ADD CONSTRAINT mail_submission_message_id_fkey FOREIGN KEY (message_id) REFERENCES hall.mail_message(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX mail_one_unresolved_submission ON hall.mail_submission USING btree (message_id) WHERE ((status = ANY (ARRAY['submitting'::text, 'accepted'::text])) OR ((status = 'unknown'::text) AND (verification_outcome IS DISTINCT FROM 'not-sent'::text)));

CREATE FUNCTION hall.guard_mail_submission_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (NEW.id, NEW.message_id, NEW.revision, NEW.request_key, NEW.requested_by, NEW.started_at, NEW.payload)
    IS DISTINCT FROM (OLD.id, OLD.message_id, OLD.revision, OLD.request_key, OLD.requested_by, OLD.started_at, OLD.payload) THEN
    RAISE EXCEPTION USING ERRCODE='23000', MESSAGE='Mail submission payload is immutable';
  END IF;
  IF OLD.status <> 'submitting' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION USING ERRCODE='23000', MESSAGE='Mail submission outcome is immutable';
  END IF;
  IF OLD.verified_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION USING ERRCODE='23000', MESSAGE='Outlook verification is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER mail_submission_snapshot BEFORE UPDATE OR DELETE ON hall.mail_submission
  FOR EACH ROW EXECUTE FUNCTION hall.guard_mail_submission_snapshot();

CREATE FUNCTION hall.guard_mail_attachment_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='23000', MESSAGE='Mail submission attachments are immutable';
END $$;
CREATE TRIGGER mail_submission_attachment_snapshot BEFORE UPDATE OR DELETE ON hall.mail_submission_attachment
  FOR EACH ROW EXECUTE FUNCTION hall.guard_mail_attachment_snapshot();
