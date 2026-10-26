-- Meeting officers during conduct
-- ==============================
--
-- Regulatory basis (versions in force on 2026-10-26):
-- CGCT L2121-14 (2026-01-01): the council is chaired by the mayor and, failing
-- him, by his replacement; for the single financial statement the council
-- elects its chair and the mayor withdraws at the vote.
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051731835
-- CGCT L2122-17 (1996-02-24): the mayor is replaced by a deputy in the order
-- of nominations and, failing a deputy, by a councillor designated by the
-- council or taken in the order of the table.
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006389936
-- CGCT L2121-15 (2022-07-01): the council appoints its secretary among its
-- members.
-- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044190488
CREATE TYPE hall.meeting_office AS ENUM ('chair', 'secretary');
CREATE TYPE hall.meeting_officer_basis AS ENUM (
  'mayor',
  'deputyInNominationOrder',
  'councilDesignation',
  'councilNomination',
  'financialStatementElection'
);

-- @implements-requirement HALL-FR-MTG-330
-- @implements-requirement HALL-FR-MTG-340
-- @implements-requirement HALL-FR-BAL-330
-- One immutable, timestamped officer event. Without agenda item it changes
-- the officer in office for the rest of the meeting; with an agenda item it
-- records who chairs that single item.
CREATE TABLE hall.meeting_officer_change (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  council_meeting UUID NOT NULL REFERENCES hall.council_meetings(id),
  agenda_item UUID REFERENCES hall.council_agenda_item(id),
  office hall.meeting_office NOT NULL,
  basis hall.meeting_officer_basis NOT NULL,
  council_member UUID NOT NULL REFERENCES hall.council_member(id),
  member_name TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  recorded_by TEXT NOT NULL,
  CONSTRAINT "meeting_officer_change_basis_matches_scope" CHECK (office = 'secretary'::hall.meeting_office AND agenda_item IS NULL AND basis = 'councilNomination'::hall.meeting_officer_basis OR office = 'chair'::hall.meeting_office AND agenda_item IS NULL AND (basis = ANY (ARRAY['mayor'::hall.meeting_officer_basis, 'deputyInNominationOrder'::hall.meeting_officer_basis, 'councilDesignation'::hall.meeting_officer_basis])) OR office = 'chair'::hall.meeting_office AND agenda_item IS NOT NULL AND (basis = ANY (ARRAY['financialStatementElection'::hall.meeting_officer_basis, 'councilDesignation'::hall.meeting_officer_basis])))
);
CREATE UNIQUE INDEX meeting_officer_change_one_item_presidency
  ON hall.meeting_officer_change USING btree (agenda_item) WHERE (agenda_item IS NOT NULL);
CREATE UNIQUE INDEX meeting_officer_change_one_change_per_instant
  ON hall.meeting_officer_change USING btree (council_meeting, office, observed_at) WHERE (agenda_item IS NULL);

-- The officer in office: the latest meeting-wide change, otherwise the officer
-- designated before opening.
CREATE FUNCTION hall.current_meeting_officer(target_meeting UUID, target_office hall.meeting_office)
RETURNS UUID LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT coalesce(
    (SELECT change.council_member FROM hall.meeting_officer_change change
      WHERE change.council_meeting = target_meeting AND change.office = target_office AND change.agenda_item IS NULL
      ORDER BY change.observed_at DESC, change.recorded_at DESC LIMIT 1),
    (SELECT CASE target_office WHEN 'chair' THEN meeting.chair_member ELSE meeting.secretary_member END
      FROM hall.council_meetings meeting WHERE meeting.id = target_meeting));
$$;

CREATE FUNCTION hall.meeting_member_is_physically_present(target_meeting UUID, target_member UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT EXISTS (SELECT FROM hall.current_meeting_attendance(target_meeting) attendance
    WHERE attendance.council_member = target_member AND attendance.status = 'present');
$$;

-- Present members with their mandate role and rank, for statutory ordering.
CREATE FUNCTION hall.meeting_present_mandates(target_meeting UUID)
RETURNS TABLE(council_member UUID, role hall.council_role, rank INTEGER)
LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT member.id, member.role, member.rank
  FROM hall.current_meeting_attendance(target_meeting) attendance
  JOIN hall.council_member member ON member.id = attendance.council_member
  WHERE attendance.status = 'present';
$$;

-- Deputies taken in the order of nominations. A known rank orders them; when
-- no candidate deputy has a known rank, Hall cannot establish the order and
-- every candidate deputy remains admissible.
CREATE FUNCTION hall.first_deputies_in_nomination_order(candidates UUID[])
RETURNS UUID[] LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT CASE
    WHEN EXISTS (SELECT FROM hall.council_member WHERE id = ANY(candidates) AND role = 'deputyMayor' AND rank IS NOT NULL)
    THEN ARRAY(SELECT id FROM hall.council_member WHERE id = ANY(candidates) AND role = 'deputyMayor' AND rank IS NOT NULL
      ORDER BY rank LIMIT 1)
    ELSE ARRAY(SELECT id FROM hall.council_member WHERE id = ANY(candidates) AND role = 'deputyMayor' ORDER BY id)
  END;
$$;

-- @implements-requirement HALL-FR-MTG-330
-- Admissible replacements for the chair: the present mayor resuming, the first
-- present deputy in the order of nominations, and a present councillor only
-- when no deputy is present.
CREATE FUNCTION hall.meeting_chair_handover_options(target_meeting UUID)
RETURNS TABLE(council_member UUID, basis hall.meeting_officer_basis)
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, hall AS $$
DECLARE current_chair UUID := hall.current_meeting_officer(target_meeting, 'chair');
  deputies UUID[];
BEGIN
  RETURN QUERY SELECT present.council_member, 'mayor'::hall.meeting_officer_basis
    FROM hall.meeting_present_mandates(target_meeting) present
    WHERE present.role = 'mayor' AND present.council_member IS DISTINCT FROM current_chair;
  deputies := ARRAY(SELECT present.council_member FROM hall.meeting_present_mandates(target_meeting) present
    WHERE present.role = 'deputyMayor' AND present.council_member IS DISTINCT FROM current_chair);
  IF cardinality(deputies) > 0 THEN
    RETURN QUERY SELECT deputy, 'deputyInNominationOrder'::hall.meeting_officer_basis
      FROM unnest(hall.first_deputies_in_nomination_order(deputies)) deputy;
  ELSE
    RETURN QUERY SELECT present.council_member, 'councilDesignation'::hall.meeting_officer_basis
      FROM hall.meeting_present_mandates(target_meeting) present
      WHERE present.role = 'councillor' AND present.council_member IS DISTINCT FROM current_chair;
  END IF;
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
      ORDER BY option.council_member) FROM hall.meeting_secretary_handover_options(target_meeting) option), '[]'::jsonb));
$$;

CREATE FUNCTION hall.meeting_officer_change_json(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', change.id, 'councilMeetingId', change.council_meeting,
    'agendaItemId', change.agenda_item, 'office', change.office, 'basis', change.basis,
    'councilMemberId', change.council_member, 'memberName', change.member_name, 'observedAt', change.observed_at,
    'recordedAt', change.recorded_at, 'recordedBy', change.recorded_by)
    ORDER BY change.observed_at, change.recorded_at, change.id), '[]'::jsonb)
  FROM hall.meeting_officer_change change WHERE change.council_meeting = target_meeting;
$$;
