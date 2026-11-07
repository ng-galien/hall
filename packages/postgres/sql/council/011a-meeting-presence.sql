-- Opening attendance is retained. Later observations never rewrite it.
-- @implements-requirement HALL-FR-ATT-120
CREATE TABLE hall.meeting_attendance_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_attendance UUID NOT NULL REFERENCES hall.meeting_attendance(id),
  observed_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  recorded_by TEXT NOT NULL,
  status hall.meeting_attendance_status NOT NULL,
  proxy_holder UUID REFERENCES hall.meeting_attendance(id),
  proxy_document UUID REFERENCES hall.document_resource(id),
  CONSTRAINT "meeting_attendance_event_check" CHECK (status = 'represented'::hall.meeting_attendance_status AND proxy_holder IS NOT NULL AND proxy_document IS NOT NULL OR status <> 'represented'::hall.meeting_attendance_status AND proxy_holder IS NULL AND proxy_document IS NULL),
  CONSTRAINT "meeting_attendance_event_check1" CHECK (proxy_holder IS NULL OR proxy_holder <> meeting_attendance),
  UNIQUE(meeting_attendance, observed_at)
);

CREATE FUNCTION hall.current_meeting_attendance(target_meeting UUID)
RETURNS TABLE(id UUID, council_member UUID, status hall.meeting_attendance_status,
  proxy_holder UUID, proxy_document UUID, observed_at TIMESTAMPTZ)
LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT attendance.id, attendance.council_member,
    coalesce(event.status, attendance.status),
    CASE WHEN event.id IS NULL THEN attendance.proxy_holder ELSE event.proxy_holder END,
    CASE WHEN event.id IS NULL THEN attendance.proxy_document ELSE event.proxy_document END,
    coalesce(event.observed_at,attendance.declared_at)
  FROM hall.meeting_attendance attendance
  LEFT JOIN LATERAL (
    SELECT * FROM hall.meeting_attendance_event event
    WHERE event.meeting_attendance = attendance.id
    ORDER BY observed_at DESC LIMIT 1
  ) event ON true
  WHERE attendance.council_meeting = target_meeting;
$$;

CREATE FUNCTION hall.enforce_meeting_attendance_event()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE meeting hall.council_meetings; last_observation TIMESTAMPTZ;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE = 'HV131', MESSAGE='attendance observations are immutable';
  END IF;
  SELECT m.* INTO meeting FROM hall.council_meetings m
  JOIN hall.meeting_attendance a ON a.council_meeting=m.id
  WHERE a.id=NEW.meeting_attendance FOR UPDATE OF m;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV903', MESSAGE='unknown meeting attendance';
  END IF;
  IF meeting.closed_at IS NOT NULL OR meeting.started_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV132', MESSAGE='attendance movements require an ongoing meeting';
  END IF;
  SELECT max(event.observed_at) INTO last_observation
  FROM hall.meeting_attendance_event event JOIN hall.meeting_attendance a ON a.id=event.meeting_attendance
  WHERE a.council_meeting=meeting.id;
  IF NEW.observed_at < greatest(meeting.started_at,last_observation)
    OR EXISTS(SELECT FROM hall.meeting_quorum_observation WHERE council_meeting=meeting.id AND observed_at>NEW.observed_at) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV133', MESSAGE='attendance movements must follow the recorded chronology';
  END IF;
  NEW.recorded_at:=clock_timestamp();
  NEW.recorded_by:=nullif(current_setting('hall.actor_id',true),'');
  RETURN NEW;
END $$;
CREATE TRIGGER meeting_attendance_event_lifecycle
BEFORE INSERT OR UPDATE OR DELETE ON hall.meeting_attendance_event
FOR EACH ROW EXECUTE FUNCTION hall.enforce_meeting_attendance_event();
CREATE TRIGGER meeting_attendance_event_no_truncate
BEFORE TRUNCATE ON hall.meeting_attendance_event
FOR EACH STATEMENT EXECUTE FUNCTION hall.enforce_meeting_attendance_event();

-- @implements-requirement HALL-FR-ATT-130
-- A holder departure suspends voting eligibility without fabricating a written
-- power revocation. The current eligibility authority checks physical presence.
-- Deferred validation rejects dangling holders and competing current powers.
CREATE FUNCTION hall.enforce_current_meeting_proxies()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE target_meeting UUID;
BEGIN
  SELECT council_meeting INTO target_meeting FROM hall.meeting_attendance WHERE id=NEW.meeting_attendance;
  IF EXISTS(
    SELECT FROM hall.current_meeting_attendance(target_meeting) represented
    LEFT JOIN hall.current_meeting_attendance(target_meeting) holder ON holder.id=represented.proxy_holder
    WHERE represented.status='represented' AND holder.id IS NULL
  ) OR EXISTS(
    SELECT proxy_holder FROM hall.current_meeting_attendance(target_meeting)
    WHERE status='represented' GROUP BY proxy_holder HAVING count(*)>1
  ) OR EXISTS(
    SELECT proxy_document FROM hall.current_meeting_attendance(target_meeting)
    WHERE status='represented' GROUP BY proxy_document HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV134', MESSAGE='current powers require a known holder and unique written evidence';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER meeting_attendance_event_validate_proxies
AFTER INSERT ON hall.meeting_attendance_event DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION hall.enforce_current_meeting_proxies();

CREATE FUNCTION hall.current_attendance_json(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'councilMemberId',a.council_member,
   'status',a.status,'proxyHolderAttendanceId',a.proxy_holder,'proxyDocumentId',a.proxy_document,'observedAt',a.observed_at) ORDER BY a.id),'[]'::jsonb)
 FROM hall.current_meeting_attendance(target_meeting) a;
$$;
