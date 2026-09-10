-- Council directory application surface
-- =====================================

CREATE FUNCTION hall.contact_projection(target hall.contact)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
    'id', target.id,
    'firstName', target.first_name,
    'lastName', target.last_name,
    'organizationName', target.organization_name,
    'jobTitle', target.job_title,
    'email', target.email,
    'phone', target.phone,
    'notes', target.notes,
    'archivedAt', target.archived_at,
    'createdAt', target.created_at,
    'updatedAt', target.updated_at
  )
$function$;

CREATE FUNCTION hall.council_member_projection(target hall.council_member)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
    'id', target.id,
    'contactId', target.contact,
    'councilTermId', target.council_term,
    'rank', target.rank,
    'role', target.role,
    'active', target.term_ended_on IS NULL,
    'termStartedOn', target.term_started_on,
    'termEndedOn', target.term_ended_on
  )
$function$;

-- @requirement-reference HALL-FR-DIR-020 ONE_ACTIVE_COUNCIL_TERM:
CREATE FUNCTION hall_api.get_active_council_term()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
    'id', term.id,
    'expectedMemberCount', term.expected_member_count,
    'startedOn', term.started_on
  )
  FROM hall.council_term AS term
  WHERE term.ended_on IS NULL
$function$;

CREATE FUNCTION hall_api.configure_active_council_term(member_count INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  active_term hall.council_term;
  active_member_count INTEGER;
BEGIN
  IF member_count IS NULL OR member_count <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'HV808', MESSAGE = 'Council term member count must be positive';
  END IF;

  SELECT term.*
  INTO active_term
  FROM hall.council_term AS term
  WHERE term.ended_on IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO hall.council_term (expected_member_count, started_on)
    VALUES (member_count, current_date)
    RETURNING * INTO active_term;
  ELSE
    SELECT count(*)::INTEGER
    INTO active_member_count
    FROM hall.council_member AS member
    WHERE member.term_ended_on IS NULL;

    IF active_member_count > member_count THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV805',
        MESSAGE = 'Council term member count cannot be lower than its active mandates';
    END IF;

    UPDATE hall.council_term
    SET expected_member_count = member_count
    WHERE id = active_term.id
    RETURNING * INTO active_term;
  END IF;

  RETURN jsonb_build_object(
    'id', active_term.id,
    'expectedMemberCount', active_term.expected_member_count,
    'startedOn', active_term.started_on
  );
END
$function$;

CREATE FUNCTION hall_api.list_contacts(include_archived BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(jsonb_agg(hall.contact_projection(contact) ORDER BY contact.last_name, contact.first_name, contact.id), '[]'::jsonb)
  FROM hall.contact AS contact
  WHERE include_archived OR contact.archived_at IS NULL
$function$;

CREATE FUNCTION hall_api.open_contact(target_contact UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.contact_projection(contact)
  FROM hall.contact AS contact
  WHERE contact.id = target_contact
$function$;

CREATE FUNCTION hall_api.create_contact(
  contact_first_name TEXT,
  contact_last_name TEXT,
  contact_organization_name TEXT,
  contact_job_title TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  created hall.contact;
BEGIN
  INSERT INTO hall.contact (
    first_name, last_name, organization_name, job_title, email, phone, notes
  ) VALUES (
    contact_first_name, contact_last_name, contact_organization_name,
    contact_job_title, contact_email, contact_phone, contact_notes
  ) RETURNING * INTO created;

  RETURN hall.contact_projection(created);
END
$function$;

CREATE FUNCTION hall_api.update_contact(
  target_contact UUID,
  contact_first_name TEXT,
  contact_last_name TEXT,
  contact_organization_name TEXT,
  contact_job_title TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.contact;
BEGIN
  UPDATE hall.contact
  SET first_name = contact_first_name,
      last_name = contact_last_name,
      organization_name = contact_organization_name,
      job_title = contact_job_title,
      email = contact_email,
      phone = contact_phone,
      notes = contact_notes,
      updated_at = transaction_timestamp()
  WHERE id = target_contact
    AND archived_at IS NULL
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    IF EXISTS (SELECT FROM hall.contact WHERE id = target_contact) THEN
      RAISE EXCEPTION USING ERRCODE = 'HV802', MESSAGE = 'An archived contact cannot be updated';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'HV801', MESSAGE = 'Contact not found';
  END IF;

  RETURN hall.contact_projection(changed);
END
$function$;

CREATE FUNCTION hall_api.archive_contact(target_contact UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.contact;
BEGIN
  UPDATE hall.contact
  SET archived_at = coalesce(archived_at, transaction_timestamp()),
      updated_at = CASE WHEN archived_at IS NULL THEN transaction_timestamp() ELSE updated_at END
  WHERE id = target_contact
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV801', MESSAGE = 'Contact not found';
  END IF;

  RETURN hall.contact_projection(changed);
END
$function$;

CREATE FUNCTION hall.active_council_members()
RETURNS SETOF hall.council_member LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
  SELECT member.* FROM hall.council_member member JOIN hall.council_term term ON term.id=member.council_term
  WHERE term.ended_on IS NULL AND member.term_ended_on IS NULL;
$$;

CREATE FUNCTION hall_api.list_council_members(active_only BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(jsonb_agg(hall.council_member_projection(member) ORDER BY member.rank NULLS LAST, contact.last_name, contact.first_name, member.id), '[]'::jsonb)
  FROM hall.council_member AS member
  JOIN hall.contact AS contact ON contact.id = member.contact
  WHERE NOT active_only OR member.id IN (SELECT id FROM hall.active_council_members())
$function$;

CREATE FUNCTION hall_api.open_council_member(target_member UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.council_member_projection(member)
  FROM hall.council_member AS member
  WHERE member.id = target_member
$function$;

CREATE FUNCTION hall_api.council_member_creation_available()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT EXISTS (
    SELECT
    FROM hall.council_term AS term
    WHERE term.ended_on IS NULL
      AND (
        SELECT count(*)
        FROM hall.council_member AS member
        WHERE member.term_ended_on IS NULL
      ) < term.expected_member_count
  )
$function$;

CREATE FUNCTION hall_api.create_council_member(
  target_contact UUID,
  member_role TEXT,
  mandate_started_on DATE,
  member_rank INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  active_term_id UUID;
  created hall.council_member;
BEGIN
  SELECT term.id
  INTO active_term_id
  FROM hall.council_term AS term
  WHERE term.ended_on IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV804', MESSAGE = 'An active council term is required';
  END IF;

  INSERT INTO hall.council_member (contact, council_term, role, term_started_on, rank)
  VALUES (target_contact, active_term_id, member_role::hall.council_role, mandate_started_on, member_rank)
  RETURNING * INTO created;

  RETURN hall.council_member_projection(created);
END
$function$;

CREATE FUNCTION hall_api.update_council_member(
  target_member UUID,
  member_role TEXT,
  mandate_started_on DATE,
  mandate_ended_on DATE,
  member_rank INTEGER DEFAULT NULL,
  replace_rank BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.council_member;
BEGIN
  UPDATE hall.council_member
  SET role = member_role::hall.council_role,
      term_started_on = mandate_started_on,
      term_ended_on = mandate_ended_on,
      rank = CASE WHEN replace_rank THEN member_rank ELSE rank END
  WHERE id = target_member
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV806', MESSAGE = 'Council member not found';
  END IF;

  RETURN hall.council_member_projection(changed);
END
$function$;

CREATE FUNCTION hall.council_committee_projection(target hall.council_committee)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
    'id', target.id,
    'name', target.name,
    'description', target.description,
    'archivedAt', target.archived_at,
    'createdAt', target.created_at,
    'updatedAt', target.updated_at
  )
$function$;

CREATE FUNCTION hall.committee_membership_projection(target hall.committee_membership)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
    'id', target.id,
    'committeeId', target.committee,
    'contactId', target.contact,
    'role', target.role,
    'startedOn', target.started_on,
    'endedOn', target.ended_on
  )
$function$;

-- @requirement-reference HALL-FR-DIR-080 COMMITTEE_IS_INDEPENDENT:
CREATE FUNCTION hall_api.list_council_committees(include_archived BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(
    jsonb_agg(hall.council_committee_projection(committee) ORDER BY committee.name, committee.id),
    '[]'::jsonb
  )
  FROM hall.council_committee AS committee
  WHERE include_archived OR committee.archived_at IS NULL
$function$;

CREATE FUNCTION hall_api.open_council_committee(target_committee UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.council_committee_projection(committee)
  FROM hall.council_committee AS committee
  WHERE committee.id = target_committee
$function$;

CREATE FUNCTION hall_api.create_council_committee(committee_name TEXT, committee_description TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  created hall.council_committee;
BEGIN
  INSERT INTO hall.council_committee (name, description)
  VALUES (committee_name, committee_description)
  RETURNING * INTO created;
  RETURN hall.council_committee_projection(created);
END
$function$;

CREATE FUNCTION hall_api.update_council_committee(
  target_committee UUID,
  committee_name TEXT,
  committee_description TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.council_committee;
BEGIN
  UPDATE hall.council_committee
  SET name = committee_name,
      description = committee_description,
      updated_at = transaction_timestamp()
  WHERE id = target_committee
    AND archived_at IS NULL
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    IF EXISTS (SELECT FROM hall.council_committee WHERE id = target_committee) THEN
      RAISE EXCEPTION USING ERRCODE = 'HV821', MESSAGE = 'An archived committee cannot be updated';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'HV820', MESSAGE = 'Council committee not found';
  END IF;
  RETURN hall.council_committee_projection(changed);
END
$function$;

-- @requirement-reference HALL-FR-DIR-120 CLOSURE_ENDS_MEMBERSHIPS:
CREATE FUNCTION hall_api.archive_council_committee(target_committee UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.council_committee;
BEGIN
  UPDATE hall.council_committee
  SET archived_at = coalesce(archived_at, transaction_timestamp()),
      updated_at = CASE WHEN archived_at IS NULL THEN transaction_timestamp() ELSE updated_at END
  WHERE id = target_committee
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV820', MESSAGE = 'Council committee not found';
  END IF;
  RETURN hall.council_committee_projection(changed);
END
$function$;

CREATE FUNCTION hall_api.list_committee_memberships(target_committee UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(
    jsonb_agg(hall.committee_membership_projection(membership) ORDER BY membership.started_on, membership.id),
    '[]'::jsonb
  )
  FROM hall.committee_membership AS membership
  WHERE membership.committee = target_committee
$function$;

CREATE FUNCTION hall_api.open_committee_membership(target_committee UUID, target_membership UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.committee_membership_projection(membership)
  FROM hall.committee_membership AS membership
  WHERE membership.id = target_membership
    AND membership.committee = target_committee
$function$;

CREATE FUNCTION hall_api.add_committee_membership(
  target_committee UUID,
  target_member UUID,
  membership_role TEXT,
  membership_started_on DATE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  created hall.committee_membership;
BEGIN
  INSERT INTO hall.committee_membership (committee, contact, role, started_on)
  VALUES (target_committee, target_member, membership_role::hall.committee_role, membership_started_on)
  RETURNING * INTO created;
  RETURN hall.committee_membership_projection(created);
END
$function$;

CREATE FUNCTION hall_api.update_committee_membership(
  target_committee UUID,
  target_membership UUID,
  membership_role TEXT,
  membership_started_on DATE,
  membership_ended_on DATE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.committee_membership;
BEGIN
  UPDATE hall.committee_membership
  SET role = membership_role::hall.committee_role,
      started_on = membership_started_on,
      ended_on = membership_ended_on
  WHERE id = target_membership
    AND committee = target_committee
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV824', MESSAGE = 'Committee membership not found';
  END IF;
  RETURN hall.committee_membership_projection(changed);
END
$function$;

CREATE FUNCTION hall_api.end_committee_membership(
  target_committee UUID,
  target_membership UUID,
  membership_ended_on DATE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.committee_membership;
BEGIN
  UPDATE hall.committee_membership
  SET ended_on = coalesce(ended_on, membership_ended_on)
  WHERE id = target_membership
    AND committee = target_committee
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV824', MESSAGE = 'Committee membership not found';
  END IF;
  RETURN hall.committee_membership_projection(changed);
END
$function$;
