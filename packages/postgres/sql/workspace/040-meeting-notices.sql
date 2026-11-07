-- The programmed points of the open revision, as an established revision records them.
CREATE FUNCTION hall.council_agenda_revision_agenda(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id, 'position', item.position,
    'agendaNumber', (SELECT agenda_number FROM hall.council_agenda_presentation_numbers(target_meeting) WHERE agenda_item = item.id),
    'kind', item.subject_kind,
    'title', hall.council_agenda_item_title(item)
  ) ORDER BY item.position), '[]'::JSONB)
  FROM hall.council_agenda_item item
  WHERE item.council_meeting = target_meeting AND item.position > 0;
$$;

-- Establishes the open revision: its points, date and location are recorded
-- and no longer change until the next revision is opened.
-- @implements-requirement HALL-FR-NOT-040
CREATE FUNCTION hall.establish_council_agenda_revision(meeting hall.council_meetings)
RETURNS hall.council_agenda_freeze LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, hall AS $$
DECLARE questions JSONB; established hall.council_agenda_freeze;
BEGIN
  IF meeting.started_at IS NOT NULL OR meeting.scheduled_at IS NULL
    OR meeting.location IS NULL OR btrim(meeting.location) = ''
    OR EXISTS (SELECT FROM hall.active_council_agenda_freeze WHERE council_meeting = meeting.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV803', MESSAGE = 'agenda revision establishment is unavailable';
  END IF;
  questions := hall.council_agenda_revision_agenda(meeting.id);
  IF jsonb_array_length(questions) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'HV803', MESSAGE = 'agenda revision establishment requires questions';
  END IF;
  -- The clock orders revisions established and reopened in one transaction.
  INSERT INTO hall.council_agenda_freeze(council_meeting, frozen_at, agenda, scheduled_at, location)
  VALUES (meeting.id, clock_timestamp(), questions, meeting.scheduled_at, meeting.location)
  RETURNING * INTO established;
  RETURN established;
END;
$$;

CREATE FUNCTION hall_api.freeze_council_agenda(target_meeting UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE meeting hall.council_meetings;
BEGIN
  SELECT * INTO meeting FROM hall.council_meetings WHERE id = target_meeting FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'HV901', MESSAGE = 'unknown council meeting'; END IF;
  PERFORM hall.establish_council_agenda_revision(meeting);
  RETURN hall.council_meeting_projection(meeting);
END;
$$;

CREATE FUNCTION hall_api.open_council_agenda_freeze(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object('councilMeetingId', council_meeting, 'frozenAt', frozen_at, 'agenda', agenda)
  FROM hall.active_council_agenda_freeze WHERE council_meeting = target_meeting;
$$;

CREATE FUNCTION hall_api.meeting_notice_facts(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT hall.meeting_notice_meeting_facts(target_meeting);
$$;

-- Facts a notice generated now would carry: those of the established revision,
-- or those of the open revision that the generation establishes.
CREATE FUNCTION hall_api.meeting_notice_draft_facts(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT coalesce(hall.meeting_notice_meeting_facts(target_meeting), (
    SELECT jsonb_build_object('id', meeting.id, 'number', meeting.number,
      'scheduledAt', meeting.scheduled_at, 'location', meeting.location,
      'agendaFrozenAt', statement_timestamp(), 'agenda', hall.council_agenda_revision_agenda(meeting.id))
    FROM hall.council_meetings meeting
    WHERE meeting.id = target_meeting AND meeting.started_at IS NULL AND meeting.scheduled_at IS NOT NULL
      AND meeting.location IS NOT NULL AND btrim(meeting.location) <> ''
      AND jsonb_array_length(hall.council_agenda_revision_agenda(meeting.id)) > 0));
$$;

CREATE FUNCTION hall.meeting_notice_projection(notice hall.meeting_notice)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object('id', notice.id, 'councilMeetingId', notice.council_meeting,
    'version', notice.version, 'generatedAt', notice.generated_at, 'documentId', notice.binary_object,
    'byteSize', bytes.byte_size, 'facts', notice.facts,
    'revision', hall.council_agenda_revision_number(revision), 'revisionEstablishedAt', revision.frozen_at)
  FROM hall.binary_object bytes, hall.council_agenda_freeze revision
  WHERE bytes.id = notice.binary_object AND revision.id = notice.agenda_freeze;
$$;
-- One notice per established revision: the last PDF generated under it.
-- @implements-requirement HALL-FR-NOT-100
CREATE FUNCTION hall_api.list_meeting_notices(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT coalesce(jsonb_agg(hall.meeting_notice_projection(latest.notice) ORDER BY latest.revision_at DESC), '[]'::JSONB)
  FROM (SELECT DISTINCT ON (notice.agenda_freeze) notice, revision.frozen_at AS revision_at
    FROM hall.meeting_notice notice JOIN hall.council_agenda_freeze revision ON revision.id = notice.agenda_freeze
    WHERE notice.council_meeting = target_meeting
    ORDER BY notice.agenda_freeze, notice.version DESC) latest;
$$;
CREATE FUNCTION hall_api.open_meeting_notice(target_notice UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT hall.meeting_notice_projection(notice) FROM hall.meeting_notice notice WHERE id = target_notice;
$$;

-- Generating the notice of an open revision establishes it in the same
-- transaction; under an established revision it adds a PDF version to it.
-- @implements-requirement HALL-FR-NOT-160
CREATE FUNCTION hall_api.generate_meeting_notice(target_meeting UUID, expected_facts JSONB, pdf_content BYTEA)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE meeting hall.council_meetings; binary_id UUID; notice hall.meeting_notice;
  revision hall.council_agenda_freeze; established_facts JSONB;
BEGIN
  SELECT * INTO meeting FROM hall.council_meetings WHERE id = target_meeting FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'HV901', MESSAGE = 'unknown council meeting'; END IF;
  -- @implements-requirement HALL-FR-NOT-060
  IF meeting.started_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV804', MESSAGE = 'notice generation requires an unstarted meeting';
  END IF;
  -- @implements-requirement HALL-FR-NOT-070
  IF pdf_content IS NULL OR octet_length(pdf_content) <= 5
    OR substring(pdf_content FROM 1 FOR 5) <> convert_to('%PDF-', 'UTF8') THEN
    RAISE EXCEPTION USING ERRCODE = 'HV806', MESSAGE = 'notice requires PDF content';
  END IF;
  SELECT * INTO revision FROM hall.active_council_agenda_freeze WHERE council_meeting = target_meeting;
  IF NOT FOUND THEN revision := hall.establish_council_agenda_revision(meeting); END IF;
  established_facts := hall.meeting_notice_meeting_facts(target_meeting);
  -- @implements-requirement HALL-TR-NOT-010
  IF (expected_facts->'meeting') - 'agendaFrozenAt' IS DISTINCT FROM established_facts - 'agendaFrozenAt' THEN
    RAISE EXCEPTION USING ERRCODE = 'HV805', MESSAGE = 'meeting facts changed during notice rendering';
  END IF;
  INSERT INTO hall.binary_object(content_sha256,media_type,byte_size,content)
  VALUES(encode(sha256(pdf_content),'hex'),'application/pdf',octet_length(pdf_content),pdf_content)
  ON CONFLICT(content_sha256) DO NOTHING;
  SELECT id INTO binary_id FROM hall.binary_object WHERE content_sha256 = encode(sha256(pdf_content),'hex');
  INSERT INTO hall.meeting_notice(council_meeting,version,binary_object,facts,agenda_freeze)
  SELECT target_meeting, coalesce(max(version),0)+1, binary_id,
    expected_facts || jsonb_build_object('meeting', established_facts), revision.id
  FROM hall.meeting_notice WHERE council_meeting = target_meeting RETURNING * INTO notice;
  RETURN hall.meeting_notice_projection(notice);
END;
$$;
CREATE FUNCTION hall_api.meeting_notice_content(target_notice UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object('contentBase64', encode(bytes.content,'base64'))
  FROM hall.meeting_notice notice JOIN hall.binary_object bytes ON bytes.id = notice.binary_object
  WHERE notice.id = target_notice;
$$;

-- @implements-requirement HALL-FR-NOT-100
CREATE FUNCTION hall_api.reopen_council_agenda(target_meeting UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE meeting hall.council_meetings; frozen_id UUID;
BEGIN
  SELECT * INTO meeting FROM hall.council_meetings WHERE id = target_meeting FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'HV901', MESSAGE = 'unknown council meeting'; END IF;
  SELECT id INTO frozen_id FROM hall.active_council_agenda_freeze WHERE council_meeting = target_meeting;
  IF meeting.started_at IS NOT NULL OR frozen_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'HV808', MESSAGE = 'agenda reopening is unavailable';
  END IF;
  INSERT INTO hall.council_agenda_reopening(agenda_freeze) VALUES(frozen_id);
  RETURN hall.council_meeting_projection(meeting);
END;
$$;

-- Brings the open revision back to the last established one: its programmed
-- points and their positions, its date and its location. A point of that
-- revision moved to another meeting cannot come back.
-- @implements-requirement HALL-FR-NOT-150
CREATE FUNCTION hall_api.reset_council_agenda_revision(target_meeting UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE meeting hall.council_meetings; revision hall.council_agenda_freeze; moved RECORD;
  item_ids UUID[]; final_positions INTEGER[]; temporary_offset INTEGER;
BEGIN
  SELECT * INTO meeting FROM hall.council_meetings WHERE id = target_meeting FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'HV901', MESSAGE = 'unknown council meeting'; END IF;
  SELECT * INTO revision FROM hall.council_agenda_freeze WHERE council_meeting = target_meeting
  ORDER BY frozen_at DESC, id DESC LIMIT 1;
  IF meeting.started_at IS NOT NULL OR revision.id IS NULL
    OR EXISTS (SELECT FROM hall.active_council_agenda_freeze WHERE council_meeting = target_meeting) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV812', MESSAGE = 'agenda revision reset is unavailable';
  END IF;
  SELECT entry->>'title' AS title, entry->>'id' AS id INTO moved
  FROM jsonb_array_elements(revision.agenda) WITH ORDINALITY AS points(entry, ordinal)
  LEFT JOIN hall.council_agenda_item item ON item.id = (entry->>'id')::UUID
  WHERE item.council_meeting IS DISTINCT FROM target_meeting
  ORDER BY ordinal LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'HV813', MESSAGE = format('agenda item %s is on another meeting', moved.id),
      DETAIL = moved.title;
  END IF;

  -- Points of the revision return to their positions. Every other occurrence
  -- is deprogrammed and keeps its absolute order, unless a point of the
  -- revision takes that order back.
  WITH points AS (
    SELECT (entry->>'id')::UUID AS id, (entry->>'position')::INTEGER AS final_position
    FROM jsonb_array_elements(revision.agenda) entry
  ), others AS (
    SELECT item.id, abs(item.position) AS absolute_position,
      abs(item.position) IN (SELECT final_position FROM points) AS taken
    FROM hall.council_agenda_item item
    WHERE item.council_meeting = target_meeting AND item.id NOT IN (SELECT id FROM points)
  ), base AS (
    SELECT greatest(coalesce((SELECT max(abs(position)) FROM hall.council_agenda_item WHERE council_meeting = target_meeting), 0),
      (SELECT max(final_position) FROM points)) AS value
  ), desired AS (
    SELECT id, final_position FROM points
    UNION ALL
    SELECT id, -absolute_position FROM others WHERE NOT taken
    UNION ALL
    SELECT others.id, -(base.value + row_number() OVER (ORDER BY others.absolute_position))::INTEGER
    FROM others CROSS JOIN base WHERE others.taken
  )
  SELECT array_agg(desired.id), array_agg(desired.final_position) INTO item_ids, final_positions
  FROM desired JOIN hall.council_agenda_item item ON item.id = desired.id
  WHERE item.position <> desired.final_position;

  IF item_ids IS NOT NULL THEN
    -- The minutes approval keeps absolute position one; every other changed
    -- occurrence passes through positions above the occupied range.
    SELECT coalesce(max(abs(position)), 0) + cardinality(item_ids) + 1 INTO temporary_offset
    FROM hall.council_agenda_item WHERE council_meeting = target_meeting;
    UPDATE hall.council_agenda_item item
    SET position = sign(item.position)::INTEGER * (temporary_offset + changed.ordinal::INTEGER)
    FROM unnest(item_ids) WITH ORDINALITY AS changed(id, ordinal)
    WHERE item.id = changed.id AND item.minutes_approval IS NULL;
    UPDATE hall.council_agenda_item item SET position = changed.final_position
    FROM unnest(item_ids, final_positions) AS changed(id, final_position)
    WHERE item.id = changed.id;
  END IF;

  IF revision.scheduled_at IS NOT NULL AND revision.location IS NOT NULL THEN
    PERFORM hall.schedule_council_meeting(target_meeting, revision.scheduled_at, revision.location);
  END IF;
  SELECT * INTO meeting FROM hall.council_meetings WHERE id = target_meeting;
  RETURN hall.council_meeting_projection(meeting);
END;
$$;
