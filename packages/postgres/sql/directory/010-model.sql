-- Council directory model
-- =======================

-- @functional-requirement HALL-FR-DIR-020 ONE_ACTIVE_COUNCIL_TERM:
CREATE TABLE hall.council_term (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expected_member_count INTEGER NOT NULL CHECK (expected_member_count > 0),
  started_on DATE NOT NULL,
  ended_on DATE,
  CONSTRAINT council_term_dates_are_ordered
    CHECK (ended_on IS NULL OR ended_on >= started_on)
);

CREATE UNIQUE INDEX council_term_one_active
  ON hall.council_term ((TRUE))
  WHERE ended_on IS NULL;

-- @functional-requirement HALL-FR-DIR-010 CONTACT_EXISTS_INDEPENDENTLY:
CREATE TABLE hall.contact (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL CHECK (btrim(first_name) <> ''),
  last_name TEXT NOT NULL CHECK (btrim(last_name) <> ''),
  organization_name TEXT,
  job_title TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT NOT NULL DEFAULT '',
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT contact_optional_fields_are_not_blank CHECK (
    (organization_name IS NULL OR btrim(organization_name) <> '')
    AND (job_title IS NULL OR btrim(job_title) <> '')
    AND (email IS NULL OR btrim(email) <> '')
    AND (phone IS NULL OR btrim(phone) <> '')
  )
);

-- @requirement-reference HALL-FR-DIR-030 MEMBER_BELONGS_TO_TERM:
-- @functional-requirement HALL-FR-DIR-070 MANDATE_DATES_ARE_ORDERED:
CREATE TABLE hall.council_member (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact UUID NOT NULL REFERENCES hall.contact (id) ON DELETE RESTRICT,
  council_term UUID NOT NULL REFERENCES hall.council_term (id) ON DELETE RESTRICT,
  role hall.council_role NOT NULL,
  term_started_on DATE NOT NULL,
  term_ended_on DATE,
  CONSTRAINT council_member_dates_are_ordered
    CHECK (term_ended_on IS NULL OR term_ended_on >= term_started_on)
);

-- @functional-requirement HALL-FR-DIR-040 ONE_ACTIVE_MANDATE_PER_CONTACT:
CREATE UNIQUE INDEX council_member_one_active_mandate_per_contact
  ON hall.council_member (contact)
  WHERE term_ended_on IS NULL;

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

  -- @technical-requirement HALL-TR-DIR-030 CONCURRENT_CAPACITY_IS_SERIALIZED:
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

  -- @requirement-reference HALL-FR-DIR-030 MEMBER_BELONGS_TO_TERM:
  IF NEW.council_term <> active_term.id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV807',
      MESSAGE = 'An active mandate must belong to the active council term';
  END IF;

  -- @functional-requirement HALL-FR-DIR-060 ARCHIVED_CONTACT_HAS_NO_ACTIVE_MANDATE:
  SELECT contact.archived_at IS NOT NULL
  INTO contact_is_archived
  FROM hall.contact AS contact
  WHERE contact.id = NEW.contact;

  IF contact_is_archived THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV802',
      MESSAGE = 'An archived contact cannot hold an active council mandate';
  END IF;

  -- @functional-requirement HALL-FR-DIR-050 ACTIVE_TERM_CAPACITY_IS_ENFORCED:
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
  -- @requirement-reference HALL-FR-DIR-060 ARCHIVED_CONTACT_HAS_NO_ACTIVE_MANDATE:
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

-- @functional-requirement HALL-FR-DIR-080 COMMITTEE_IS_INDEPENDENT:
CREATE TABLE hall.council_committee (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  description TEXT NOT NULL DEFAULT '',
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp()
);

CREATE UNIQUE INDEX council_committee_one_active_name
  ON hall.council_committee (lower(name))
  WHERE archived_at IS NULL;

-- @functional-requirement HALL-FR-DIR-090 ONE_ACTIVE_COMMITTEE_MEMBERSHIP:
-- @functional-requirement HALL-FR-DIR-110 MEMBERSHIP_DATES_FIT_MANDATE:
CREATE TABLE hall.committee_membership (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  committee UUID NOT NULL REFERENCES hall.council_committee (id) ON DELETE RESTRICT,
  council_member UUID NOT NULL REFERENCES hall.council_member (id) ON DELETE RESTRICT,
  role hall.committee_role NOT NULL,
  started_on DATE NOT NULL,
  ended_on DATE,
  CONSTRAINT committee_membership_dates_are_ordered
    CHECK (ended_on IS NULL OR ended_on >= started_on)
);

CREATE UNIQUE INDEX committee_membership_one_active_per_member
  ON hall.committee_membership (committee, council_member)
  WHERE ended_on IS NULL;

CREATE FUNCTION hall.enforce_committee_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  committee_archived_at TIMESTAMPTZ;
  mandate_started_on DATE;
  mandate_ended_on DATE;
BEGIN
  SELECT committee.archived_at
  INTO committee_archived_at
  FROM hall.council_committee AS committee
  WHERE committee.id = NEW.committee;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV820', MESSAGE = 'Council committee not found';
  END IF;

  SELECT member.term_started_on, member.term_ended_on
  INTO mandate_started_on, mandate_ended_on
  FROM hall.council_member AS member
  WHERE member.id = NEW.council_member;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV806', MESSAGE = 'Council member not found';
  END IF;

  -- @functional-requirement HALL-FR-DIR-100 ACTIVE_MEMBERSHIP_REQUIRES_ACTIVE_ENTITIES:
  IF NEW.ended_on IS NULL AND committee_archived_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV821', MESSAGE = 'An archived committee cannot have an active membership';
  END IF;
  IF NEW.ended_on IS NULL AND mandate_ended_on IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV822', MESSAGE = 'An ended council mandate cannot have an active committee membership';
  END IF;

  -- @requirement-reference HALL-FR-DIR-110 MEMBERSHIP_DATES_FIT_MANDATE:
  IF NEW.started_on < mandate_started_on
    OR (mandate_ended_on IS NOT NULL AND coalesce(NEW.ended_on, mandate_ended_on + 1) > mandate_ended_on)
  THEN
    RAISE EXCEPTION USING ERRCODE = 'HV823', MESSAGE = 'Committee membership dates must fit the council mandate';
  END IF;

  RETURN NEW;
END
$function$;

CREATE TRIGGER committee_membership_enforce_invariants
BEFORE INSERT OR UPDATE OF committee, council_member, started_on, ended_on
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
  -- @functional-requirement HALL-FR-DIR-120 CLOSURE_ENDS_MEMBERSHIPS:
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

CREATE FUNCTION hall.end_memberships_with_mandate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
BEGIN
  -- @requirement-reference HALL-FR-DIR-120 CLOSURE_ENDS_MEMBERSHIPS:
  IF OLD.term_ended_on IS NULL AND NEW.term_ended_on IS NOT NULL THEN
    UPDATE hall.committee_membership
    SET ended_on = NEW.term_ended_on
    WHERE council_member = NEW.id
      AND ended_on IS NULL;
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER council_member_end_memberships
AFTER UPDATE OF term_ended_on
ON hall.council_member
FOR EACH ROW
EXECUTE FUNCTION hall.end_memberships_with_mandate();
