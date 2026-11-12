-- Council directory model
-- =======================

-- @implements-requirement HALL-FR-DIR-020
CREATE TABLE hall.council_term (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expected_member_count INTEGER NOT NULL CONSTRAINT "council_term_expected_member_count_check" CHECK (expected_member_count > 0),
  started_on DATE NOT NULL,
  ended_on DATE,
  CONSTRAINT "council_term_dates_are_ordered" CHECK (ended_on IS NULL OR ended_on >= started_on)
);

CREATE UNIQUE INDEX council_term_one_active ON hall.council_term USING btree ((true)) WHERE (ended_on IS NULL);

-- @implements-requirement HALL-FR-DIR-010
CREATE TABLE hall.contact (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL CONSTRAINT "contact_first_name_check" CHECK (btrim(first_name) <> ''::text),
  last_name TEXT NOT NULL CONSTRAINT "contact_last_name_check" CHECK (btrim(last_name) <> ''::text),
  organization_name TEXT,
  job_title TEXT,
  email TEXT,
  -- Former free-text telephone: kept for one version, neither read nor written.
  phone TEXT,
  notes TEXT NOT NULL DEFAULT ''::text,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  -- @implements-requirement HALL-TR-SCH-060
  options JSONB NOT NULL DEFAULT '{}'::jsonb CONSTRAINT "contact_options_is_object" CHECK (jsonb_typeof(options) = 'object'::text),
  -- @implements-requirement HALL-FR-DIR-170
  mobile_phone TEXT,
  personal_phone TEXT,
  professional_phone TEXT,
  CONSTRAINT "contact_phone_numbers_are_normalized" CHECK ((mobile_phone IS NULL OR mobile_phone ~ '^\+(33[1-9][0-9]{8}|(?!33)[1-9][0-9]{6,14})$'::text) AND (personal_phone IS NULL OR personal_phone ~ '^\+(33[1-9][0-9]{8}|(?!33)[1-9][0-9]{6,14})$'::text) AND (professional_phone IS NULL OR professional_phone ~ '^\+(33[1-9][0-9]{8}|(?!33)[1-9][0-9]{6,14})$'::text)),
  CONSTRAINT "contact_optional_fields_are_not_blank" CHECK ((organization_name IS NULL OR btrim(organization_name) <> ''::text) AND (job_title IS NULL OR btrim(job_title) <> ''::text) AND (email IS NULL OR btrim(email) <> ''::text) AND (phone IS NULL OR btrim(phone) <> ''::text))
);

-- @implements-requirement HALL-FR-DIR-030
-- @implements-requirement HALL-FR-DIR-070
CREATE TABLE hall.council_member (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact UUID NOT NULL REFERENCES hall.contact (id) ON DELETE RESTRICT,
  council_term UUID NOT NULL REFERENCES hall.council_term (id) ON DELETE RESTRICT,
  role hall.council_role NOT NULL,
  -- @implements-requirement HALL-FR-DIR-130
  rank INTEGER CONSTRAINT "council_member_rank_check" CHECK (rank IS NULL OR rank >= 0),
  UNIQUE (council_term, rank),
  term_started_on DATE NOT NULL,
  term_ended_on DATE,
  -- @implements-requirement HALL-TR-SCH-060
  options JSONB NOT NULL DEFAULT '{}'::jsonb CONSTRAINT "council_member_options_is_object" CHECK (jsonb_typeof(options) = 'object'::text),
  CONSTRAINT "council_member_dates_are_ordered" CHECK (term_ended_on IS NULL OR term_ended_on >= term_started_on)
);

-- @implements-requirement HALL-FR-DIR-040
CREATE UNIQUE INDEX council_member_one_active_mandate_per_contact ON hall.council_member USING btree (contact) WHERE (term_ended_on IS NULL);

CREATE FUNCTION hall.enforce_active_council_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  active_term hall.council_term;
  contact_is_archived BOOLEAN;
  active_member_count INTEGER;
BEGIN
  IF NEW.term_ended_on IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- @implements-requirement HALL-TR-DIR-030
  SELECT term.*
  INTO active_term
  FROM hall.council_term AS term
  WHERE term.ended_on IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV804',
      MESSAGE = 'An active council term is required';
  END IF;

  -- @implements-requirement HALL-FR-DIR-030
  IF NEW.council_term <> active_term.id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV807',
      MESSAGE = 'An active mandate must belong to the active council term';
  END IF;

  -- @implements-requirement HALL-FR-DIR-060
  SELECT contact.archived_at IS NOT NULL
  INTO contact_is_archived
  FROM hall.contact AS contact
  WHERE contact.id = NEW.contact;

  IF contact_is_archived THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV802',
      MESSAGE = 'An archived contact cannot hold an active council mandate';
  END IF;

  -- @implements-requirement HALL-FR-DIR-050
  SELECT count(*)::INTEGER
  INTO active_member_count
  FROM hall.council_member AS member
  WHERE member.term_ended_on IS NULL
    AND member.id <> NEW.id;

  IF active_member_count >= active_term.expected_member_count THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV805',
      MESSAGE = 'The active council term has no available seat';
  END IF;

  RETURN NEW;
END
$function$;

CREATE TRIGGER council_member_enforce_active_mandate
BEFORE INSERT OR UPDATE OF contact, council_term, term_ended_on
ON hall.council_member
FOR EACH ROW
EXECUTE FUNCTION hall.enforce_active_council_member();

CREATE FUNCTION hall.enforce_contact_archive()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  -- @implements-requirement HALL-FR-DIR-060
  IF NEW.archived_at IS NOT NULL
    AND OLD.archived_at IS NULL
    AND EXISTS (
      SELECT
      FROM hall.council_member AS member
      WHERE member.contact = NEW.id
        AND member.term_ended_on IS NULL
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV803',
      MESSAGE = 'A contact with an active council mandate cannot be archived';
  END IF;

  RETURN NEW;
END
$function$;

CREATE TRIGGER contact_enforce_archive
BEFORE UPDATE OF archived_at
ON hall.contact
FOR EACH ROW
EXECUTE FUNCTION hall.enforce_contact_archive();

-- @implements-requirement HALL-FR-DIR-080
CREATE TABLE hall.council_committee (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CONSTRAINT "council_committee_name_check" CHECK (btrim(name) <> ''::text),
  description TEXT NOT NULL DEFAULT ''::text,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  -- @implements-requirement HALL-TR-SCH-060
  options JSONB NOT NULL DEFAULT '{}'::jsonb CONSTRAINT "council_committee_options_is_object" CHECK (jsonb_typeof(options) = 'object'::text)
);

CREATE UNIQUE INDEX council_committee_one_active_name ON hall.council_committee USING btree (lower(name)) WHERE (archived_at IS NULL);

-- @implements-requirement HALL-FR-DIR-090
CREATE TABLE hall.committee_membership (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  committee UUID NOT NULL REFERENCES hall.council_committee (id) ON DELETE RESTRICT,
  contact UUID NOT NULL REFERENCES hall.contact (id) ON DELETE RESTRICT,
  role hall.committee_role NOT NULL,
  started_on DATE NOT NULL,
  ended_on DATE,
  CONSTRAINT "committee_membership_dates_are_ordered" CHECK (ended_on IS NULL OR ended_on >= started_on)
);

CREATE UNIQUE INDEX committee_membership_one_active_per_member ON hall.committee_membership USING btree (committee, contact) WHERE (ended_on IS NULL);

-- @implements-requirement HALL-FR-DIR-100
CREATE FUNCTION hall.enforce_committee_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  parent_archived_at TIMESTAMPTZ;
  contact_archived_at TIMESTAMPTZ;
BEGIN
  SELECT archived_at INTO parent_archived_at
  FROM hall.council_committee WHERE id = NEW.committee FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV820', MESSAGE = 'Council committee not found';
  END IF;
  SELECT archived_at INTO contact_archived_at
  FROM hall.contact WHERE id = NEW.contact FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV801', MESSAGE = 'Contact not found';
  END IF;
  IF NEW.ended_on IS NULL AND parent_archived_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV821', MESSAGE = 'Council committee is archived';
  END IF;
  IF NEW.ended_on IS NULL AND contact_archived_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV802', MESSAGE = 'Contact is archived';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER committee_membership_enforce_invariants
BEFORE INSERT OR UPDATE OF committee, contact, started_on, ended_on
ON hall.committee_membership
FOR EACH ROW
EXECUTE FUNCTION hall.enforce_committee_membership();

CREATE FUNCTION hall.end_memberships_with_committee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  -- @implements-requirement HALL-FR-DIR-120
  IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
    UPDATE hall.committee_membership
    SET ended_on = NEW.archived_at::DATE
    WHERE committee = NEW.id
      AND ended_on IS NULL;
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER council_committee_end_memberships
AFTER UPDATE OF archived_at
ON hall.council_committee
FOR EACH ROW
EXECUTE FUNCTION hall.end_memberships_with_committee();
