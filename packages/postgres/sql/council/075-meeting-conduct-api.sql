CREATE FUNCTION hall.council_meeting_action_blockers(target hall.council_meetings)
RETURNS JSONB LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
 SELECT jsonb_build_object(
  'addAgendaItem', CASE WHEN target.closed_at IS NOT NULL THEN '[{"code":"meetingClosed"}]'::jsonb
    WHEN target.started_at IS NULL THEN '[{"code":"meetingNotStarted"}]'::jsonb ELSE '[]'::jsonb END,
  'recordAttendanceEvents',
    CASE WHEN target.closed_at IS NOT NULL THEN '[{"code":"meetingClosed"}]'::jsonb
      WHEN target.started_at IS NULL AND NOT EXISTS(SELECT FROM hall.meeting_reconvocation WHERE council_meeting=target.id)
      THEN '[{"code":"meetingNotStarted"}]'::jsonb ELSE '[]'::jsonb END
 );
$$;

CREATE FUNCTION hall_api.meeting_conduct(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
 SELECT hall.meeting_conduct_evidence(m.id)||jsonb_build_object('councilMeetingId',m.id,'meeting',hall.council_meeting_projection(m),
   'currentAttendance',hall.current_attendance_json(m.id),
   'meetingActionBlockers', blockers.value,
   'canRecordAttendanceEvents',jsonb_array_length(blockers.value->'recordAttendanceEvents')=0,
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
