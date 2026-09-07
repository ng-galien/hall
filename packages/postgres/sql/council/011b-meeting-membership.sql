-- @functional-requirement HALL-FR-MTG-270 QUORUM_USES_CONFIRMED_MEMBERS_IN_OFFICE:
-- L2121-17 requires members actually in office, not theoretical seats or roll
-- call cardinality. Hall records the active mandates of the current council
-- term atomically with roll call, retaining the historical roster.
CREATE TABLE hall.meeting_membership_record (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  council_meeting UUID NOT NULL REFERENCES hall.council_meetings(id),
  observed_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  recorded_by TEXT NOT NULL,
  source_reference TEXT NOT NULL CHECK(btrim(source_reference)<>''),
  member_ids UUID[] NOT NULL CHECK(cardinality(member_ids)>0),
  members JSONB NOT NULL,
  UNIQUE(council_meeting,observed_at)
);
CREATE FUNCTION hall.enforce_meeting_membership_record()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE meeting hall.council_meetings;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE = 'HV135', MESSAGE='membership observations are immutable';
  END IF;
  SELECT * INTO meeting FROM hall.council_meetings WHERE id=NEW.council_meeting FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV901', MESSAGE='unknown council meeting';
  END IF;
  IF meeting.closed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV136', MESSAGE='a closed meeting cannot receive membership observations';
  END IF;
  IF NEW.observed_at > clock_timestamp()
    OR EXISTS(SELECT FROM hall.meeting_attendance_event e JOIN hall.meeting_attendance a ON a.id=e.meeting_attendance WHERE a.council_meeting=meeting.id AND e.observed_at>NEW.observed_at)
    OR EXISTS(SELECT FROM hall.meeting_membership_record WHERE council_meeting=meeting.id AND observed_at>NEW.observed_at)
    OR EXISTS(SELECT FROM hall.meeting_quorum_observation WHERE council_meeting=meeting.id AND observed_at>NEW.observed_at) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV133', MESSAGE='membership observations must follow the recorded chronology';
  END IF;
  IF cardinality(NEW.member_ids) IS DISTINCT FROM (SELECT count(DISTINCT id) FROM unnest(NEW.member_ids) id)
    OR cardinality(NEW.member_ids) IS DISTINCT FROM (SELECT count(DISTINCT contact) FROM hall.council_member WHERE id=ANY(NEW.member_ids))
    OR (SELECT count(DISTINCT council_term) FROM hall.council_member WHERE id=ANY(NEW.member_ids))<>1
  THEN
    RAISE EXCEPTION USING ERRCODE = 'HV137', MESSAGE='membership requires distinct known mandates of one council term';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('councilMemberId',m.id,'name',c.first_name||' '||c.last_name) ORDER BY m.id)
  INTO NEW.members FROM hall.council_member m JOIN hall.contact c ON c.id=m.contact WHERE m.id=ANY(NEW.member_ids);
  NEW.recorded_at:=clock_timestamp();
  NEW.recorded_by:=nullif(current_setting('hall.actor_id',true),'');
  RETURN NEW;
END $$;
CREATE TRIGGER meeting_membership_record_lifecycle
BEFORE INSERT OR UPDATE OR DELETE ON hall.meeting_membership_record
FOR EACH ROW EXECUTE FUNCTION hall.enforce_meeting_membership_record();
CREATE TRIGGER meeting_membership_record_no_truncate
BEFORE TRUNCATE ON hall.meeting_membership_record
FOR EACH STATEMENT EXECUTE FUNCTION hall.enforce_meeting_membership_record();
