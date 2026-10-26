-- Ballot chair and officer handovers
-- ==================================
--
-- Regulatory basis (versions in force on 2026-10-26):
-- CGCT L2121-20 (2025-12-24): on an equal division, except in a secret ballot,
-- the voice of the chair prevails.
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053152931
-- CGCT L2121-14 (2026-01-01): the council is chaired by the mayor and, failing
-- him, by his replacement.
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051731835
-- CGCT L2131-11 (2025-12-24): an interested member takes no part in the
-- deliberation, therefore does not chair the item.
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053153029

-- @implements-requirement HALL-FR-BAL-140
-- The ballot chair is the chair in office, never chosen per ballot: the chair
-- designated before opening or assigned by the latest handover.
CREATE FUNCTION hall.agenda_item_ballot_chair(target_item UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = pg_catalog, hall AS $$
DECLARE item hall.council_agenda_item; member UUID;
BEGIN
  SELECT * INTO item FROM hall.council_agenda_item WHERE id = target_item;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV904', MESSAGE = 'unknown council agenda item';
  END IF;
  member := hall.current_meeting_officer(item.council_meeting, 'chair');
  RETURN jsonb_build_object('councilMemberId', member,
    'meetingAttendanceId', (SELECT a.id FROM hall.meeting_attendance a WHERE a.council_meeting = item.council_meeting AND a.council_member = member),
    'physicallyPresent', member IS NOT NULL AND hall.meeting_member_is_physically_present(item.council_meeting, member),
    'recused', member IS NOT NULL AND EXISTS (SELECT FROM hall.agenda_item_recusal r
      WHERE r.agenda_item = target_item AND r.council_member = member));
END $$;

-- @implements-requirement HALL-FR-BAL-340
-- @implements-requirement HALL-FR-MTG-330
-- A ballot needs the chair in office physically present and not recused on
-- the item, and the secretary in office physically present. A recused or
-- departed chair blocks the ballot until a chair is assigned in the handover
-- form.
CREATE FUNCTION hall.agenda_item_ballot_officer_blockers(target_item UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = pg_catalog, hall AS $$
DECLARE item hall.council_agenda_item; chair JSONB; secretary UUID; blockers JSONB := '[]';
BEGIN
  SELECT * INTO item FROM hall.council_agenda_item WHERE id = target_item;
  chair := hall.agenda_item_ballot_chair(target_item);
  IF (chair->>'recused')::BOOLEAN THEN
    blockers := blockers || jsonb_build_array(jsonb_build_object('code', 'ballotChairRecused',
      'councilMemberId', chair->>'councilMemberId'));
  ELSIF NOT (chair->>'physicallyPresent')::BOOLEAN THEN
    blockers := blockers || jsonb_build_array(jsonb_build_object('code', 'ballotChairNotPresent',
      'councilMemberId', chair->>'councilMemberId'));
  END IF;
  secretary := hall.current_meeting_officer(item.council_meeting, 'secretary');
  IF secretary IS NULL OR NOT hall.meeting_member_is_physically_present(item.council_meeting, secretary) THEN
    blockers := blockers || jsonb_build_array(jsonb_build_object('code', 'meetingSecretaryNotPresent',
      'councilMemberId', secretary));
  END IF;
  RETURN blockers;
END $$;

-- @implements-requirement HALL-FR-BAL-340
CREATE FUNCTION hall.require_ballot_officers(target_item UUID)
RETURNS UUID LANGUAGE plpgsql STABLE SET search_path = pg_catalog, hall AS $$
DECLARE blockers JSONB := hall.agenda_item_ballot_officer_blockers(target_item);
BEGIN
  IF blockers @> '[{"code":"ballotChairRecused"}]' THEN
    RAISE EXCEPTION USING ERRCODE = 'HV415', MESSAGE = 'the chair in office is recused on this item; assign a chair in the handover form';
  END IF;
  IF jsonb_array_length(blockers) > 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'HV415', MESSAGE = 'the ballot chair and the meeting secretary must be physically present';
  END IF;
  RETURN (hall.agenda_item_ballot_chair(target_item)->>'meetingAttendanceId')::UUID;
END $$;

-- @implements-requirement HALL-FR-MTG-330
-- @implements-requirement HALL-FR-MTG-340
CREATE FUNCTION hall.enforce_meeting_officer_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE meeting hall.council_meetings;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE = 'HV127', MESSAGE = 'meeting officer events are immutable';
  END IF;
  SELECT * INTO meeting FROM hall.council_meetings WHERE id = NEW.council_meeting FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV901', MESSAGE = 'unknown council meeting';
  END IF;
  IF meeting.started_at IS NULL OR meeting.closed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV127', MESSAGE = 'an officer event requires an ongoing meeting';
  END IF;
  IF NEW.observed_at IS NULL OR NEW.observed_at > clock_timestamp() OR NEW.observed_at < meeting.started_at
    OR EXISTS (SELECT FROM hall.meeting_attendance_event e JOIN hall.meeting_attendance a ON a.id = e.meeting_attendance
      WHERE a.council_meeting = meeting.id AND e.observed_at > NEW.observed_at)
    OR EXISTS (SELECT FROM hall.meeting_officer_change c WHERE c.council_meeting = meeting.id AND c.observed_at > NEW.observed_at)
  THEN
    RAISE EXCEPTION USING ERRCODE = 'HV133', MESSAGE = 'officer events must follow the recorded chronology';
  END IF;
  SELECT contact.first_name || ' ' || contact.last_name INTO NEW.member_name
  FROM hall.council_member member JOIN hall.contact contact ON contact.id = member.contact
  WHERE member.id = NEW.council_member;
  IF NOT hall.meeting_member_is_physically_present(meeting.id, NEW.council_member) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV127', MESSAGE = format('%s is not physically present', coalesce(NEW.member_name, NEW.council_member::TEXT));
  END IF;
  IF NOT EXISTS (
    SELECT FROM hall.meeting_chair_handover_options(meeting.id) option
    WHERE NEW.office = 'chair' AND option.council_member = NEW.council_member AND option.basis = NEW.basis
    UNION ALL
    SELECT FROM hall.meeting_secretary_handover_options(meeting.id) option
    WHERE NEW.office = 'secretary' AND option.council_member = NEW.council_member AND option.basis = NEW.basis)
  THEN
    RAISE EXCEPTION USING ERRCODE = 'HV127',
      MESSAGE = format('%s cannot take over the %s of the meeting', coalesce(NEW.member_name, NEW.council_member::TEXT), NEW.office);
  END IF;
  NEW.recorded_at := clock_timestamp();
  NEW.recorded_by := nullif(current_setting('hall.actor_id', true), '');
  RETURN NEW;
END $$;
CREATE TRIGGER meeting_officer_change_lifecycle
BEFORE INSERT OR UPDATE OR DELETE ON hall.meeting_officer_change
FOR EACH ROW EXECUTE FUNCTION hall.enforce_meeting_officer_change();
CREATE TRIGGER meeting_officer_change_no_truncate
BEFORE TRUNCATE ON hall.meeting_officer_change
FOR EACH STATEMENT EXECUTE FUNCTION hall.enforce_meeting_officer_change();

-- Named action of the handover form: the caller names the office and the
-- member; the basis is derived from the member's mandate.
CREATE FUNCTION hall.record_meeting_officer_change(target_meeting UUID, target_office hall.meeting_office,
  target_member UUID, observation_time TIMESTAMPTZ)
RETURNS hall.meeting_officer_change LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, hall AS $$
DECLARE change hall.meeting_officer_change; derived hall.meeting_officer_basis;
BEGIN
  PERFORM 1 FROM hall.council_meetings WHERE id = target_meeting FOR UPDATE;
  IF target_office = 'chair' THEN
    SELECT option.basis INTO derived FROM hall.meeting_chair_handover_options(target_meeting) option
    WHERE option.council_member = target_member;
  ELSE
    SELECT option.basis INTO derived FROM hall.meeting_secretary_handover_options(target_meeting) option
    WHERE option.council_member = target_member;
  END IF;
  INSERT INTO hall.meeting_officer_change(council_meeting, office, basis, council_member, observed_at)
  VALUES (target_meeting, target_office,
    coalesce(derived, CASE target_office WHEN 'chair' THEN 'councilDesignation' ELSE 'councilNomination' END::hall.meeting_officer_basis),
    target_member, observation_time)
  RETURNING * INTO change;
  RETURN change;
END $$;
