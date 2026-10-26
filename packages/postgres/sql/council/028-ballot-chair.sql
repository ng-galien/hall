-- Ballot chair and officer events
-- ==============================
--
-- Regulatory basis (versions in force on 2026-10-26):
-- CGCT L2121-20 (2025-12-24): on an equal division, except in a secret ballot,
-- the voice of the chair prevails.
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053152931
-- CGCT L2121-14 (2026-01-01): chair of the meeting; elected chair and mayor
-- withdrawn at the vote for the single financial statement.
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051731835
-- CGCT L2131-11 (2025-12-24): an interested member takes no part in the
-- deliberation, therefore does not chair the item.
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053153029

-- @implements-requirement HALL-FR-BAL-140
-- The statutory replacement of a recused chair for one item: the first present
-- deputy in the order of nominations who is neither the chair nor recused.
-- NULL when no deputy is present or when several present deputies have no
-- known rank, in which case the council designates the item chair.
CREATE FUNCTION hall.agenda_item_statutory_chair_replacement(target_item UUID)
RETURNS UUID LANGUAGE plpgsql STABLE SET search_path = pg_catalog, hall AS $$
DECLARE item hall.council_agenda_item; chair UUID; deputies UUID[];
BEGIN
  SELECT * INTO item FROM hall.council_agenda_item WHERE id = target_item;
  chair := hall.current_meeting_officer(item.council_meeting, 'chair');
  deputies := hall.first_deputies_in_nomination_order(ARRAY(
    SELECT present.council_member FROM hall.meeting_present_mandates(item.council_meeting) present
    WHERE present.role = 'deputyMayor' AND present.council_member IS DISTINCT FROM chair
      AND NOT EXISTS (SELECT FROM hall.agenda_item_recusal r WHERE r.agenda_item = target_item AND r.council_member = present.council_member)));
  RETURN CASE WHEN cardinality(deputies) = 1 THEN deputies[1] END;
END $$;

-- @implements-requirement HALL-FR-BAL-140
-- @implements-requirement HALL-FR-BAL-330
-- The ballot chair is determined, never chosen: the chair elected or
-- designated for this item, otherwise the chair in office, otherwise, when
-- the chair in office is recused on this item, the statutory replacement.
CREATE FUNCTION hall.agenda_item_ballot_chair(target_item UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = pg_catalog, hall AS $$
DECLARE item hall.council_agenda_item; presidency hall.meeting_officer_change;
  chair UUID; member UUID; basis TEXT;
BEGIN
  SELECT * INTO item FROM hall.council_agenda_item WHERE id = target_item;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV904', MESSAGE = 'unknown council agenda item';
  END IF;
  SELECT * INTO presidency FROM hall.meeting_officer_change WHERE agenda_item = target_item;
  IF presidency.id IS NOT NULL THEN
    member := presidency.council_member; basis := presidency.basis::TEXT;
  ELSE
    chair := hall.current_meeting_officer(item.council_meeting, 'chair');
    IF chair IS NOT NULL AND NOT EXISTS (SELECT FROM hall.agenda_item_recusal r
      WHERE r.agenda_item = target_item AND r.council_member = chair) THEN
      member := chair; basis := 'meetingChair';
    ELSIF chair IS NOT NULL THEN
      member := hall.agenda_item_statutory_chair_replacement(target_item);
      basis := CASE WHEN member IS NOT NULL THEN 'statutoryReplacement' END;
    END IF;
  END IF;
  RETURN jsonb_build_object('councilMemberId', member, 'basis', basis,
    'meetingAttendanceId', (SELECT a.id FROM hall.meeting_attendance a WHERE a.council_meeting = item.council_meeting AND a.council_member = member),
    'physicallyPresent', member IS NOT NULL AND hall.meeting_member_is_physically_present(item.council_meeting, member));
END $$;

-- @implements-requirement HALL-FR-BAL-340
-- A ballot needs the person chairing it and the secretary in office
-- physically present.
CREATE FUNCTION hall.agenda_item_ballot_officer_blockers(target_item UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = pg_catalog, hall AS $$
DECLARE item hall.council_agenda_item; chair JSONB; secretary UUID; blockers JSONB := '[]';
BEGIN
  SELECT * INTO item FROM hall.council_agenda_item WHERE id = target_item;
  chair := hall.agenda_item_ballot_chair(target_item);
  IF chair->>'councilMemberId' IS NULL THEN
    blockers := blockers || '[{"code":"ballotChairUndetermined"}]'::jsonb;
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
  IF blockers @> '[{"code":"ballotChairUndetermined"}]' THEN
    RAISE EXCEPTION USING ERRCODE = 'HV410', MESSAGE = 'the ballot chair cannot be determined; the council designates the chair of this item';
  END IF;
  IF jsonb_array_length(blockers) > 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'HV415', MESSAGE = 'the ballot chair and the meeting secretary must be physically present';
  END IF;
  RETURN (hall.agenda_item_ballot_chair(target_item)->>'meetingAttendanceId')::UUID;
END $$;

-- @implements-requirement HALL-FR-BAL-330
-- Item presidency: an elected chair for the single financial statement, or a
-- chair designated by the council when the chair in office is recused and no
-- deputy can be determined.
CREATE FUNCTION hall.agenda_item_presidency_options(target_item UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = pg_catalog, hall AS $$
DECLARE item hall.council_agenda_item; meeting hall.council_meetings; available BOOLEAN; chair UUID;
BEGIN
  SELECT * INTO item FROM hall.council_agenda_item WHERE id = target_item;
  SELECT * INTO meeting FROM hall.council_meetings WHERE id = item.council_meeting;
  available := meeting.started_at IS NOT NULL AND meeting.closed_at IS NULL AND item.position > 0
    AND item.completed_at IS NULL AND item.adjourned_at IS NULL AND item.council_decision_proposal IS NOT NULL
    AND NOT EXISTS (SELECT FROM hall.ballots WHERE council_agenda_item = target_item)
    AND NOT EXISTS (SELECT FROM hall.meeting_officer_change WHERE agenda_item = target_item);
  chair := hall.current_meeting_officer(item.council_meeting, 'chair');
  RETURN jsonb_build_object(
    'financialStatementElection', CASE WHEN available THEN coalesce((SELECT jsonb_agg(present.council_member ORDER BY present.council_member)
      FROM hall.meeting_present_mandates(item.council_meeting) present
      WHERE present.role <> 'mayor'
        AND NOT EXISTS (SELECT FROM hall.agenda_item_recusal r WHERE r.agenda_item = target_item AND r.council_member = present.council_member)), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'councilDesignation', CASE WHEN available AND chair IS NOT NULL
      AND EXISTS (SELECT FROM hall.agenda_item_recusal r WHERE r.agenda_item = target_item AND r.council_member = chair)
      AND hall.agenda_item_statutory_chair_replacement(target_item) IS NULL
      THEN coalesce((SELECT jsonb_agg(present.council_member ORDER BY present.council_member)
      FROM hall.meeting_present_mandates(item.council_meeting) present
      WHERE present.council_member <> chair
        AND NOT EXISTS (SELECT FROM hall.agenda_item_recusal r WHERE r.agenda_item = target_item AND r.council_member = present.council_member)), '[]'::jsonb)
      ELSE '[]'::jsonb END);
END $$;

-- @implements-requirement HALL-FR-MTG-330
-- @implements-requirement HALL-FR-MTG-340
-- @implements-requirement HALL-FR-BAL-330
CREATE FUNCTION hall.enforce_meeting_officer_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE meeting hall.council_meetings; item hall.council_agenda_item; options JSONB;
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
  IF NEW.agenda_item IS NULL THEN
    IF NOT EXISTS (
      SELECT FROM hall.meeting_chair_handover_options(meeting.id) option
      WHERE NEW.office = 'chair' AND option.council_member = NEW.council_member AND option.basis = NEW.basis
      UNION ALL
      SELECT FROM hall.meeting_secretary_handover_options(meeting.id) option
      WHERE NEW.office = 'secretary' AND option.council_member = NEW.council_member AND option.basis = NEW.basis)
    THEN
      RAISE EXCEPTION USING ERRCODE = 'HV127',
        MESSAGE = format('%s cannot take over the %s of the meeting on this basis', coalesce(NEW.member_name, NEW.council_member::TEXT), NEW.office);
    END IF;
  ELSE
    SELECT * INTO item FROM hall.council_agenda_item WHERE id = NEW.agenda_item FOR UPDATE;
    IF item.council_meeting IS DISTINCT FROM meeting.id THEN
      RAISE EXCEPTION USING ERRCODE = 'HV129', MESSAGE = 'the agenda item does not belong to the meeting';
    END IF;
    options := hall.agenda_item_presidency_options(item.id);
    IF NOT coalesce(options->NEW.basis::TEXT, '[]'::jsonb) ? NEW.council_member::TEXT THEN
      RAISE EXCEPTION USING ERRCODE = 'HV129',
        MESSAGE = format('%s cannot chair this item on this basis', coalesce(NEW.member_name, NEW.council_member::TEXT));
    END IF;
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

-- Named actions: the basis of a meeting-wide change is derived from the
-- statutory options, so the caller names only the office and the member.
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

CREATE FUNCTION hall.record_agenda_item_presidency(target_item UUID, target_member UUID,
  target_basis hall.meeting_officer_basis, observation_time TIMESTAMPTZ)
RETURNS hall.meeting_officer_change LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, hall AS $$
DECLARE change hall.meeting_officer_change; target_meeting UUID;
BEGIN
  SELECT council_meeting INTO target_meeting FROM hall.council_agenda_item WHERE id = target_item;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV904', MESSAGE = 'unknown council agenda item';
  END IF;
  IF target_basis NOT IN ('financialStatementElection', 'councilDesignation') THEN
    RAISE EXCEPTION USING ERRCODE = 'HV129', MESSAGE = 'an item presidency is an election or a council designation';
  END IF;
  INSERT INTO hall.meeting_officer_change(council_meeting, agenda_item, office, basis, council_member, observed_at)
  VALUES (target_meeting, target_item, 'chair', target_basis, target_member, observation_time)
  RETURNING * INTO change;
  RETURN change;
END $$;
