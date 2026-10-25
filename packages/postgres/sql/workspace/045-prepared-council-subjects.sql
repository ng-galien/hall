-- A prepared subject owns its content and business before any meeting inscription.
CREATE FUNCTION hall.enforce_prepared_subject_identity()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,hall AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.council_business IS DISTINCT FROM OLD.council_business THEN
    RAISE EXCEPTION USING ERRCODE='HV809', MESSAGE='prepared subject identity and business are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER council_proposal_identity BEFORE UPDATE ON hall.council_decision_proposal
FOR EACH ROW EXECUTE FUNCTION hall.enforce_prepared_subject_identity();
CREATE TRIGGER open_question_identity BEFORE UPDATE ON hall.open_question
FOR EACH ROW EXECUTE FUNCTION hall.enforce_prepared_subject_identity();

CREATE VIEW hall.prepared_council_subject AS
SELECT subject.id, 'councilDecisionProposal'::TEXT kind, subject.council_business, workspace.text_resource
FROM hall.council_decision_proposal subject JOIN hall.council_decision_proposal_workspace workspace ON workspace.council_decision_proposal=subject.id
UNION ALL
SELECT subject.id, 'openQuestion'::TEXT kind, subject.council_business, workspace.text_resource
FROM hall.open_question subject JOIN hall.open_question_workspace workspace ON workspace.open_question=subject.id;

CREATE FUNCTION hall.prepared_council_subject_projection(target_id UUID, target_kind TEXT)
RETURNS JSONB LANGUAGE sql STABLE SET search_path=pg_catalog,hall AS $$
  SELECT jsonb_build_object(
    'kind', subject.kind,
    'councilBusinessId', subject.council_business,
    'createdAt', content_resource.created_at,
    'title', content_resource.name,
    'folderPath', folder.full_path,
    'reportResourceId', business.report_resource,
    'content', content.content,
    'id', subject.id,
    'textResourceId', subject.text_resource,
    'agenda', jsonb_build_object(
      'state', CASE
        WHEN agenda_item.id IS NULL THEN 'notScheduled'
        WHEN agenda_item.completed_at IS NOT NULL THEN 'examined'
        WHEN agenda_item.adjourned_at IS NOT NULL THEN 'adjourned'
        WHEN agenda_item.started_at IS NOT NULL THEN 'started'
        ELSE 'scheduled'
      END,
      'agendaItemId', agenda_item.id,
      'meeting', CASE WHEN agenda_item.id IS NULL THEN NULL ELSE jsonb_build_object(
        'reference', CASE
          WHEN agenda_item.meeting_scheduled_at IS NULL THEN agenda_item.meeting_id::TEXT
          ELSE to_char(agenda_item.meeting_scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') || '-' || lpad(agenda_item.meeting_number::TEXT, greatest(3, length(agenda_item.meeting_number::TEXT)), '0')
        END,
        'number', agenda_item.meeting_number,
        'scheduledAt', agenda_item.meeting_scheduled_at,
        'startedAt', agenda_item.meeting_started_at
      ) END
    ),
    'scheduleTarget', CASE WHEN agenda_item.id IS NULL AND schedule_target.id IS NOT NULL THEN jsonb_build_object(
      'meetingReference', CASE
        WHEN schedule_target.scheduled_at IS NULL THEN schedule_target.id::TEXT
        ELSE to_char(schedule_target.scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') || '-' || lpad(schedule_target.number::TEXT, greatest(3, length(schedule_target.number::TEXT)), '0')
      END,
      'position', schedule_target.next_position
    ) ELSE NULL END
  )
  FROM hall.prepared_council_subject AS subject
  JOIN hall.council_business_workspace AS business ON business.council_business = subject.council_business
  JOIN hall.resource AS folder ON folder.id = business.folder_resource
  JOIN hall.resource AS content_resource ON content_resource.id = subject.text_resource
  JOIN hall.text_resource AS content ON content.id = subject.text_resource
  LEFT JOIN LATERAL (
    SELECT item.id, item.started_at, item.completed_at, item.adjourned_at, meeting.id AS meeting_id, meeting.number AS meeting_number, meeting.scheduled_at AS meeting_scheduled_at, meeting.started_at AS meeting_started_at
    FROM hall.council_agenda_item AS item
    JOIN hall.council_meetings AS meeting ON meeting.id = item.council_meeting
    WHERE item.position > 0
      AND item.subject_kind::TEXT = subject.kind
      AND (item.council_decision_proposal = subject.id OR item.open_question = subject.id)
    ORDER BY (meeting.closed_at IS NULL AND NOT meeting.stale) DESC, meeting.number DESC, item.id DESC
    LIMIT 1
  ) AS agenda_item ON true
  LEFT JOIN LATERAL (
    SELECT meeting.*, coalesce(max(item.position), 0) + 1 AS next_position
    FROM hall.council_meetings AS meeting
    LEFT JOIN hall.council_agenda_item AS item ON item.council_meeting = meeting.id AND item.position > 0
    WHERE meeting.closed_at IS NULL
      AND NOT meeting.stale
      AND meeting.started_at IS NULL
      AND NOT EXISTS (SELECT FROM hall.active_council_agenda_freeze AS frozen WHERE frozen.council_meeting = meeting.id)
    GROUP BY meeting.id
    ORDER BY meeting.number DESC, meeting.id DESC
    LIMIT 1
  ) AS schedule_target ON true
  WHERE subject.id = target_id AND subject.kind = target_kind;
$$;
CREATE FUNCTION hall_api.list_prepared_council_subjects(target_meeting UUID DEFAULT NULL, target_business UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
  SELECT coalesce(jsonb_agg(hall.prepared_council_subject_projection(subject.id,subject.kind) ORDER BY content_resource.created_at DESC, subject.id DESC),'[]'::JSONB)
  FROM hall.prepared_council_subject subject
  JOIN hall.resource content_resource ON content_resource.id=subject.text_resource
  WHERE (target_business IS NULL OR subject.council_business=target_business)
  AND (target_meeting IS NULL OR EXISTS (SELECT FROM hall.council_meetings meeting WHERE meeting.id=target_meeting
    AND meeting.closed_at IS NULL AND NOT meeting.stale AND meeting.started_at IS NULL
    AND NOT EXISTS(SELECT FROM hall.active_council_agenda_freeze WHERE council_meeting=target_meeting)))
  AND NOT EXISTS(SELECT FROM hall.council_agenda_item item WHERE item.council_meeting=target_meeting AND item.position>0
    AND item.subject_kind::TEXT=subject.kind AND (item.council_decision_proposal=subject.id OR item.open_question=subject.id));
$$;
CREATE FUNCTION hall_api.open_prepared_council_subject(target_id UUID,target_kind TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
  SELECT hall.prepared_council_subject_projection(target_id,target_kind);
$$;
-- @implements-requirement HALL-FR-BUS-060
CREATE FUNCTION hall_api.create_prepared_council_subject(target_business UUID,target_kind TEXT,subject_name TEXT,subject_content TEXT)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
DECLARE subject_id UUID:=gen_random_uuid(); resource_id UUID;
BEGIN
  IF target_kind='councilDecisionProposal' THEN
    INSERT INTO hall.council_decision_proposal(id,council_business) VALUES(subject_id,target_business);
  ELSIF target_kind='openQuestion' THEN
    INSERT INTO hall.open_question(id,council_business) VALUES(subject_id,target_business);
  ELSE RAISE EXCEPTION USING ERRCODE='HV910',MESSAGE='unknown prepared subject kind'; END IF;
  SELECT text_resource INTO resource_id FROM hall.prepared_council_subject WHERE id=subject_id AND kind=target_kind;
  -- Authorized by the calling command; the subject text lives in its common affair folder.
  PERFORM hall.relocate_resource(resource_id,(SELECT path FROM hall.resource WHERE id=resource_id),subject_name);
  PERFORM hall.update_text_resource(resource_id,1,subject_content,'{}'::UUID[]);
  RETURN hall.prepared_council_subject_projection(subject_id,target_kind);
END;
$$;

CREATE FUNCTION hall.council_agenda_subject_rank(kind hall.council_agenda_subject_kind)
RETURNS INTEGER LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
  SELECT CASE kind WHEN 'minutesApproval' THEN 0 WHEN 'councilDecisionProposal' THEN 1
    WHEN 'openQuestion' THEN 2 END;
$$;

-- @implements-requirement HALL-FR-AGI-380
CREATE FUNCTION hall_api.schedule_prepared_council_subject(target_meeting UUID,target_subject UUID,target_kind TEXT,target_position INTEGER)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
DECLARE meeting hall.council_meetings; subject hall.prepared_council_subject; existing UUID; shifted RECORD;
  item_id UUID:=gen_random_uuid(); minimum_position INTEGER; maximum_position INTEGER;
BEGIN
  PERFORM hall.assert_programmed_council_agenda_position(target_position);
  SELECT * INTO meeting FROM hall.council_meetings WHERE id=target_meeting FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='HV901',MESSAGE='unknown meeting'; END IF;
  IF meeting.closed_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE = 'HV223',MESSAGE='a closed council meeting cannot receive agenda changes'; END IF;
  IF meeting.started_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='HV810',MESSAGE='prepared subjects require an unstarted meeting'; END IF;
  IF EXISTS(SELECT FROM hall.active_council_agenda_freeze WHERE council_meeting=target_meeting) THEN
    RAISE EXCEPTION USING ERRCODE='HV801',MESSAGE='the frozen agenda cannot be recomposed';
  END IF;
  SELECT * INTO subject FROM hall.prepared_council_subject WHERE id=target_subject AND kind=target_kind;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='HV910',MESSAGE='unknown prepared subject'; END IF;
  IF EXISTS(SELECT FROM hall.council_agenda_item item WHERE item.completed_at IS NOT NULL
    AND item.subject_kind::TEXT=target_kind
    AND (item.council_decision_proposal=target_subject OR item.open_question=target_subject)) THEN
    RAISE EXCEPTION USING ERRCODE='HV810',MESSAGE='an examined prepared subject cannot be inscribed again';
  END IF;
  SELECT id INTO existing FROM hall.council_agenda_item WHERE council_meeting=target_meeting
    AND subject_kind::TEXT=target_kind AND (council_decision_proposal=target_subject OR open_question=target_subject);
  IF existing IS NOT NULL AND EXISTS(SELECT FROM hall.council_agenda_item WHERE id=existing AND (position>0 OR started_at IS NOT NULL OR adjourned_at IS NOT NULL)) THEN
    RAISE EXCEPTION USING ERRCODE='HV810',MESSAGE='subject is already inscribed or examined in this meeting';
  END IF;
  SELECT coalesce(max(position)+1,1) INTO minimum_position FROM hall.council_agenda_item
    WHERE council_meeting=target_meeting AND position>0 AND id IS DISTINCT FROM existing
      AND hall.council_agenda_subject_rank(subject_kind)<hall.council_agenda_subject_rank(target_kind::hall.council_agenda_subject_kind);
  SELECT min(position) INTO maximum_position FROM hall.council_agenda_item
    WHERE council_meeting=target_meeting AND position>0 AND id IS DISTINCT FROM existing
      AND hall.council_agenda_subject_rank(subject_kind)>hall.council_agenda_subject_rank(target_kind::hall.council_agenda_subject_kind);
  target_position:=greatest(minimum_position,least(target_position,coalesce(maximum_position,target_position)));
  IF existing IS NOT NULL THEN
    UPDATE hall.council_agenda_item SET position=-(SELECT coalesce(max(abs(position)),0)+2 FROM hall.council_agenda_item WHERE council_meeting=target_meeting) WHERE id=existing;
  END IF;
  FOR shifted IN SELECT id,position FROM hall.council_agenda_item
    WHERE council_meeting=target_meeting AND abs(position)>=target_position AND id IS DISTINCT FROM existing
    ORDER BY abs(position) DESC FOR UPDATE LOOP
    UPDATE hall.council_agenda_item SET position=sign(shifted.position)*(abs(shifted.position)+1) WHERE id=shifted.id;
  END LOOP;
  IF existing IS NOT NULL THEN
    UPDATE hall.council_agenda_item SET position=target_position WHERE id=existing;
    item_id:=existing;
  ELSE
    INSERT INTO hall.council_agenda_item(id,council_business,council_meeting,position,council_decision_proposal,open_question)
    VALUES(item_id,subject.council_business,target_meeting,target_position,
      CASE WHEN target_kind='councilDecisionProposal' THEN target_subject END,
      CASE WHEN target_kind='openQuestion' THEN target_subject END);
  END IF;
  RETURN hall_api.open_council_agenda_item(item_id);
END;
$$;

CREATE FUNCTION hall_api.add_open_question(target_meeting UUID,parent_path TEXT,question_name TEXT,question_content TEXT)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,hall AS $$
DECLARE meeting hall.council_meetings; business_id UUID; question_id UUID; item_id UUID:=gen_random_uuid(); target_position INTEGER;
BEGIN
  SELECT * INTO meeting FROM hall.council_meetings WHERE id=target_meeting FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='HV901',MESSAGE='unknown council meeting'; END IF;
  IF jsonb_array_length(hall.council_meeting_action_blockers(meeting)->'addAgendaItem')>0 THEN
    RAISE EXCEPTION USING ERRCODE='HV235',MESSAGE='an open question addition requires an ongoing meeting';
  END IF;
  business_id:=hall.create_council_business_workspace(parent_path,question_name,question_name||' (report)','');
  question_id:=(hall_api.create_prepared_council_subject(business_id,'openQuestion',question_name,question_content)->>'id')::uuid;
  SELECT coalesce(max(abs(position)),0)+1 INTO target_position FROM hall.council_agenda_item WHERE council_meeting=target_meeting;
  INSERT INTO hall.council_agenda_addition(agenda_item,council_meeting) VALUES(item_id,target_meeting);
  INSERT INTO hall.council_agenda_item(id,council_business,council_meeting,position,open_question)
  VALUES(item_id,business_id,target_meeting,target_position,question_id);
  SET CONSTRAINTS council_agenda_addition_validate IMMEDIATE;
  SET CONSTRAINTS council_agenda_addition_validate DEFERRED;
  RETURN hall_api.open_council_agenda_item(item_id);
END;
$$;
