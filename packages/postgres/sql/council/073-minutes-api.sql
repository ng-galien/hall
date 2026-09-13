CREATE FUNCTION hall.minutes_summary(target hall.minutes)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object('id', target.id, 'councilMeetingId', target.council_meeting,
    'meetingNumber', (target.facts #>> '{meeting,number}')::INTEGER,
    'scheduledAt', target.facts #>> '{meeting,scheduledAt}',
    'createdAt', target.created_at, 'updatedAt', target.updated_at, 'version', target.version,
    'generatedAt', document.generated_at, 'documentId', document.id)
  FROM (SELECT 1) singleton LEFT JOIN hall.minutes_document document ON document.minutes = target.id;
$$;

CREATE FUNCTION hall_api.list_minutes()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT coalesce(jsonb_agg(hall.minutes_summary(minutes) ORDER BY (facts #>> '{meeting,number}')::INTEGER DESC), '[]'::JSONB)
  FROM hall.minutes;
$$;

CREATE FUNCTION hall_api.open_minutes(target_minutes UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT hall.minutes_summary(minutes) || jsonb_build_object('sections', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('agendaItemId', section.agenda_item, 'content', section.content)
      ORDER BY item.ordinality), '[]'::JSONB)
    FROM hall.minutes_section section JOIN jsonb_array_elements(minutes.facts->'agenda') WITH ORDINALITY item(value, ordinality)
      ON item.value->>'id' = section.agenda_item::TEXT WHERE section.minutes = minutes.id
  ), 'facts', facts || jsonb_build_object('agenda', (
    SELECT coalesce(jsonb_agg(item || jsonb_build_object(
      'introducedAt', hall.council_agenda_introduced_at(minutes.council_meeting, agenda_item.id),
      -- @functional-requirement HALL-FR-MIN-250 MINUTES_POINT_SEPARATES_SOURCE_VOTE_AND_EDITORIAL_TEXT:
      'discussionSummary', agenda_item.discussion_summary
    ) ORDER BY ordinal), '[]'::jsonb)
    FROM jsonb_array_elements(facts->'agenda') WITH ORDINALITY entry(item, ordinal)
    JOIN hall.council_agenda_item agenda_item ON agenda_item.id = (item->>'id')::UUID
  )))
  FROM hall.minutes WHERE id = target_minutes;
$$;

CREATE FUNCTION hall_api.update_minutes_draft(target_minutes UUID, expected_version INTEGER, target_agenda_item UUID, section_content TEXT)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE draft hall.minutes;
BEGIN
  -- @technical-requirement HALL-TR-MIN-020 DRAFT_WRITES_CHECK_THE_OBSERVED_VERSION:
  SELECT * INTO draft FROM hall.minutes WHERE id = target_minutes FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'HV707', MESSAGE = 'unknown minutes'; END IF;
  IF expected_version IS DISTINCT FROM draft.version THEN
    RAISE EXCEPTION USING ERRCODE = 'HV708', MESSAGE = 'minutes draft version conflict';
  END IF;
  UPDATE hall.minutes_section SET content = section_content WHERE minutes = target_minutes AND agenda_item = target_agenda_item;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'HV712', MESSAGE = 'unknown minutes section'; END IF;
  RETURN hall_api.open_minutes(target_minutes);
END;
$$;

CREATE FUNCTION hall_api.generate_minutes(target_minutes UUID, expected_version INTEGER, pdf_content BYTEA)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE draft hall.minutes; binary_id UUID;
BEGIN
  -- @technical-requirement HALL-TR-MIN-030 PDF_PUBLICATION_REQUIRES_THE_RENDERED_DRAFT_VERSION:
  -- PDF rendering occurs outside the transaction. Its observed version must
  -- still match before publishing bytes and freezing the draft atomically.
  SELECT * INTO draft FROM hall.minutes WHERE id = target_minutes FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'HV707', MESSAGE = 'unknown minutes'; END IF;
  IF expected_version IS DISTINCT FROM draft.version THEN
    RAISE EXCEPTION USING ERRCODE = 'HV708', MESSAGE = 'minutes draft version conflict';
  END IF;
  IF EXISTS (SELECT FROM hall.minutes_document WHERE minutes = target_minutes) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV704', MESSAGE = 'minutes has already been generated';
  END IF;
  INSERT INTO hall.binary_object(content_sha256, media_type, byte_size, content)
  VALUES (encode(sha256(pdf_content), 'hex'), 'application/pdf', octet_length(pdf_content), pdf_content)
  ON CONFLICT (content_sha256) DO NOTHING;
  SELECT id INTO binary_id FROM hall.binary_object WHERE content_sha256 = encode(sha256(pdf_content), 'hex');
  INSERT INTO hall.minutes_document(minutes, binary_object) VALUES (target_minutes, binary_id);
  RETURN hall_api.open_minutes(target_minutes);
END;
$$;

CREATE FUNCTION hall_api.minutes_content(target_minutes UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object('documentId', document.id, 'contentBase64', encode(bytes.content, 'base64'),
    'mediaType', bytes.media_type, 'byteSize', bytes.byte_size)
  FROM hall.minutes_document document JOIN hall.binary_object bytes ON bytes.id = document.binary_object
  WHERE document.minutes = target_minutes;
$$;

-- @functional-requirement HALL-FR-MIN-130 APPROVAL_BALLOT_REFERENCES_A_GENERATED_DOCUMENT:
CREATE FUNCTION hall.require_generated_minutes_for_ballot()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
DECLARE approval_id UUID;
BEGIN
  SELECT minutes_approval INTO approval_id FROM hall.council_agenda_item WHERE id = NEW.council_agenda_item;
  IF approval_id IS NOT NULL AND NOT EXISTS (
    SELECT FROM hall.minutes_approval approval JOIN hall.minutes_document document ON document.minutes = approval.minutes
    WHERE approval.id = approval_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV709', MESSAGE = 'minutes must be generated before its approval ballot';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ballot_requires_generated_minutes BEFORE INSERT ON hall.ballots
FOR EACH ROW EXECUTE FUNCTION hall.require_generated_minutes_for_ballot();
