-- Council agenda read and action surface
-- ======================================
--
-- Agenda projections contain only council identities and lifecycle facts.
-- Documentary resources are fetched independently through their own API.

-- @implements-requirement HALL-FR-AGI-390
-- Capabilities and explanations share the command authorities and are read-only.
CREATE FUNCTION hall.council_agenda_item_capabilities(target hall.council_agenda_item)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path=pg_catalog,hall AS $$
DECLARE meeting hall.council_meetings; voting BOOLEAN; facts JSONB; quorum_blockers JSONB:='[]';
  common JSONB:='[]'; start_blockers JSONB; review_blockers JSONB; adjourn_blockers JSONB;
  complete_blockers JSONB; notes_blockers JSONB:='[]'; earlier UUID; active UUID; existing_ballot hall.ballots;
  target_minutes UUID; blockers JSONB;
BEGIN
  SELECT * INTO meeting FROM hall.council_meetings WHERE id=target.council_meeting;
  voting:=target.minutes_approval IS NOT NULL OR target.council_decision_proposal IS NOT NULL;
  IF meeting.started_at IS NULL THEN common:=common||jsonb_build_array(jsonb_build_object('code','meetingNotStarted')); END IF;
  IF meeting.closed_at IS NOT NULL THEN common:=common||jsonb_build_array(jsonb_build_object('code','meetingClosed')); END IF;
  notes_blockers:=common;
  IF target.adjourned_at IS NOT NULL THEN common:=common||jsonb_build_array(jsonb_build_object('code','itemAdjourned'));
  ELSIF target.position<0 THEN common:=common||jsonb_build_array(jsonb_build_object('code','itemNotProgrammed')); END IF;
  IF target.completed_at IS NOT NULL THEN common:=common||jsonb_build_array(jsonb_build_object('code','itemCompleted')); END IF;
  IF voting AND meeting.started_at IS NOT NULL AND meeting.closed_at IS NULL AND target.position>0 AND target.completed_at IS NULL THEN
    BEGIN
      facts:=hall.calculate_meeting_quorum(meeting.id,target.id,clock_timestamp());
      IF facts->>'verdict'='notMet' THEN quorum_blockers:=jsonb_build_array(jsonb_build_object('code','quorumNotMet','presentCount',(facts->>'presentCount')::int,'requiredPresent',(facts->>'requiredPresent')::int)); END IF;
    EXCEPTION
      WHEN SQLSTATE 'HV140' THEN quorum_blockers:='[{"code":"membershipMissing"}]';
      WHEN SQLSTATE 'HV141' THEN quorum_blockers:='[{"code":"attendanceIncomplete"}]';
      WHEN SQLSTATE 'HV143' THEN quorum_blockers:='[{"code":"observationChronology"}]';
      WHEN SQLSTATE 'HV144' THEN quorum_blockers:='[{"code":"reconvocationPending"}]';
      WHEN SQLSTATE 'HV149' THEN quorum_blockers:='[{"code":"freshObservationsRequired"}]';
      -- @implements-requirement HALL-FR-ATT-150
      WHEN SQLSTATE 'HV150' THEN
        quorum_blockers:=jsonb_build_array(jsonb_build_object('code','attendanceOutsideMembership',
          'memberName',hall.meeting_attendance_outsider_name(meeting.id)));
    END;
  END IF;
  SELECT id INTO earlier FROM hall.council_agenda_item WHERE council_meeting=meeting.id AND position>0 AND completed_at IS NULL AND position<target.position ORDER BY position LIMIT 1;
  SELECT id INTO active FROM hall.council_agenda_item WHERE council_meeting=meeting.id AND position>0 AND started_at IS NOT NULL AND completed_at IS NULL AND id<>target.id LIMIT 1;
  SELECT * INTO existing_ballot FROM hall.ballots WHERE council_agenda_item=target.id LIMIT 1;
  start_blockers:=common||quorum_blockers;
  IF target.started_at IS NOT NULL THEN start_blockers:=start_blockers||'[{"code":"discussionAlreadyStarted"}]'::jsonb; END IF;
  IF earlier IS NOT NULL THEN start_blockers:=start_blockers||jsonb_build_array(jsonb_build_object('code','earlierAgendaItemPending','agendaItemId',earlier)); END IF;
  IF active IS NOT NULL AND active IS DISTINCT FROM earlier THEN start_blockers:=start_blockers||jsonb_build_array(jsonb_build_object('code','anotherDiscussionActive','agendaItemId',active)); END IF;
  review_blockers:=common||quorum_blockers;
  IF NOT voting THEN review_blockers:=review_blockers||'[{"code":"nonVotingSubject"}]'::jsonb; END IF;
  IF target.started_at IS NULL THEN review_blockers:=review_blockers||'[{"code":"discussionNotStarted"}]'::jsonb;
  ELSIF voting AND NOT EXISTS(SELECT FROM hall.meeting_quorum_observation observation WHERE observation.agenda_item=target.id AND observation.facts->>'verdict' IN ('met','exempt')) THEN review_blockers:=review_blockers||'[{"code":"discussionQuorumMissing"}]'::jsonb; END IF;
  IF existing_ballot.id IS NOT NULL THEN review_blockers:=review_blockers||jsonb_build_array(jsonb_build_object('code','ballotAlreadyExists','ballotId',existing_ballot.id)); END IF;
  -- @implements-requirement HALL-FR-BAL-340
  IF voting AND existing_ballot.id IS NULL AND meeting.started_at IS NOT NULL AND meeting.closed_at IS NULL
    AND target.position>0 AND target.completed_at IS NULL THEN
    review_blockers:=review_blockers||hall.agenda_item_ballot_officer_blockers(target.id);
  END IF;
  IF target.minutes_approval IS NOT NULL THEN
    SELECT minutes INTO target_minutes FROM hall.minutes_approval WHERE id=target.minutes_approval;
    IF NOT EXISTS(SELECT FROM hall.minutes_document WHERE minutes=target_minutes) THEN review_blockers:=review_blockers||jsonb_build_array(jsonb_build_object('code','minutesDocumentMissing','minutesId',target_minutes)); END IF;
  END IF;
  adjourn_blockers:=common;
  IF existing_ballot.id IS NOT NULL AND existing_ballot.completed_at IS NULL THEN adjourn_blockers:=adjourn_blockers||jsonb_build_array(jsonb_build_object('code','ballotInProgress','ballotId',existing_ballot.id)); END IF;
  complete_blockers:=common;
  IF target.started_at IS NULL THEN complete_blockers:=complete_blockers||'[{"code":"discussionNotStarted"}]'::jsonb; END IF;
  IF voting THEN complete_blockers:=complete_blockers||'[{"code":"votingSubjectRequiresBallot"}]'::jsonb; END IF;
  blockers:=jsonb_build_object('startDiscussion',start_blockers,'reviewBallot',review_blockers,'adjourn',adjourn_blockers,'complete',complete_blockers,'updateNotes',notes_blockers);
  RETURN jsonb_build_object('canStartDiscussion',jsonb_array_length(start_blockers)=0,'canReviewBallot',jsonb_array_length(review_blockers)=0,'conductBlockers',blockers);
END $$;

-- @implements-requirement HALL-FR-MIN-160
-- Reads the closing snapshot of a meeting once for a whole agenda list: the
-- presentation number of each item and the proposal text recorded at closure.
CREATE FUNCTION hall.council_agenda_presentation(target_meeting UUID)
RETURNS TABLE(item_id UUID, agenda_number INTEGER, recorded_proposal TEXT)
LANGUAGE sql STABLE SET search_path = pg_catalog, hall AS $function$
  SELECT numbers.agenda_item, numbers.agenda_number, recorded.content
  FROM hall.council_agenda_presentation_numbers(target_meeting) numbers
  LEFT JOIN (
    SELECT item->>'id' AS id, proposal->>'content' AS content
    FROM hall.council_meeting_snapshot snapshot,
      jsonb_array_elements(snapshot.payload->'agenda') item,
      jsonb_array_elements(snapshot.payload->'proposals') proposal
    WHERE snapshot.council_meeting = target_meeting AND snapshot.phase = 'closing'
      AND proposal->>'id' = item->>'council_decision_proposal'
  ) recorded ON recorded.id = numbers.agenda_item::TEXT;
$function$;

-- @implements-requirement HALL-FR-WSP-060
CREATE FUNCTION hall.council_agenda_item_presented_projection(
  target hall.council_agenda_item, agenda_number INTEGER, recorded_proposal TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT jsonb_build_object(
    'id', target.id,
    'title', hall.council_agenda_item_title(target),
    'councilBusinessId', target.council_business,
    'councilMeetingId', target.council_meeting,
    'position', target.position,
    'introducedAt', hall.council_agenda_introduced_at(target.council_meeting,target.id),
    'agendaNumber', agenda_number,
    'discussionSummary', target.discussion_summary,
    'subject', CASE
      WHEN target.minutes_approval IS NOT NULL THEN jsonb_build_object(
        'kind', 'minutesApproval',
        'id', target.minutes_approval,
        'minutesId', (SELECT minutes FROM hall.minutes_approval WHERE id = target.minutes_approval),
        'documentId', (SELECT document.id FROM hall.minutes_document document
          JOIN hall.minutes_approval approval ON approval.minutes = document.minutes WHERE approval.id = target.minutes_approval)
      )
      WHEN target.council_decision_proposal IS NOT NULL THEN jsonb_build_object(
        'kind', 'councilDecisionProposal',
         'id', target.council_decision_proposal,
        'textResourceId', (SELECT text_resource FROM hall.council_decision_proposal_workspace WHERE council_decision_proposal = target.council_decision_proposal),
        'content', (SELECT coalesce(recorded_proposal, text.content)
          FROM hall.council_decision_proposal_workspace workspace JOIN hall.text_resource text ON text.id = workspace.text_resource
          WHERE workspace.council_decision_proposal = target.council_decision_proposal)
      )
      ELSE jsonb_build_object(
        'kind', 'openQuestion',
        'id', target.open_question,
        'textResourceId', (SELECT text_resource FROM hall.open_question_workspace WHERE open_question=target.open_question),
        'content', (SELECT content FROM hall.open_question_workspace workspace JOIN hall.text_resource text ON text.id=workspace.text_resource WHERE workspace.open_question=target.open_question)
      )
    END,
    'startedAt', target.started_at,
    'completedAt', target.completed_at,
    'adjournedAt', target.adjourned_at
  ) || hall.council_agenda_item_capabilities(target)
$function$;

-- @implements-requirement HALL-FR-WSP-060
CREATE FUNCTION hall.council_agenda_item_projection(target hall.council_agenda_item)
RETURNS JSONB
LANGUAGE sql
STABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog
AS $function$
  SELECT hall.council_agenda_item_presented_projection(target, presented.agenda_number, presented.recorded_proposal)
  FROM (SELECT NULL) present
  LEFT JOIN hall.council_agenda_presentation(target.council_meeting) presented ON presented.item_id = target.id
$function$;

CREATE FUNCTION hall_api.open_council_agenda_item(target_agenda_item UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT hall.council_agenda_item_projection(agenda_item)
  FROM hall.council_agenda_item AS agenda_item
  WHERE agenda_item.id = target_agenda_item
$function$;

-- @implements-requirement HALL-FR-MIN-150
-- The agenda lifecycle trigger locks the meeting and rejects every edit after
-- closure. Notes are copied into the closure snapshot and initial minutes draft.
CREATE FUNCTION hall_api.update_council_agenda_item_notes(target_agenda_item UUID, notes TEXT)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
BEGIN
  UPDATE hall.council_agenda_item SET discussion_summary = notes WHERE id = target_agenda_item;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'HV904', MESSAGE = 'unknown council agenda item'; END IF;
  RETURN hall_api.open_council_agenda_item(target_agenda_item);
END;
$$;

CREATE FUNCTION hall_api.list_council_agenda(target_meeting UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
  SELECT coalesce(
    jsonb_agg(
      hall.council_agenda_item_presented_projection(agenda_item, presented.agenda_number, presented.recorded_proposal)
      ORDER BY abs(agenda_item.position), agenda_item.id
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT item.* FROM hall.council_agenda_item item
    WHERE item.council_meeting = target_meeting
      AND NOT EXISTS (SELECT FROM hall.council_meeting_snapshot snapshot WHERE snapshot.council_meeting = target_meeting AND snapshot.phase = 'closing')
    UNION ALL
    SELECT archived.* FROM hall.council_meeting_snapshot snapshot,
      LATERAL jsonb_populate_recordset(NULL::hall.council_agenda_item, snapshot.payload->'agenda') archived
    WHERE snapshot.council_meeting = target_meeting AND snapshot.phase = 'closing'
  ) AS agenda_item
  LEFT JOIN hall.council_agenda_presentation(target_meeting) presented ON presented.item_id = agenda_item.id
$function$;

-- @implements-requirement HALL-FR-WSP-170
-- The caller supplies the visible CouncilBusiness identities once. The result
-- remains a flat, lightweight AgendaItem projection that can be grouped by its
-- councilBusinessId without one query per affair.
CREATE FUNCTION hall_api.list_council_business_agenda_items(target_businesses UUID[])
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  result JSONB;
BEGIN
  IF target_businesses IS NULL
    OR cardinality(target_businesses) = 0
    OR cardinality(target_businesses) > 100
    OR (SELECT count(DISTINCT business_id) FROM unnest(target_businesses) AS requested(business_id))
      <> cardinality(target_businesses)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'HV607',
      MESSAGE = 'council business agenda history requires between one and one hundred unique business identities';
  END IF;

  WITH selected AS (
    SELECT agenda_item FROM hall.council_agenda_item AS agenda_item
    WHERE agenda_item.council_business = ANY(target_businesses)
  ), presented AS MATERIALIZED (
    SELECT presentation.* FROM (SELECT DISTINCT (agenda_item).council_meeting AS id FROM selected) meetings
    CROSS JOIN LATERAL hall.council_agenda_presentation(meetings.id) presentation
  )
  SELECT coalesce(
    jsonb_agg(
      hall.council_agenda_item_presented_projection(selected.agenda_item, presented.agenda_number, presented.recorded_proposal)
      ORDER BY meeting.number, abs((selected.agenda_item).position), (selected.agenda_item).id
    ),
    '[]'::jsonb
  )
  INTO result
  FROM selected
  JOIN hall.council_meetings AS meeting
    ON meeting.id = (selected.agenda_item).council_meeting
  LEFT JOIN presented ON presented.item_id = (selected.agenda_item).id;

  RETURN result;
END
$function$;

-- @implements-requirement HALL-FR-WSP-070
CREATE FUNCTION hall_api.schedule_council_decision_proposal(
  target_business UUID,
  target_meeting UUID,
  target_position INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  agenda_item_id UUID;
BEGIN
  agenda_item_id := hall.schedule_council_decision_proposal(
    target_business, target_meeting, target_position
  );
  RETURN hall_api.open_council_agenda_item(agenda_item_id);
END
$function$;

CREATE FUNCTION hall_api.schedule_open_question(
  target_business UUID,
  target_meeting UUID,
  target_position INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  agenda_item_id UUID;
BEGIN
  agenda_item_id := hall.schedule_open_question(target_business, target_meeting, target_position);
  RETURN hall_api.open_council_agenda_item(agenda_item_id);
END
$function$;

-- @implements-requirement HALL-FR-WSP-200
CREATE FUNCTION hall_api.create_and_schedule_council_decision_proposal(
  parent_path TEXT,
  business_name TEXT,
  report_name TEXT,
  report_content TEXT,
  target_meeting UUID,
  target_position INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  business_id UUID;
  agenda_item_id UUID;
BEGIN
  business_id := hall.create_council_business_workspace(
    parent_path, business_name, report_name, report_content
  );
  agenda_item_id := hall.schedule_council_decision_proposal(
    business_id, target_meeting, target_position
  );
  RETURN jsonb_build_object(
    'business', hall.council_business_workspace_projection(business_id),
    'agendaItem', hall_api.open_council_agenda_item(agenda_item_id)
  );
END
$function$;

-- @implements-requirement HALL-FR-WSP-210
CREATE FUNCTION hall_api.create_and_schedule_open_question(
  parent_path TEXT,
  business_name TEXT,
  report_name TEXT,
  report_content TEXT,
  target_meeting UUID,
  target_position INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  business_id UUID;
  agenda_item_id UUID;
BEGIN
  business_id := hall.create_council_business_workspace(
    parent_path, business_name, report_name, report_content
  );
  agenda_item_id := hall.schedule_open_question(
    business_id, target_meeting, target_position
  );
  RETURN jsonb_build_object(
    'business', hall.council_business_workspace_projection(business_id),
    'agendaItem', hall_api.open_council_agenda_item(agenda_item_id)
  );
END
$function$;

CREATE FUNCTION hall_api.deprogram_council_agenda_item(target_agenda_item UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.council_agenda_item;
BEGIN
  changed := hall.deprogram_council_agenda_item(target_agenda_item);
  RETURN hall.council_agenda_item_projection(changed);
END
$function$;

CREATE FUNCTION hall_api.reprogram_council_agenda_item(
  target_agenda_item UUID,
  target_meeting UUID,
  target_position INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.council_agenda_item;
BEGIN
  changed := hall.reprogram_council_agenda_item(
    target_agenda_item, target_meeting, target_position
  );
  RETURN hall.council_agenda_item_projection(changed);
END
$function$;

CREATE FUNCTION hall_api.reorder_council_agenda(
  target_meeting UUID,
  ordered_agenda_items UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall, hall_api
AS $function$
BEGIN
  PERFORM hall.reorder_council_agenda(target_meeting, ordered_agenda_items);
  RETURN hall_api.list_council_agenda(target_meeting);
END
$function$;

CREATE FUNCTION hall_api.start_council_agenda_item(
  target_agenda_item UUID,
  start_time TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.council_agenda_item;
BEGIN
  changed := hall.start_council_agenda_item(target_agenda_item, start_time);
  RETURN hall.council_agenda_item_projection(changed);
END
$function$;

CREATE FUNCTION hall_api.complete_non_voting_agenda_item(
  target_agenda_item UUID,
  completion_time TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, hall
AS $function$
DECLARE
  changed hall.council_agenda_item;
BEGIN
  changed := hall.complete_non_voting_agenda_item(target_agenda_item, completion_time);
  RETURN hall.council_agenda_item_projection(changed);
END
$function$;

CREATE FUNCTION hall_api.adjourn_council_agenda_item(target_agenda_item UUID, adjournment_time TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
DECLARE changed hall.council_agenda_item;
BEGIN
  changed := hall.adjourn_council_agenda_item(target_agenda_item, adjournment_time);
  RETURN hall.council_agenda_item_projection(changed);
END;
$$;

-- @implements-requirement HALL-FR-BAL-140
-- The participant state carries the ballot chair, the chair in office, which
-- the client displays and never chooses.
CREATE FUNCTION hall_api.agenda_item_recusals(target_item UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
  SELECT hall.agenda_item_recusal_state(target_item)
    || jsonb_build_object('agendaItem', hall.council_agenda_item_projection(item),
      'ballotChair', hall.agenda_item_ballot_chair(item.id))
  FROM hall.council_agenda_item item WHERE item.id = target_item;
$$;

CREATE FUNCTION hall_api.record_agenda_item_recusal(target_item UUID, target_member UUID,
  declared_basis TEXT, declaration_time TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, hall AS $$
BEGIN
  INSERT INTO hall.agenda_item_recusal(agenda_item,council_member,legal_basis,declared_at)
  VALUES(target_item,target_member,declared_basis::hall.recusal_legal_basis,declaration_time);
  RETURN hall_api.agenda_item_recusals(target_item);
END;
$$;
