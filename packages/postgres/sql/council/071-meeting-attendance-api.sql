-- Meeting attendance application surface
-- ======================================
--
-- The client replaces a meeting's preparation attendance set as one batch.
-- A represented member names the CouncilMember holding the proxy; this action
-- resolves that business identity to the holder's attendance row internally.

CREATE FUNCTION hall.meeting_attendance_projection(target hall.meeting_attendance)
RETURNS JSONB
LANGUAGE sql
STABLE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog, hall
AS $function$
  SELECT jsonb_build_object(
    'id', target.id,
    'councilMeetingId', target.council_meeting,
    'councilMemberId', target.council_member,
    'status', target.status,
    'proxyHolderCouncilMemberId', (
      SELECT holder.council_member
      FROM hall.meeting_attendance AS holder
      WHERE holder.id = target.proxy_holder
    ),
    'proxyDocumentId', target.proxy_document
  )
$function$;

CREATE FUNCTION hall_api.list_meeting_attendance(target_meeting UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(
    jsonb_agg(
      hall.meeting_attendance_projection(attendance)
      ORDER BY attendance.council_member
    ),
    '[]'::jsonb
  )
  FROM hall.meeting_attendance AS attendance
  WHERE attendance.council_meeting = target_meeting
$function$;

-- @implements-requirement HALL-TR-INT-070
-- Runtime roles record attendance only through this named atomic action. The
-- underlying tables remain inaccessible to them.
-- @implements-requirement HALL-TR-CON-040
-- Non-represented attendances are inserted before represented attendances in
-- the same transaction. A proxy can therefore name a holder declared in the
-- same input batch without exposing persistence identities to the caller.
-- @implements-requirement HALL-FR-MTG-300
CREATE FUNCTION hall_api.record_meeting_attendance(
  target_meeting UUID,
  attendance_declarations JSONB,
  observation_time TIMESTAMPTZ DEFAULT clock_timestamp()
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  declaration RECORD;
  declaration_status hall.meeting_attendance_status;
  holder_attendance_id UUID;
  active_term_id UUID;
  active_members UUID[];
  declared_members UUID[];
BEGIN
  IF jsonb_typeof(attendance_declarations) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV104',
      MESSAGE = 'meeting attendance declarations must be a JSON array';
  END IF;

  PERFORM 1
  FROM hall.council_meetings
  WHERE id = target_meeting
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV901',
      MESSAGE = format('unknown council meeting %s', target_meeting);
  END IF;

  SELECT id INTO active_term_id FROM hall.council_term WHERE ended_on IS NULL FOR UPDATE;
  PERFORM 1 FROM hall.council_member WHERE council_term=active_term_id AND term_ended_on IS NULL ORDER BY id FOR SHARE;
  SELECT array_agg(id ORDER BY id) INTO active_members FROM hall.active_council_members();
  SELECT array_agg(council_member_id ORDER BY council_member_id) INTO declared_members
  FROM jsonb_to_recordset(attendance_declarations) item(council_member_id UUID);
  -- @implements-requirement HALL-FR-ATT-150
  IF EXISTS(SELECT FROM unnest(declared_members) declared WHERE NOT declared=ANY(coalesce(active_members,'{}'::uuid[]))) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV150', MESSAGE = format('%s has a member attendance but holds no active mandate of the current council term',
      (SELECT coalesce(contact.first_name||' '||contact.last_name, declared::TEXT)
       FROM unnest(declared_members) declared
       LEFT JOIN hall.council_member member ON member.id=declared
       LEFT JOIN hall.contact contact ON contact.id=member.contact
       WHERE NOT declared=ANY(coalesce(active_members,'{}'::uuid[]))
       ORDER BY contact.last_name, contact.first_name, declared LIMIT 1));
  END IF;
  IF active_members IS NULL OR declared_members IS DISTINCT FROM active_members THEN
    RAISE EXCEPTION USING ERRCODE = 'HV137', MESSAGE='attendance must declare every active member of the current council term exactly once';
  END IF;
  INSERT INTO hall.meeting_membership_record(council_meeting,observed_at,source_reference,member_ids)
  VALUES(target_meeting,observation_time,'council-term:'||active_term_id::TEXT,active_members);

  -- Preparation replacement is exact; member identity follows HALL-FR-ATT-100.
  -- The payload is the complete intended set. Replacement is one transaction;
  -- the lifecycle trigger refuses this deletion after meeting start.
  DELETE FROM hall.meeting_attendance
  WHERE council_meeting = target_meeting;

  -- @implements-requirement HALL-FR-ATT-160
  -- The exceptions to the three-meeting limit follow the declared set.
  DELETE FROM hall.meeting_proxy_exception WHERE council_meeting = target_meeting;
  INSERT INTO hall.meeting_proxy_exception(council_meeting, proxy_document, basis, declared_at)
  SELECT target_meeting, item.proxy_document_id, item.proxy_exception::hall.proxy_limit_exception, observation_time
  FROM jsonb_to_recordset(attendance_declarations) AS item(status TEXT, proxy_document_id UUID, proxy_exception TEXT)
  WHERE item.status = 'represented' AND item.proxy_exception IS NOT NULL AND item.proxy_document_id IS NOT NULL;

  FOR declaration IN
    SELECT *
    FROM jsonb_to_recordset(attendance_declarations) AS item(
      council_member_id UUID,
      status TEXT,
      proxy_holder_council_member_id UUID,
      proxy_document_id UUID
    )
  LOOP
    declaration_status := declaration.status::hall.meeting_attendance_status;

    IF declaration_status = 'represented' THEN
      CONTINUE;
    END IF;

    IF declaration.proxy_holder_council_member_id IS NOT NULL OR declaration.proxy_document_id IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV104',
        MESSAGE = 'only represented attendance can carry proxy data';
    END IF;

    INSERT INTO hall.meeting_attendance (
      id,
      council_member,
      council_meeting,
      status, declared_at
    ) VALUES (
      gen_random_uuid(),
      declaration.council_member_id,
      target_meeting,
      declaration_status, observation_time
    );
  END LOOP;

  FOR declaration IN
    SELECT *
    FROM jsonb_to_recordset(attendance_declarations) AS item(
      council_member_id UUID,
      status TEXT,
      proxy_holder_council_member_id UUID,
      proxy_document_id UUID
    )
    WHERE status = 'represented'
  LOOP
    SELECT id
    INTO holder_attendance_id
    FROM hall.meeting_attendance
    WHERE council_meeting = target_meeting
      AND council_member = declaration.proxy_holder_council_member_id
      AND status = 'present';

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'HV103',
        MESSAGE = 'a proxy holder must be present in the represented member meeting';
    END IF;

    INSERT INTO hall.meeting_attendance (
      id,
      council_member,
      council_meeting,
      status,
      proxy_holder,
      proxy_document, declared_at
    ) VALUES (
      gen_random_uuid(),
      declaration.council_member_id,
      target_meeting,
      'represented',
      holder_attendance_id,
      declaration.proxy_document_id, observation_time
    );
  END LOOP;

  RETURN hall_api.list_meeting_attendance(target_meeting);
END;
$function$;
