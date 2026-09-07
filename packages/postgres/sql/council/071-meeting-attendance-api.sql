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

-- @technical-requirement HALL-TR-INT-070 MEETING_ATTENDANCE_WRITES_ARE_NAMED:
-- Runtime roles record attendance only through this named atomic action. The
-- underlying tables remain inaccessible to them.
-- @technical-requirement HALL-TR-CON-040 PROXY_DECLARATIONS_ARE_ATOMIC:
-- Non-represented attendances are inserted before represented attendances in
-- the same transaction. A proxy can therefore name a holder declared in the
-- same input batch without exposing persistence identities to the caller.
-- @functional-requirement HALL-FR-MTG-300 OPENING_USES_CURRENT_TERM_MEMBERS_IN_ONE_TRANSACTION:
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
