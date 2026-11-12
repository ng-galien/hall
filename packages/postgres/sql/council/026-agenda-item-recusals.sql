-- A recusal is an immutable declaration about one member and one occurrence.
-- Regulatory scope (versions 2025-12-24): CGCT L2131-11 first/last sentences;
-- L1111-6 I first paragraph, II and III. The second regime is explicitly
-- qualified, limited to the represented-body public-contract case and subject
-- to III exceptions. These two variants do not cover every legal impediment.
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053153029
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053153012
CREATE TYPE hall.recusal_legal_basis AS ENUM ('personalInterest', 'designatedRepresentativeConflict');

-- Product evidence: occurrence scope, immutable declaration, actor and copied
-- identity. CGCT L1111-13 paragraph 3 sentence 2 (2025-12-24) motivates prior
-- disclosure; it does not prescribe this table or its immutable lifecycle.
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053147122
-- @implements-requirement HALL-FR-AGI-370
CREATE TABLE hall.agenda_item_recusal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item UUID NOT NULL REFERENCES hall.council_agenda_item(id),
  council_member UUID NOT NULL REFERENCES hall.council_member(id),
  legal_basis hall.recusal_legal_basis NOT NULL,
  declared_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  recorded_by TEXT NOT NULL,
  member_name TEXT NOT NULL,
  UNIQUE(agenda_item, council_member)
);

CREATE FUNCTION hall.enforce_agenda_item_recusal()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE
  target_meeting UUID;
  item hall.council_agenda_item;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- @implements-requirement HALL-FR-AGI-430
    -- A withdrawal erases the declaration while the meeting is open and no
    -- ballot result is recorded for the occurrence.
    PERFORM 1 FROM hall.council_meetings meeting JOIN hall.council_agenda_item occurrence
      ON occurrence.council_meeting = meeting.id
      WHERE occurrence.id = OLD.agenda_item AND meeting.closed_at IS NULL FOR UPDATE OF meeting;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'HV239', MESSAGE = 'the recusal can no longer be withdrawn';
    END IF;
    PERFORM 1 FROM hall.council_agenda_item WHERE id = OLD.agenda_item FOR UPDATE;
    IF EXISTS(SELECT FROM hall.ballots WHERE council_agenda_item = OLD.agenda_item) THEN
      RAISE EXCEPTION USING ERRCODE = 'HV239', MESSAGE = 'the recusal can no longer be withdrawn';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE = 'HV231', MESSAGE = 'agenda item recusals are immutable';
  END IF;
  SELECT council_meeting INTO target_meeting FROM hall.council_agenda_item WHERE id = NEW.agenda_item;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV904', MESSAGE = 'unknown council agenda item';
  END IF;
  PERFORM 1 FROM hall.council_meetings WHERE id = target_meeting AND closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV232', MESSAGE = 'the agenda item cannot receive a recusal';
  END IF;
  -- Same occurrence lock as ballot creation and participation insertion.
  SELECT * INTO item FROM hall.council_agenda_item WHERE id = NEW.agenda_item FOR UPDATE;
  IF item.position < 0 OR item.completed_at IS NOT NULL OR item.adjourned_at IS NOT NULL
    OR EXISTS(SELECT FROM hall.ballots WHERE council_agenda_item = item.id)
  THEN
    RAISE EXCEPTION USING ERRCODE = 'HV232', MESSAGE = 'the agenda item cannot receive a recusal';
  END IF;
  -- The declared member must belong to this meeting's recorded attendance.
  IF NOT EXISTS(SELECT FROM hall.meeting_attendance
    WHERE council_meeting = target_meeting AND council_member = NEW.council_member)
  THEN
    RAISE EXCEPTION USING ERRCODE = 'HV233', MESSAGE = 'recusal requires a member declared in this meeting';
  END IF;
  -- @implements-requirement HALL-FR-AGI-420
  -- CGCT L2131-11 (2025-12-24) concerns taking part in the deliberation: only
  -- a member present or represented when the recusal is declared can recuse.
  IF NOT EXISTS(SELECT FROM hall.current_meeting_attendance(target_meeting) a
    WHERE a.council_member = NEW.council_member AND a.status IN ('present','represented'))
  THEN
    RAISE EXCEPTION USING ERRCODE = 'HV236', MESSAGE = 'a recusal requires a member present or represented';
  END IF;
  SELECT contact.first_name || ' ' || contact.last_name INTO NEW.member_name
  FROM hall.council_member member JOIN hall.contact contact ON contact.id = member.contact
  WHERE member.id = NEW.council_member;
  NEW.recorded_by := nullif(current_setting('hall.actor_id', true), '');
  NEW.recorded_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER agenda_item_recusal_enforce_lifecycle
BEFORE INSERT OR UPDATE OR DELETE ON hall.agenda_item_recusal
FOR EACH ROW EXECUTE FUNCTION hall.enforce_agenda_item_recusal();
CREATE TRIGGER agenda_item_recusal_reject_truncate
BEFORE TRUNCATE ON hall.agenda_item_recusal
FOR EACH STATEMENT EXECUTE FUNCTION hall.enforce_agenda_item_recusal();

CREATE FUNCTION hall.agenda_item_recusal_projection(target hall.agenda_item_recusal)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('id',target.id,'agendaItemId',target.agenda_item,
    'councilMemberId',target.council_member,'legalBasis',target.legal_basis,
    'declaredAt',target.declared_at,'recordedAt',target.recorded_at,
    'recordedBy',target.recorded_by,'memberName',target.member_name);
$$;

CREATE FUNCTION hall.agenda_item_attendance_is_eligible(target_item UUID, target_attendance UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT EXISTS (
    SELECT FROM hall.council_agenda_item item
    CROSS JOIN LATERAL hall.current_meeting_attendance(item.council_meeting) a
    LEFT JOIN LATERAL hall.current_meeting_attendance(item.council_meeting) holder ON holder.id=a.proxy_holder
    JOIN LATERAL (SELECT member_ids FROM hall.meeting_membership_record
      WHERE council_meeting=item.council_meeting ORDER BY observed_at DESC LIMIT 1) membership ON true
    WHERE item.id=target_item AND a.id=target_attendance AND a.council_member=ANY(membership.member_ids)
      AND (a.status='present' OR (a.status='represented' AND holder.status='present'
        AND holder.council_member=ANY(membership.member_ids)))
      AND NOT EXISTS (SELECT FROM hall.agenda_item_recusal r WHERE r.agenda_item=target_item
        AND (r.council_member=a.council_member OR r.council_member=holder.council_member))
  );
$$;

-- Regulatory: L2131-11 last sentence (2025-12-24) explicitly changes N only
-- for L1111-6 II. General exclusion from admissible presence is INTERPRETED
-- with CE 1983-01-19 n33241 (deliberation 36-79), not an explicit 2025 formula.
-- https://www.legifrance.gouv.fr/ceta/id/CETATEXT000007679121
-- No post-reform confirming decision was identified by the legal review.
-- @implements-requirement HALL-FR-MTG-280
-- This is an impact on recorded attendance, NOT an observation of the legal
-- membership denominator or of arrivals/departures during the meeting.
-- Actual discussion presence followed by a recorded departure permits only
-- explicit non-participation accounting; it never restores voting eligibility.
CREATE FUNCTION hall.agenda_item_attendance_has_recorded_departure(target_item UUID,target_attendance UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SET search_path=pg_catalog,hall AS $$
BEGIN
 RETURN EXISTS(SELECT FROM hall.council_agenda_item item
   JOIN hall.current_meeting_attendance(item.council_meeting) a ON a.id=target_attendance
   JOIN LATERAL (SELECT member_ids FROM hall.meeting_membership_record WHERE council_meeting=item.council_meeting ORDER BY observed_at DESC LIMIT 1) membership ON a.council_member=ANY(membership.member_ids)
   WHERE item.id=target_item AND a.status IN ('absent','excused') AND a.observed_at>=item.started_at
   AND NOT EXISTS(SELECT FROM hall.agenda_item_recusal WHERE agenda_item=item.id AND council_member=a.council_member)
   AND EXISTS(SELECT FROM hall.meeting_quorum_observation q WHERE q.agenda_item=item.id AND q.observed_at=item.started_at
     AND q.facts->'presentMemberIds' ? a.council_member::text)
);
END $$;

CREATE FUNCTION hall.agenda_item_recusal_state(target_item UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object(
    'recusals', coalesce((SELECT jsonb_agg(hall.agenda_item_recusal_projection(r) ORDER BY r.council_member)
      FROM hall.agenda_item_recusal r WHERE r.agenda_item = target_item), '[]'::jsonb),
    'eligibleParticipantAttendanceIds', coalesce((SELECT jsonb_agg(a.id ORDER BY a.id)
      FROM hall.meeting_attendance a WHERE hall.agenda_item_attendance_is_eligible(target_item, a.id)), '[]'::jsonb),
    'departedParticipantAttendanceIds', coalesce((SELECT jsonb_agg(a.id ORDER BY a.id)
      FROM hall.meeting_attendance a WHERE hall.agenda_item_attendance_has_recorded_departure(target_item,a.id)), '[]'::jsonb),
    'quorumImpact', jsonb_build_object(
      'excludedMemberIds', coalesce((SELECT jsonb_agg(r.council_member ORDER BY r.council_member)
        FROM hall.agenda_item_recusal r WHERE r.agenda_item = target_item), '[]'::jsonb),
      'denominatorReduction', (SELECT count(*) FROM hall.agenda_item_recusal r
        WHERE r.agenda_item = target_item AND r.legal_basis = 'designatedRepresentativeConflict'),
      'eligibleDeclaredPresentMemberIds', coalesce((SELECT jsonb_agg(a.council_member ORDER BY a.council_member)
        FROM hall.meeting_attendance a WHERE a.council_meeting = item.council_meeting AND a.status = 'present'
          AND NOT EXISTS(SELECT FROM hall.agenda_item_recusal r
            WHERE r.agenda_item = target_item AND r.council_member = a.council_member)), '[]'::jsonb)),
    'canRecordRecusal', item.position > 0 AND item.completed_at IS NULL AND item.adjourned_at IS NULL
      AND meeting.closed_at IS NULL AND NOT EXISTS(SELECT FROM hall.ballots WHERE council_agenda_item = item.id),
    'canWithdrawRecusal', meeting.closed_at IS NULL
      AND NOT EXISTS(SELECT FROM hall.ballots WHERE council_agenda_item = item.id)
      AND EXISTS(SELECT FROM hall.agenda_item_recusal r WHERE r.agenda_item = item.id)
  ) FROM hall.council_agenda_item item JOIN hall.council_meetings meeting ON meeting.id = item.council_meeting
  WHERE item.id = target_item;
$$;

CREATE FUNCTION hall.enforce_recusal_occurrence_meeting()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  IF NEW.council_meeting IS DISTINCT FROM OLD.council_meeting AND EXISTS (
    SELECT FROM hall.agenda_item_recusal WHERE agenda_item = OLD.id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV234', MESSAGE = 'an occurrence with recusals must remain in its meeting';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER council_agenda_item_preserve_recusal_meeting
BEFORE UPDATE ON hall.council_agenda_item
FOR EACH ROW EXECUTE FUNCTION hall.enforce_recusal_occurrence_meeting();
