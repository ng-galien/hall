-- Meeting officers during conduct
-- ==============================
--
-- Regulatory basis (versions in force on 2026-10-26):
-- CGCT L2121-14 (2026-01-01): the council is chaired by the mayor and, failing
-- him, by his replacement.
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051731835
-- CGCT L2122-17 (1996-02-24): the mayor is replaced by a deputy in the order
-- of nominations and, failing a deputy, by a councillor designated by the
-- council.
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006389936
-- CGCT L2121-15 (2022-07-01): the council appoints its secretary among its
-- members.
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044190488
CREATE TYPE hall.meeting_office AS ENUM ('chair', 'secretary');
CREATE TYPE hall.meeting_officer_basis AS ENUM (
  'mayor',
  'deputyInNominationOrder',
  'councilDesignation',
  'councilNomination'
);

-- @implements-requirement HALL-FR-MTG-330
-- @implements-requirement HALL-FR-MTG-340
-- One immutable, timestamped handover recorded in the handover form. It
-- changes the officer in office for the rest of the meeting.
CREATE TABLE hall.meeting_officer_change (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  council_meeting UUID NOT NULL REFERENCES hall.council_meetings(id),
  office hall.meeting_office NOT NULL,
  basis hall.meeting_officer_basis NOT NULL,
  council_member UUID NOT NULL REFERENCES hall.council_member(id),
  member_name TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  recorded_by TEXT NOT NULL,
  CONSTRAINT "meeting_officer_change_basis_matches_office" CHECK (office = 'secretary'::hall.meeting_office AND basis = 'councilNomination'::hall.meeting_officer_basis OR office = 'chair'::hall.meeting_office AND (basis = ANY (ARRAY['mayor'::hall.meeting_officer_basis, 'deputyInNominationOrder'::hall.meeting_officer_basis, 'councilDesignation'::hall.meeting_officer_basis])))
);
CREATE UNIQUE INDEX meeting_officer_change_one_change_per_instant
  ON hall.meeting_officer_change USING btree (council_meeting, office, observed_at);

-- The officer in office: the latest handover, otherwise the officer designated
-- before opening.
CREATE FUNCTION hall.current_meeting_officer(target_meeting UUID, target_office hall.meeting_office)
RETURNS UUID LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT coalesce(
    (SELECT change.council_member FROM hall.meeting_officer_change change
      WHERE change.council_meeting = target_meeting AND change.office = target_office
      ORDER BY change.observed_at DESC, change.recorded_at DESC LIMIT 1),
    (SELECT CASE target_office WHEN 'chair' THEN meeting.chair_member ELSE meeting.secretary_member END
      FROM hall.council_meetings meeting WHERE meeting.id = target_meeting));
$$;

CREATE FUNCTION hall.meeting_member_is_physically_present(target_meeting UUID, target_member UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT EXISTS (SELECT FROM hall.current_meeting_attendance(target_meeting) attendance
    WHERE attendance.council_member = target_member AND attendance.status = 'present');
$$;

-- Present members with their mandate role and rank.
CREATE FUNCTION hall.meeting_present_mandates(target_meeting UUID)
RETURNS TABLE(council_member UUID, role hall.council_role, rank INTEGER)
LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT member.id, member.role, member.rank
  FROM hall.current_meeting_attendance(target_meeting) attendance
  JOIN hall.council_member member ON member.id = attendance.council_member
  WHERE attendance.status = 'present';
$$;

-- @implements-requirement HALL-FR-MTG-330
-- Members the handover form accepts as chair: every physically present member
-- other than the chair in office who is not recused on the agenda item in
-- discussion. The basis records the mandate: the mayor resuming, the deputy
-- proposed by default, or another member designated by the council.
CREATE FUNCTION hall.meeting_chair_handover_options(target_meeting UUID)
RETURNS TABLE(council_member UUID, basis hall.meeting_officer_basis)
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, hall AS $$
DECLARE current_chair UUID := hall.current_meeting_officer(target_meeting, 'chair');
  proposed UUID := hall.meeting_proposed_chair(target_meeting);
BEGIN
  RETURN QUERY SELECT present.council_member,
      CASE WHEN present.role = 'mayor' THEN 'mayor'
        WHEN present.council_member = proposed THEN 'deputyInNominationOrder'
        ELSE 'councilDesignation' END::hall.meeting_officer_basis
    FROM hall.meeting_present_mandates(target_meeting) present
    WHERE present.council_member IS DISTINCT FROM current_chair
      AND NOT EXISTS (SELECT FROM hall.agenda_item_recusal recusal
        JOIN hall.council_agenda_item item ON item.id = recusal.agenda_item
        WHERE item.council_meeting = target_meeting AND item.position > 0 AND item.started_at IS NOT NULL
          AND item.completed_at IS NULL AND recusal.council_member = present.council_member);
END $$;

-- @implements-requirement HALL-FR-MTG-330
-- The default proposal of the handover form: the first present deputy by rank
-- who is neither the chair in office nor recused on the item in discussion;
-- none when no such deputy has a known rank.
CREATE FUNCTION hall.meeting_proposed_chair(target_meeting UUID)
RETURNS UUID LANGUAGE plpgsql STABLE SET search_path = pg_catalog, hall AS $$
BEGIN
  RETURN (SELECT present.council_member FROM hall.meeting_present_mandates(target_meeting) present
  WHERE present.role = 'deputyMayor' AND present.rank IS NOT NULL
    AND present.council_member IS DISTINCT FROM hall.current_meeting_officer(target_meeting, 'chair')
    AND NOT EXISTS (SELECT FROM hall.agenda_item_recusal recusal
      JOIN hall.council_agenda_item item ON item.id = recusal.agenda_item
      WHERE item.council_meeting = target_meeting AND item.position > 0 AND item.started_at IS NOT NULL
        AND item.completed_at IS NULL AND recusal.council_member = present.council_member)
  ORDER BY present.rank LIMIT 1);
END $$;

-- @implements-requirement HALL-FR-MTG-340
CREATE FUNCTION hall.meeting_secretary_handover_options(target_meeting UUID)
RETURNS TABLE(council_member UUID, basis hall.meeting_officer_basis)
LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT present.council_member, 'councilNomination'::hall.meeting_officer_basis
  FROM hall.meeting_present_mandates(target_meeting) present
  WHERE present.council_member IS DISTINCT FROM hall.current_meeting_officer(target_meeting, 'secretary');
$$;

CREATE FUNCTION hall.meeting_officer_handover_options(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object(
    'chair', coalesce((SELECT jsonb_agg(jsonb_build_object('councilMemberId', option.council_member, 'basis', option.basis)
      ORDER BY option.basis, option.council_member) FROM hall.meeting_chair_handover_options(target_meeting) option), '[]'::jsonb),
    'secretary', coalesce((SELECT jsonb_agg(jsonb_build_object('councilMemberId', option.council_member, 'basis', option.basis)
      ORDER BY option.council_member) FROM hall.meeting_secretary_handover_options(target_meeting) option), '[]'::jsonb),
    'proposedChairMemberId', hall.meeting_proposed_chair(target_meeting));
$$;

CREATE FUNCTION hall.meeting_officer_change_json(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', change.id, 'councilMeetingId', change.council_meeting,
    'office', change.office, 'basis', change.basis,
    'councilMemberId', change.council_member, 'memberName', change.member_name, 'observedAt', change.observed_at,
    'recordedAt', change.recorded_at, 'recordedBy', change.recorded_by)
    ORDER BY change.observed_at, change.recorded_at, change.id), '[]'::jsonb)
  FROM hall.meeting_officer_change change WHERE change.council_meeting = target_meeting;
$$;
