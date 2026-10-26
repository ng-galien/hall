CREATE FUNCTION hall.council_meeting_action_blockers(target hall.council_meetings)
RETURNS JSONB LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
 SELECT jsonb_build_object(
  'addAgendaItem', CASE WHEN target.closed_at IS NOT NULL THEN '[{"code":"meetingClosed"}]'::jsonb
    WHEN target.started_at IS NULL THEN '[{"code":"meetingNotStarted"}]'::jsonb ELSE '[]'::jsonb END,
  'recordAttendanceEvents',
    CASE WHEN target.closed_at IS NOT NULL THEN '[{"code":"meetingClosed"}]'::jsonb
      WHEN target.started_at IS NULL AND NOT EXISTS(SELECT FROM hall.meeting_reconvocation WHERE council_meeting=target.id)
      THEN '[{"code":"meetingNotStarted"}]'::jsonb ELSE '[]'::jsonb END,
  'recordOfficerChange',
    CASE WHEN target.closed_at IS NOT NULL THEN '[{"code":"meetingClosed"}]'::jsonb
      WHEN target.started_at IS NULL THEN '[{"code":"meetingNotStarted"}]'::jsonb ELSE '[]'::jsonb END,
  'declareAuxiliaryAttendance',
    CASE WHEN target.closed_at IS NOT NULL THEN '[{"code":"meetingClosed"}]'::jsonb ELSE '[]'::jsonb END
 );
$$;

CREATE FUNCTION hall_api.meeting_conduct(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
 SELECT hall.meeting_conduct_evidence(m.id)||jsonb_build_object('councilMeetingId',m.id,'meeting',hall.council_meeting_projection(m),
   'currentAttendance',hall.current_attendance_json(m.id),
   'meetingActionBlockers', blockers.value,
   'canRecordAttendanceEvents',jsonb_array_length(blockers.value->'recordAttendanceEvents')=0,
   'currentOfficers',jsonb_build_object('chairMemberId',hall.current_meeting_officer(m.id,'chair'),
     'secretaryMemberId',hall.current_meeting_officer(m.id,'secretary')),
   'officerHandoverOptions',CASE WHEN jsonb_array_length(blockers.value->'recordOfficerChange')=0
     THEN hall.meeting_officer_handover_options(m.id) ELSE '{"chair":[],"secretary":[]}'::jsonb END,
   'canRecordOfficerChange',jsonb_array_length(blockers.value->'recordOfficerChange')=0,
   'canDeclareAuxiliaryAttendance',jsonb_array_length(blockers.value->'declareAuxiliaryAttendance')=0,
   'canRecordQuorum',m.closed_at IS NULL AND EXISTS(SELECT FROM hall.meeting_membership_record WHERE council_meeting=m.id),
   'canRecordReconvocation',m.closed_at IS NULL AND EXISTS(SELECT FROM hall.meeting_quorum_observation o
     WHERE o.council_meeting=m.id AND o.facts->>'verdict'='notMet'
       AND NOT EXISTS(SELECT FROM hall.meeting_reconvocation WHERE failed_observation=o.id)))
 FROM hall.council_meetings m CROSS JOIN LATERAL (SELECT hall.council_meeting_action_blockers(m) value) blockers WHERE m.id=target_meeting;
$$;
CREATE FUNCTION hall_api.record_meeting_attendance_events(target_meeting UUID,observation_time TIMESTAMPTZ,changes JSONB)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
DECLARE change RECORD; attendance_id UUID; holder_id UUID;
BEGIN
 PERFORM 1 FROM hall.council_meetings WHERE id=target_meeting FOR UPDATE;
 IF jsonb_typeof(changes) IS DISTINCT FROM 'array' OR jsonb_array_length(changes)=0 THEN
   RAISE EXCEPTION USING ERRCODE = 'HV104',MESSAGE='attendance changes require a nonempty array';
 END IF;
 FOR change IN SELECT * FROM jsonb_to_recordset(changes) AS c("councilMemberId" UUID,status TEXT,"proxyHolderCouncilMemberId" UUID,"proxyDocumentId" UUID) ORDER BY status='represented' LOOP
   SELECT id INTO attendance_id FROM hall.meeting_attendance WHERE council_meeting=target_meeting AND council_member=change."councilMemberId";
   holder_id:=NULL;
   IF change."proxyHolderCouncilMemberId" IS NOT NULL THEN
     SELECT id INTO holder_id FROM hall.meeting_attendance WHERE council_meeting=target_meeting AND council_member=change."proxyHolderCouncilMemberId";
     IF holder_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'HV134',MESSAGE='unknown proxy holder in this meeting'; END IF;
   END IF;
   IF attendance_id IS NULL THEN
     INSERT INTO hall.meeting_attendance(id,council_meeting,council_member,status,proxy_holder,proxy_document,declared_at)
     VALUES(gen_random_uuid(),target_meeting,change."councilMemberId",change.status::hall.meeting_attendance_status,
       holder_id,change."proxyDocumentId",observation_time) RETURNING id INTO attendance_id;
   END IF;
   INSERT INTO hall.meeting_attendance_event(meeting_attendance,observed_at,status,proxy_holder,proxy_document)
   VALUES(attendance_id,observation_time,change.status::hall.meeting_attendance_status,holder_id,change."proxyDocumentId");
 END LOOP;
 SET CONSTRAINTS meeting_attendance_event_validate_proxies IMMEDIATE;
 SET CONSTRAINTS meeting_attendance_event_validate_proxies DEFERRED;
 RETURN hall_api.meeting_conduct(target_meeting);
END $$;
CREATE FUNCTION hall_api.record_meeting_quorum(target_meeting UUID,target_item UUID,observation_time TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
BEGIN
 PERFORM hall.record_meeting_quorum(target_meeting,target_item,observation_time);
 RETURN hall_api.meeting_conduct(target_meeting);
END $$;
CREATE FUNCTION hall_api.record_meeting_reconvocation(target_meeting UUID,failure UUID,notice_sent_at TIMESTAMPTZ,
 meeting_time TIMESTAMPTZ,zone TEXT,first_evidence TEXT,renewed_evidence TEXT,items UUID[])
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
BEGIN
 INSERT INTO hall.meeting_reconvocation(council_meeting,failed_observation,sent_at,scheduled_at,time_zone,
   first_notice_evidence,renewed_notice_evidence,agenda_item_ids)
 VALUES(target_meeting,failure,notice_sent_at,meeting_time,zone,first_evidence,renewed_evidence,items);
 RETURN hall_api.meeting_conduct(target_meeting);
END $$;

-- @implements-requirement HALL-FR-MTG-330
-- @implements-requirement HALL-FR-MTG-340
CREATE FUNCTION hall_api.record_meeting_officer_change(target_meeting UUID,target_office TEXT,target_member UUID,observation_time TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
BEGIN
 IF target_office IS NULL OR target_office NOT IN ('chair','secretary') THEN
   RAISE EXCEPTION USING ERRCODE = 'HV127',MESSAGE='the office is the chair or the secretary';
 END IF;
 PERFORM hall.record_meeting_officer_change(target_meeting,target_office::hall.meeting_office,target_member,observation_time);
 RETURN hall_api.meeting_conduct(target_meeting);
END $$;

-- @implements-requirement HALL-FR-ATT-140
-- An attending person is an existing contact or a contact created from the
-- entered first and last names.
CREATE FUNCTION hall_api.declare_meeting_auxiliary_attendance(target_meeting UUID,target_contact UUID,
 contact_first_name TEXT,contact_last_name TEXT,target_quality TEXT,declaration_time TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
DECLARE person UUID:=target_contact;
BEGIN
 IF (target_contact IS NULL) = (contact_first_name IS NULL AND contact_last_name IS NULL) THEN
   RAISE EXCEPTION USING ERRCODE = 'HV128',MESSAGE='an attending person is an existing contact or a new name';
 END IF;
 IF person IS NULL THEN
   IF nullif(btrim(contact_first_name),'') IS NULL OR nullif(btrim(contact_last_name),'') IS NULL THEN
     RAISE EXCEPTION USING ERRCODE = 'HV128',MESSAGE='a new attending person requires a first and a last name';
   END IF;
   IF EXISTS(SELECT FROM hall.council_meetings WHERE id=target_meeting AND closed_at IS NOT NULL) THEN
     RAISE EXCEPTION USING ERRCODE = 'HV128',MESSAGE='the attending persons of a closed meeting are immutable';
   END IF;
   INSERT INTO hall.contact(first_name,last_name) VALUES(btrim(contact_first_name),btrim(contact_last_name)) RETURNING id INTO person;
 END IF;
 INSERT INTO hall.meeting_auxiliary_attendance(council_meeting,contact,quality,declared_at)
 VALUES(target_meeting,person,target_quality,declaration_time);
 RETURN hall_api.meeting_conduct(target_meeting);
END $$;

-- @implements-requirement HALL-FR-ATT-140
CREATE FUNCTION hall_api.update_meeting_auxiliary_attendance(target_meeting UUID,target_attendance UUID,target_quality TEXT)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
BEGIN
 UPDATE hall.meeting_auxiliary_attendance SET quality=target_quality
 WHERE id=target_attendance AND council_meeting=target_meeting;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'HV128',MESSAGE='unknown attending person in this meeting'; END IF;
 RETURN hall_api.meeting_conduct(target_meeting);
END $$;

-- @implements-requirement HALL-FR-ATT-140
CREATE FUNCTION hall_api.remove_meeting_auxiliary_attendance(target_meeting UUID,target_attendance UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
BEGIN
 DELETE FROM hall.meeting_auxiliary_attendance WHERE id=target_attendance AND council_meeting=target_meeting;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'HV128',MESSAGE='unknown attending person in this meeting'; END IF;
 RETURN hall_api.meeting_conduct(target_meeting);
END $$;
