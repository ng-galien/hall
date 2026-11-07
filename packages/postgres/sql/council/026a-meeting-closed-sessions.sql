-- Closed session (huis clos)
-- ==========================
--
-- Regulatory basis: CGCT L2121-18 (version 1996-02-24): meetings are public;
-- on the request of three members or of the mayor, the council may decide,
-- without debate, by the absolute majority of the members present or
-- represented, to meet in closed session.
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006389876

-- @implements-requirement HALL-FR-MTG-350
-- One immutable meeting event: the request, the vote without debate and the
-- agenda items held in closed session.
CREATE TABLE hall.meeting_closed_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  council_meeting UUID NOT NULL REFERENCES hall.council_meetings(id),
  requester_member_ids UUID[] NOT NULL,
  requesters JSONB NOT NULL,
  approvals INTEGER NOT NULL CONSTRAINT "meeting_closed_session_approvals_check" CHECK (approvals >= 0),
  present_or_represented INTEGER NOT NULL,
  whole_meeting BOOLEAN NOT NULL,
  agenda_item_ids UUID[] NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  recorded_by TEXT NOT NULL
);

CREATE FUNCTION hall.enforce_meeting_closed_session()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE meeting hall.council_meetings; roster UUID[];
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE = 'HV152', MESSAGE = 'a closed session decision is immutable';
  END IF;
  SELECT * INTO meeting FROM hall.council_meetings WHERE id = NEW.council_meeting FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV901', MESSAGE = 'unknown council meeting';
  END IF;
  IF meeting.started_at IS NULL OR meeting.closed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV152', MESSAGE = 'a closed session is decided during an ongoing meeting';
  END IF;
  IF NEW.observed_at IS NULL OR NEW.observed_at < meeting.started_at THEN
    RAISE EXCEPTION USING ERRCODE = 'HV133', MESSAGE = 'a closed session must follow the recorded chronology';
  END IF;
  -- The request: the mayor, or three distinct members, physically present.
  IF NEW.requester_member_ids IS NULL
    OR cardinality(NEW.requester_member_ids) <> (SELECT count(DISTINCT member) FROM unnest(NEW.requester_member_ids) member)
    OR NOT (cardinality(NEW.requester_member_ids) = 3
      OR cardinality(NEW.requester_member_ids) = 1
        AND EXISTS (SELECT FROM hall.council_member WHERE id = NEW.requester_member_ids[1] AND role = 'mayor'))
    OR EXISTS (SELECT FROM unnest(NEW.requester_member_ids) member
      WHERE NOT hall.meeting_member_is_physically_present(meeting.id, member))
  THEN
    RAISE EXCEPTION USING ERRCODE = 'HV152', MESSAGE = 'a closed session is requested by the mayor or by three members physically present';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('councilMemberId', member.id, 'name', contact.first_name || ' ' || contact.last_name)
    ORDER BY array_position(NEW.requester_member_ids, member.id))
  INTO NEW.requesters
  FROM hall.council_member member JOIN hall.contact contact ON contact.id = member.contact
  WHERE member.id = ANY(NEW.requester_member_ids);
  -- The vote without debate: absolute majority of the members present or
  -- represented in the opening roster.
  SELECT member_ids INTO roster FROM hall.meeting_membership_record
  WHERE council_meeting = meeting.id ORDER BY observed_at DESC LIMIT 1;
  SELECT count(*) INTO NEW.present_or_represented FROM hall.current_meeting_attendance(meeting.id) attendance
  WHERE attendance.status IN ('present', 'represented') AND attendance.council_member = ANY(coalesce(roster, '{}'::uuid[]));
  IF NEW.approvals > NEW.present_or_represented OR NEW.approvals * 2 <= NEW.present_or_represented THEN
    RAISE EXCEPTION USING ERRCODE = 'HV152',
      MESSAGE = format('a closed session requires the absolute majority of the %s members present or represented', NEW.present_or_represented);
  END IF;
  -- The scope: the whole meeting covers every agenda item not yet completed.
  IF NEW.whole_meeting THEN
    NEW.agenda_item_ids := ARRAY(SELECT item.id FROM hall.council_agenda_item item
      WHERE item.council_meeting = meeting.id AND item.position > 0 AND item.completed_at IS NULL ORDER BY item.position);
  ELSIF cardinality(coalesce(NEW.agenda_item_ids, '{}'::uuid[])) = 0
    OR EXISTS (SELECT FROM unnest(NEW.agenda_item_ids) target
      WHERE NOT EXISTS (SELECT FROM hall.council_agenda_item item WHERE item.id = target
        AND item.council_meeting = meeting.id AND item.position > 0 AND item.completed_at IS NULL))
  THEN
    RAISE EXCEPTION USING ERRCODE = 'HV152', MESSAGE = 'a closed session designates agenda items of this meeting not yet completed';
  END IF;
  NEW.recorded_at := clock_timestamp();
  NEW.recorded_by := nullif(current_setting('hall.actor_id', true), '');
  RETURN NEW;
END $$;
CREATE TRIGGER meeting_closed_session_lifecycle
BEFORE INSERT OR UPDATE OR DELETE ON hall.meeting_closed_session
FOR EACH ROW EXECUTE FUNCTION hall.enforce_meeting_closed_session();
CREATE TRIGGER meeting_closed_session_no_truncate
BEFORE TRUNCATE ON hall.meeting_closed_session
FOR EACH STATEMENT EXECUTE FUNCTION hall.enforce_meeting_closed_session();

CREATE FUNCTION hall.meeting_closed_session_json(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'councilMeetingId', s.council_meeting,
    'requesters', s.requesters, 'approvals', s.approvals, 'presentOrRepresented', s.present_or_represented,
    'wholeMeeting', s.whole_meeting, 'agendaItemIds', to_jsonb(s.agenda_item_ids), 'observedAt', s.observed_at,
    'recordedAt', s.recorded_at, 'recordedBy', s.recorded_by) ORDER BY s.observed_at, s.id), '[]'::jsonb)
  FROM hall.meeting_closed_session s WHERE s.council_meeting = target_meeting;
$$;
