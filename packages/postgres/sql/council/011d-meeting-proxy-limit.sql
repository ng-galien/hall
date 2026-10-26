-- Written proxy limited to three consecutive meetings
-- ===================================================
--
-- Regulatory basis: CGCT L2121-20 (version 2025-12-24): a written proxy is
-- always revocable and, except in the case of duly established illness or
-- maternity leave, cannot be valid for more than three consecutive meetings.
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053152931

CREATE TYPE hall.proxy_limit_exception AS ENUM ('illness', 'maternityLeave');

-- @implements-requirement HALL-FR-ATT-160
-- The exception declared with a representation for one meeting and one
-- written proxy. Replaced with the preparation set before the opening, kept
-- once the meeting has started.
CREATE TABLE hall.meeting_proxy_exception (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  council_meeting UUID NOT NULL REFERENCES hall.council_meetings(id),
  proxy_document UUID NOT NULL REFERENCES hall.document_resource(id),
  basis hall.proxy_limit_exception NOT NULL,
  declared_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  recorded_by TEXT NOT NULL,
  UNIQUE (council_meeting, proxy_document)
);

CREATE FUNCTION hall.enforce_meeting_proxy_exception()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE meeting hall.council_meetings;
BEGIN
  IF TG_OP = 'TRUNCATE' OR TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION USING ERRCODE = 'HV151', MESSAGE = 'a declared proxy exception is immutable';
  END IF;
  SELECT * INTO meeting FROM hall.council_meetings
  WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.council_meeting ELSE NEW.council_meeting END FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV901', MESSAGE = 'unknown council meeting';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF meeting.started_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'HV151', MESSAGE = 'a proxy exception of a started meeting is kept';
    END IF;
    RETURN OLD;
  END IF;
  IF meeting.closed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV151', MESSAGE = 'a closed meeting receives no proxy exception';
  END IF;
  NEW.recorded_at := clock_timestamp();
  NEW.recorded_by := nullif(current_setting('hall.actor_id', true), '');
  RETURN NEW;
END $$;
CREATE TRIGGER meeting_proxy_exception_lifecycle
BEFORE INSERT OR UPDATE OR DELETE ON hall.meeting_proxy_exception
FOR EACH ROW EXECUTE FUNCTION hall.enforce_meeting_proxy_exception();
CREATE TRIGGER meeting_proxy_exception_no_truncate
BEFORE TRUNCATE ON hall.meeting_proxy_exception
FOR EACH STATEMENT EXECUTE FUNCTION hall.enforce_meeting_proxy_exception();

-- @implements-requirement HALL-FR-ATT-160
-- Number of meetings immediately preceding the target meeting, in the meeting
-- sequence, in which the same written proxy justified a representation.
CREATE FUNCTION hall.proxy_document_consecutive_meetings(target_meeting UUID, document UUID)
RETURNS INTEGER LANGUAGE plpgsql STABLE SET search_path = pg_catalog, hall AS $$
DECLARE previous UUID; counted INTEGER := 0;
BEGIN
  SELECT previous_council_meeting INTO previous FROM hall.council_meetings WHERE id = target_meeting;
  WHILE previous IS NOT NULL AND (
    EXISTS (SELECT FROM hall.meeting_attendance a WHERE a.council_meeting = previous AND a.proxy_document = document)
    OR EXISTS (SELECT FROM hall.meeting_attendance_event e JOIN hall.meeting_attendance a ON a.id = e.meeting_attendance
      WHERE a.council_meeting = previous AND e.proxy_document = document))
  LOOP
    counted := counted + 1;
    SELECT previous_council_meeting INTO previous FROM hall.council_meetings WHERE id = previous;
  END LOOP;
  RETURN counted;
END $$;

-- @implements-requirement HALL-FR-ATT-160
-- A representation is refused when its written proxy already served in the
-- three preceding consecutive meetings, unless an exception is declared for
-- this meeting and this proxy.
CREATE FUNCTION hall.enforce_proxy_consecutive_limit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE target_meeting UUID;
BEGIN
  IF NEW.status <> 'represented' OR NEW.proxy_document IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'meeting_attendance' THEN
    target_meeting := NEW.council_meeting;
  ELSE
    SELECT a.council_meeting INTO target_meeting FROM hall.meeting_attendance a WHERE a.id = NEW.meeting_attendance;
  END IF;
  IF hall.proxy_document_consecutive_meetings(target_meeting, NEW.proxy_document) >= 3
    AND NOT EXISTS (SELECT FROM hall.meeting_proxy_exception x
      WHERE x.council_meeting = target_meeting AND x.proxy_document = NEW.proxy_document)
  THEN
    RAISE EXCEPTION USING ERRCODE = 'HV151',
      MESSAGE = 'a written proxy cannot be valid for more than three consecutive meetings without a declared exception';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER meeting_attendance_proxy_consecutive_limit
BEFORE INSERT ON hall.meeting_attendance
FOR EACH ROW EXECUTE FUNCTION hall.enforce_proxy_consecutive_limit();
CREATE TRIGGER meeting_attendance_event_proxy_consecutive_limit
BEFORE INSERT ON hall.meeting_attendance_event
FOR EACH ROW EXECUTE FUNCTION hall.enforce_proxy_consecutive_limit();

-- Exceptions declared with the representations, as conduct evidence.
CREATE FUNCTION hall.meeting_proxy_exception_json(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'councilMeetingId', x.council_meeting,
    'proxyDocumentId', x.proxy_document, 'basis', x.basis, 'declaredAt', x.declared_at,
    'recordedAt', x.recorded_at, 'recordedBy', x.recorded_by) ORDER BY x.declared_at, x.id), '[]'::jsonb)
  FROM hall.meeting_proxy_exception x WHERE x.council_meeting = target_meeting;
$$;
