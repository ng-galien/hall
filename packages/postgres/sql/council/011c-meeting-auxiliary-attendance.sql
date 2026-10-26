-- Regulatory basis: CGCT L2121-15 paragraph 2 (version 2022-07-01) lets the
-- council add auxiliaries taken outside its members, who attend the meetings
-- without taking part in the deliberations; L2121-18 (version 1996-02-24)
-- makes the meetings public, the public being neither named nor counted.
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044190488
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006389876
CREATE TYPE hall.auxiliary_attendance_quality AS ENUM (
  'townHallSecretary',
  'auxiliarySecretary',
  'guest',
  'expert'
);

-- @implements-requirement HALL-FR-ATT-140
-- A non-member contact attending the meeting is a separate fact. It never
-- references meeting_attendance, so it cannot enter the quorum, a ballot, a
-- proxy or a recusal, which all reference member attendance or mandates.
CREATE TABLE hall.meeting_auxiliary_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  council_meeting UUID NOT NULL REFERENCES hall.council_meetings(id),
  contact UUID NOT NULL REFERENCES hall.contact(id),
  quality hall.auxiliary_attendance_quality NOT NULL,
  contact_name TEXT NOT NULL,
  declared_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  recorded_by TEXT NOT NULL,
  UNIQUE (council_meeting, contact)
);

CREATE FUNCTION hall.enforce_meeting_auxiliary_attendance()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE meeting hall.council_meetings;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE = 'HV128', MESSAGE = 'auxiliary attendance declarations are immutable';
  END IF;
  SELECT * INTO meeting FROM hall.council_meetings WHERE id = NEW.council_meeting FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV901', MESSAGE = 'unknown council meeting';
  END IF;
  IF meeting.closed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV128', MESSAGE = 'a closed meeting cannot receive an auxiliary attendance';
  END IF;
  IF NEW.declared_at IS NULL OR NEW.declared_at > clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = 'HV143', MESSAGE = 'a declaration cannot be observed in the future';
  END IF;
  SELECT contact.first_name || ' ' || contact.last_name INTO NEW.contact_name
  FROM hall.contact contact WHERE contact.id = NEW.contact AND contact.archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV128', MESSAGE = 'an auxiliary attendance requires a known unarchived contact';
  END IF;
  IF EXISTS (SELECT FROM hall.council_member member WHERE member.contact = NEW.contact AND member.term_ended_on IS NULL)
    OR EXISTS (SELECT FROM hall.meeting_attendance attendance
      JOIN hall.council_member member ON member.id = attendance.council_member
      WHERE attendance.council_meeting = NEW.council_meeting AND member.contact = NEW.contact)
  THEN
    RAISE EXCEPTION USING ERRCODE = 'HV128',
      MESSAGE = format('%s is a council member and attends as a member, not as an auxiliary', NEW.contact_name);
  END IF;
  NEW.recorded_at := clock_timestamp();
  NEW.recorded_by := nullif(current_setting('hall.actor_id', true), '');
  RETURN NEW;
END $$;
CREATE TRIGGER meeting_auxiliary_attendance_lifecycle
BEFORE INSERT OR UPDATE OR DELETE ON hall.meeting_auxiliary_attendance
FOR EACH ROW EXECUTE FUNCTION hall.enforce_meeting_auxiliary_attendance();
CREATE TRIGGER meeting_auxiliary_attendance_no_truncate
BEFORE TRUNCATE ON hall.meeting_auxiliary_attendance
FOR EACH STATEMENT EXECUTE FUNCTION hall.enforce_meeting_auxiliary_attendance();

CREATE FUNCTION hall.meeting_auxiliary_attendance_json(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'councilMeetingId', a.council_meeting,
    'contactId', a.contact, 'name', a.contact_name, 'quality', a.quality, 'declaredAt', a.declared_at,
    'recordedAt', a.recorded_at, 'recordedBy', a.recorded_by) ORDER BY a.declared_at, a.contact_name, a.id), '[]'::jsonb)
  FROM hall.meeting_auxiliary_attendance a WHERE a.council_meeting = target_meeting;
$$;
