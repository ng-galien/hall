-- Council agenda read and action surface
-- ======================================
--
-- Agenda projections contain only council identities and lifecycle facts.
-- Documentary resources are fetched independently through their own API.

-- @functional-requirement HALL-FR-WSP-060 COUNCIL_AGENDA_PROJECTION_IS_SCOPED:
CREATE FUNCTION hall.council_agenda_item_projection(target hall.council_agenda_item)
RETURNS JSONB
LANGUAGE sql
STABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog
AS $function$
  SELECT jsonb_build_object(
    'id', target.id,
    'councilBusinessId', target.council_business,
    'councilMeetingId', target.council_meeting,
    'position', target.position,
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
        'content', (SELECT coalesce(
          (SELECT document #>> '{resource,content}' FROM hall.council_meeting_snapshot snapshot, jsonb_array_elements(snapshot.payload->'documents') document
            WHERE snapshot.council_meeting = target.council_meeting AND snapshot.phase = 'closing' AND document #>> '{resource,id}' = workspace.text_resource::TEXT),
          text.content)
          FROM hall.council_decision_proposal_workspace workspace JOIN hall.text_resource text ON text.id = workspace.text_resource
          WHERE workspace.council_decision_proposal = target.council_decision_proposal)
      )
      ELSE jsonb_build_object(
        'kind', 'openQuestion',
        'id', target.open_question
      )
    END,
    'startedAt', target.started_at,
    'completedAt', target.completed_at,
    'adjournedAt', target.adjourned_at
  )
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

-- @functional-requirement HALL-FR-MIN-150 MEETING_NOTES_REMAIN_EDITABLE_UNTIL_CLOSURE:
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
      hall.council_agenda_item_projection(agenda_item)
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
$function$;

-- @functional-requirement HALL-FR-WSP-170 BUSINESS_AGENDA_HISTORY_IS_BULK_PROJECTED:
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

  SELECT coalesce(
    jsonb_agg(
      hall.council_agenda_item_projection(agenda_item)
      ORDER BY meeting.number, abs(agenda_item.position), agenda_item.id
    ),
    '[]'::jsonb
  )
  INTO result
  FROM hall.council_agenda_item AS agenda_item
  JOIN hall.council_meetings AS meeting
    ON meeting.id = agenda_item.council_meeting
  WHERE agenda_item.council_business = ANY(target_businesses);

  RETURN result;
END
$function$;

-- @functional-requirement HALL-FR-WSP-070 COUNCIL_AGENDA_ACTIONS_RETURN_THE_SCOPED_PROJECTION:
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

-- @functional-requirement HALL-FR-WSP-180 COUNCIL_BUSINESS_CREATION_AND_DECISION_PROGRAMMING_ARE_ATOMIC:
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

-- @functional-requirement HALL-FR-WSP-190 COUNCIL_BUSINESS_CREATION_AND_OPEN_QUESTION_PROGRAMMING_ARE_ATOMIC:
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

CREATE FUNCTION hall_api.complete_open_question(
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
  changed := hall.complete_open_question(target_agenda_item, completion_time);
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
