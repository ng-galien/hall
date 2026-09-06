CREATE FUNCTION hall_api.freeze_council_agenda(target_meeting UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE meeting hall.council_meetings; questions JSONB;
BEGIN
  SELECT * INTO meeting FROM hall.council_meetings WHERE id = target_meeting FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'HV901', MESSAGE = 'unknown council meeting'; END IF;
  -- @functional-requirement HALL-FR-NOT-040 AGENDA_FREEZE_REQUIRES_A_PROGRAMMED_PREPARATION:
  IF meeting.started_at IS NOT NULL OR meeting.scheduled_at IS NULL
    OR EXISTS (SELECT FROM hall.council_agenda_freeze WHERE council_meeting = target_meeting) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV803', MESSAGE = 'agenda freezing is unavailable';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id, 'position', item.position,
    'kind', CASE WHEN item.minutes_approval IS NOT NULL THEN 'minutesApproval'
      WHEN item.council_decision_proposal IS NOT NULL THEN 'councilDecisionProposal' ELSE 'openQuestion' END,
    'title', CASE WHEN item.minutes_approval IS NOT NULL THEN ''
      ELSE hall.resource_detail(workspace.folder_resource)->>'name' END
  ) ORDER BY item.position), '[]'::JSONB) INTO questions
  FROM hall.council_agenda_item item LEFT JOIN hall.council_business_workspace workspace
    ON workspace.council_business = item.council_business
  WHERE item.council_meeting = target_meeting AND item.position > 0;
  IF jsonb_array_length(questions) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'HV803', MESSAGE = 'agenda freezing requires questions';
  END IF;
  INSERT INTO hall.council_agenda_freeze(council_meeting, agenda) VALUES (target_meeting, questions);
  RETURN hall.council_meeting_projection(meeting);
END;
$$;

CREATE FUNCTION hall_api.open_council_agenda_freeze(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object('councilMeetingId', council_meeting, 'frozenAt', frozen_at, 'agenda', agenda)
  FROM hall.council_agenda_freeze WHERE council_meeting = target_meeting;
$$;

CREATE FUNCTION hall.meeting_notice_meeting_facts(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object('id', meeting.id, 'number', meeting.number,
    'scheduledAt', meeting.scheduled_at, 'location', meeting.location,
    'agendaFrozenAt', freeze.frozen_at, 'agenda', freeze.agenda)
  FROM hall.council_meetings meeting JOIN hall.council_agenda_freeze freeze ON freeze.council_meeting = meeting.id
  WHERE meeting.id = target_meeting;
$$;
CREATE FUNCTION hall_api.meeting_notice_facts(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT hall.meeting_notice_meeting_facts(target_meeting);
$$;

-- @functional-requirement HALL-FR-NOT-050 NOTICE_GENERATION_PERSISTS_A_VERSION_WITHOUT_TRANSMISSION:
-- This artifact records no sending, publication, receipt, or legal deadline.
CREATE TABLE hall.meeting_notice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  council_meeting UUID NOT NULL REFERENCES hall.council_meetings(id),
  version INTEGER NOT NULL CHECK (version > 0),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  binary_object UUID NOT NULL REFERENCES hall.binary_object(id),
  facts JSONB NOT NULL CHECK (jsonb_typeof(facts) = 'object'),
  UNIQUE(council_meeting,version)
);
CREATE TRIGGER meeting_notice_immutable BEFORE UPDATE OR DELETE ON hall.meeting_notice
FOR EACH ROW EXECUTE FUNCTION hall.reject_preparation_history_change();
CREATE TRIGGER meeting_notice_no_truncate BEFORE TRUNCATE ON hall.meeting_notice
FOR EACH STATEMENT EXECUTE FUNCTION hall.reject_preparation_history_change();

CREATE FUNCTION hall.meeting_notice_projection(notice hall.meeting_notice)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object('id', notice.id, 'councilMeetingId', notice.council_meeting,
    'version', notice.version, 'generatedAt', notice.generated_at, 'documentId', notice.binary_object,
    'byteSize', bytes.byte_size, 'facts', notice.facts,
    'isCurrent', notice.facts->'meeting' = hall.meeting_notice_meeting_facts(notice.council_meeting))
  FROM hall.binary_object bytes WHERE bytes.id = notice.binary_object;
$$;
CREATE FUNCTION hall_api.list_meeting_notices(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT coalesce(jsonb_agg(hall.meeting_notice_projection(notice) ORDER BY version DESC), '[]'::JSONB)
  FROM hall.meeting_notice notice WHERE council_meeting = target_meeting;
$$;
CREATE FUNCTION hall_api.open_meeting_notice(target_notice UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT hall.meeting_notice_projection(notice) FROM hall.meeting_notice notice WHERE id = target_notice;
$$;

CREATE FUNCTION hall_api.generate_meeting_notice(target_meeting UUID, expected_facts JSONB, pdf_content BYTEA)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE meeting hall.council_meetings; binary_id UUID; notice hall.meeting_notice;
BEGIN
  SELECT * INTO meeting FROM hall.council_meetings WHERE id = target_meeting FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'HV901', MESSAGE = 'unknown council meeting'; END IF;
  -- @functional-requirement HALL-FR-NOT-060 NOTICE_USES_A_FROZEN_AGENDA_BEFORE_MEETING_START:
  IF meeting.started_at IS NOT NULL OR NOT EXISTS (
    SELECT FROM hall.council_agenda_freeze WHERE council_meeting = target_meeting) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV804', MESSAGE = 'notice generation requires a frozen preparation';
  END IF;
  -- @technical-requirement HALL-TR-NOT-010 NOTICE_PERSISTENCE_CHECKS_THE_RENDERED_FACTS:
  IF expected_facts->'meeting' IS DISTINCT FROM hall.meeting_notice_meeting_facts(target_meeting) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV805', MESSAGE = 'meeting facts changed during notice rendering';
  END IF;
  -- @functional-requirement HALL-FR-NOT-070 NOTICE_REQUIRES_PDF_BYTES:
  IF pdf_content IS NULL OR octet_length(pdf_content) <= 5
    OR substring(pdf_content FROM 1 FOR 5) <> convert_to('%PDF-', 'UTF8') THEN
    RAISE EXCEPTION USING ERRCODE = 'HV806', MESSAGE = 'notice requires PDF content';
  END IF;
  INSERT INTO hall.binary_object(content_sha256,media_type,byte_size,content)
  VALUES(encode(sha256(pdf_content),'hex'),'application/pdf',octet_length(pdf_content),pdf_content)
  ON CONFLICT(content_sha256) DO NOTHING;
  SELECT id INTO binary_id FROM hall.binary_object WHERE content_sha256 = encode(sha256(pdf_content),'hex');
  INSERT INTO hall.meeting_notice(council_meeting,version,binary_object,facts)
  SELECT target_meeting, coalesce(max(version),0)+1, binary_id, expected_facts
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
