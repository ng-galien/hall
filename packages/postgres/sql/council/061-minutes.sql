-- Minutes owns editorial text alongside immutable observations. It never owns
-- a workspace folder, report resource, or CouncilBusiness.

CREATE FUNCTION hall.minutes_member_identity(target UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object('id', member.id, 'name', contact.first_name || ' ' || contact.last_name)
  FROM hall.council_member member JOIN hall.contact contact ON contact.id = member.contact
  WHERE member.id = target;
$$;

-- @implements-requirement HALL-FR-MIN-060
-- Names are copied now: later directory edits cannot rewrite a closed record.
CREATE FUNCTION hall.capture_minutes_facts(target_meeting UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $$
  SELECT jsonb_build_object(
    'meeting', jsonb_build_object(
      'id', meeting.id, 'number', meeting.number, 'scheduledAt', meeting.scheduled_at,
      'startedAt', meeting.started_at, 'closedAt', snapshot.captured_at,
      'location', meeting.location, 'quorum', (SELECT (facts->>'requiredPresent')::integer FROM hall.meeting_quorum_observation WHERE council_meeting=meeting.id AND agenda_item IS NULL ORDER BY observed_at LIMIT 1),
      'chair', hall.minutes_member_identity(meeting.chair_member),
      'secretary', hall.minutes_member_identity(meeting.secretary_member)
    ),
    'attendance', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', entry->>'id', 'member', hall.minutes_member_identity((entry->>'council_member')::UUID),
      'status', entry->>'status', 'proxyHolderId', entry->>'proxy_holder'
    ) ORDER BY entry->>'id') FROM jsonb_array_elements(snapshot.payload->'attendance') entry), '[]'::JSONB),
    -- Product evidence, not a literal requirement for a separate recusal
    -- section in CGCT L2121-15 paragraph 4 (version 2022-07-01).
    -- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044190488
    -- @implements-requirement HALL-FR-MIN-210
    'recusals', snapshot.payload->'recusals',
    'conduct', snapshot.payload->'conduct',
    'agenda', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', item->>'id', 'position', (item->>'position')::INTEGER,
      'agendaNumber', (SELECT agenda_number FROM hall.council_agenda_presentation_numbers(target_meeting) WHERE agenda_item = (item->>'id')::UUID),
      'title', CASE WHEN item->>'minutes_approval' IS NOT NULL THEN ''
        ELSE coalesce((SELECT business #>> '{folder,name}' FROM jsonb_array_elements(snapshot.payload->'businesses') business
          WHERE business->>'council_business' = item->>'council_business'), '') END,
      'report', coalesce((SELECT document #>> '{resource,content}'
        FROM jsonb_array_elements(snapshot.payload->'businesses') business
        JOIN jsonb_array_elements(snapshot.payload->'documents') document
          ON document #>> '{resource,id}' = business->>'report_resource'
        WHERE business->>'council_business' = item->>'council_business'), ''),
      'proposal', (SELECT proposal->>'content' FROM jsonb_array_elements(snapshot.payload->'proposals') proposal
        WHERE proposal->>'id' = item->>'council_decision_proposal'),
      'kind', CASE WHEN item->>'minutes_approval' IS NOT NULL THEN 'minutesApproval'
        WHEN item->>'council_decision_proposal' IS NOT NULL THEN 'councilDecisionProposal'
        WHEN item->>'open_question' IS NOT NULL THEN 'openQuestion' END,
      'startedAt', item->>'started_at', 'completedAt', item->>'completed_at', 'adjournedAt', item->>'adjourned_at'
    ) ORDER BY abs((item->>'position')::INTEGER)) FROM jsonb_array_elements(snapshot.payload->'agenda') item), '[]'::JSONB),
    'ballots', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', ballot->>'id', 'agendaItemId', ballot->>'council_agenda_item',
      'mode', ballot->>'mode', 'result', ballot->>'result', 'completedAt', ballot->>'completed_at',
      'nonParticipations', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'count',(n->>'count')::integer,'reason',n->>'reason',
        'member',CASE WHEN n->>'mode'='public' THEN (
          SELECT hall.minutes_member_identity((a->>'council_member')::uuid)
          FROM jsonb_array_elements(snapshot.payload->'participations') p
          JOIN jsonb_array_elements(snapshot.payload->'attendance') a ON a->>'id'=p->>'meeting_attendance'
          WHERE p->>'id'=n->>'ballot_participation') ELSE NULL END))
        FROM jsonb_array_elements(snapshot.payload->'nonParticipations') n WHERE n->>'ballot'=ballot->>'id'),'[]'::jsonb),
      'votes', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'choice', vote->>'choice', 'count', (vote->>'count')::INTEGER,
        'member', CASE WHEN vote->>'mode' = 'public' THEN (
          SELECT hall.minutes_member_identity((entry->>'council_member')::UUID)
          FROM jsonb_array_elements(snapshot.payload->'participations') participation
          JOIN jsonb_array_elements(snapshot.payload->'attendance') entry ON entry->>'id' = participation->>'meeting_attendance'
          WHERE participation->>'id' = vote->>'ballot_participation'
        ) ELSE NULL END
      ) ORDER BY vote->>'choice', vote->>'ballot_participation') FROM jsonb_array_elements(snapshot.payload->'votes') vote
        WHERE vote->>'ballot' = ballot->>'id'), '[]'::JSONB)
    ) ORDER BY ballot->>'id') FROM jsonb_array_elements(snapshot.payload->'ballots') ballot), '[]'::JSONB)
  ) FROM hall.council_meeting_snapshot snapshot JOIN hall.council_meetings meeting ON meeting.id = snapshot.council_meeting
  WHERE snapshot.council_meeting = target_meeting AND snapshot.phase = 'closing';
$$;

CREATE FUNCTION hall.enforce_minutes_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  -- @implements-requirement HALL-FR-MIN-070
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION USING ERRCODE = 'HV701', MESSAGE = 'minutes history cannot be deleted';
  END IF;
  -- @implements-requirement HALL-FR-MIN-080
  IF TG_OP = 'INSERT' THEN
    NEW.facts := hall.capture_minutes_facts(NEW.council_meeting);
    IF NEW.facts IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'HV702', MESSAGE = 'minutes requires a closing meeting snapshot';
    END IF;
    NEW.version := 1;
    NEW.created_at := transaction_timestamp();
    NEW.updated_at := NEW.created_at;
    RETURN NEW;
  END IF;
  -- @implements-requirement HALL-FR-MIN-090
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.council_meeting IS DISTINCT FROM OLD.council_meeting
    OR NEW.facts IS DISTINCT FROM OLD.facts OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING ERRCODE = 'HV703', MESSAGE = 'minutes facts and origin are immutable';
  END IF;
  -- @implements-requirement HALL-FR-MIN-100
  IF EXISTS (SELECT FROM hall.minutes_document WHERE minutes = OLD.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV704', MESSAGE = 'generated minutes cannot be edited';
  END IF;
  NEW.version := OLD.version + 1;
  NEW.updated_at := transaction_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER minutes_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON hall.minutes
FOR EACH ROW EXECUTE FUNCTION hall.enforce_minutes_lifecycle();
CREATE TRIGGER minutes_no_truncate BEFORE TRUNCATE ON hall.minutes
FOR EACH STATEMENT EXECUTE FUNCTION hall.enforce_minutes_lifecycle();

-- @implements-requirement HALL-FR-MIN-170
-- Section identity is its minutes and agenda occurrence. Ordering and titles
-- remain the immutable facts, rather than a second mutable editorial outline.
CREATE TABLE hall.minutes_section (
  minutes UUID NOT NULL REFERENCES hall.minutes(id),
  agenda_item UUID NOT NULL REFERENCES hall.council_agenda_item(id),
  content TEXT NOT NULL,
  PRIMARY KEY (minutes, agenda_item)
);

CREATE FUNCTION hall.enforce_minutes_section_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  -- @implements-requirement HALL-FR-MIN-180
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION USING ERRCODE = 'HV710', MESSAGE = 'minutes sections cannot be removed';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.minutes IS DISTINCT FROM OLD.minutes OR NEW.agenda_item IS DISTINCT FROM OLD.agenda_item) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV711', MESSAGE = 'minutes section identity is immutable';
  END IF;
  -- @implements-requirement HALL-FR-MIN-190
  PERFORM 1 FROM hall.minutes WHERE id = NEW.minutes FOR UPDATE;
  IF NOT EXISTS (SELECT FROM hall.minutes, jsonb_array_elements(facts->'agenda') item
    WHERE minutes.id = NEW.minutes AND item->>'id' = NEW.agenda_item::TEXT) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV712', MESSAGE = 'unknown minutes section';
  END IF;
  -- @implements-requirement HALL-TR-MIN-040
  -- Updating the parent invokes the existing freeze guard and increments its
  -- global version. Generation therefore observes all section edits atomically.
  IF TG_OP = 'UPDATE' THEN
    UPDATE hall.minutes SET version = version WHERE id = NEW.minutes;
  ELSIF EXISTS (SELECT FROM hall.minutes_document WHERE minutes = NEW.minutes) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV704', MESSAGE = 'generated minutes cannot be edited';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER minutes_section_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON hall.minutes_section
FOR EACH ROW EXECUTE FUNCTION hall.enforce_minutes_section_lifecycle();
CREATE TRIGGER minutes_section_no_truncate BEFORE TRUNCATE ON hall.minutes_section
FOR EACH STATEMENT EXECUTE FUNCTION hall.enforce_minutes_section_lifecycle();

CREATE FUNCTION hall.initialize_minutes_sections()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  -- @implements-requirement HALL-FR-MIN-200
  INSERT INTO hall.minutes_section(minutes, agenda_item, content)
  SELECT NEW.id, agenda_item.id, agenda_item.discussion_summary
  FROM jsonb_array_elements(NEW.facts->'agenda') item
  JOIN hall.council_agenda_item agenda_item ON agenda_item.id = (item->>'id')::UUID;
  RETURN NEW;
END;
$$;
CREATE TRIGGER minutes_initialize_sections AFTER INSERT ON hall.minutes
FOR EACH ROW EXECUTE FUNCTION hall.initialize_minutes_sections();

CREATE FUNCTION hall.enforce_minutes_document_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, hall AS $$
BEGIN
  -- @implements-requirement HALL-FR-MIN-110
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE = 'HV705', MESSAGE = 'generated minutes document is immutable';
  END IF;
  -- @implements-requirement HALL-TR-MIN-010
  PERFORM 1 FROM hall.minutes WHERE id = NEW.minutes FOR UPDATE;
  -- @implements-requirement HALL-FR-MIN-120
  IF NOT EXISTS (SELECT FROM hall.binary_object WHERE id = NEW.binary_object
    AND media_type = 'application/pdf' AND byte_size > 5 AND substring(content FROM 1 FOR 5) = convert_to('%PDF-', 'UTF8')) THEN
    RAISE EXCEPTION USING ERRCODE = 'HV706', MESSAGE = 'minutes document requires PDF content';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER minutes_document_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON hall.minutes_document
FOR EACH ROW EXECUTE FUNCTION hall.enforce_minutes_document_lifecycle();
CREATE TRIGGER minutes_document_no_truncate BEFORE TRUNCATE ON hall.minutes_document
FOR EACH STATEMENT EXECUTE FUNCTION hall.enforce_minutes_document_lifecycle();
